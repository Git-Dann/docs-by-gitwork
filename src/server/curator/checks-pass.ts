/**
 * Curator — Pulse-check usage aggregation + classification.
 *
 * Rolls up persisted `PulseScanCheck` rows (over a trailing window) into one `PulseCheckStat` per
 * check — the analytics that don't exist anywhere else. Classifies each registered check as:
 *   • "dead"        — registered but never emitted at all in the window (emit code unreached/broken)
 *   • "always_pass" — fired ≥ minFires and 100% PASS (low signal)
 *   • "noisy"       — fired ≥ minFires and 100% FAIL (mis-calibrated / always-red)
 * A check that only ever SKIPs is NOT flagged — that's legitimate platform/jurisdiction filtering.
 *
 * This is proposal-only material: disabling a check changes real scan output, so the curator never
 * auto-disables — it feeds candidates to the report/LLM for a human to approve.
 */

import { prisma } from "@/lib/prisma";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import type { CheckSignal } from "./types";

/** How far back to aggregate. */
export const CHECK_WINDOW_DAYS = 180;
/** Minimum evaluations before always_pass/noisy is trustworthy. */
export const MIN_FIRES = 5;

export interface CheckAggregate {
  checkKey: string;
  passCount: number;
  warnCount: number;
  failCount: number;
  skipCount: number;
  lastFiredAt: Date | null;
  lastNonPassAt: Date | null;
}

/**
 * Classify one check from its aggregate. Pure + DB-free (unit-testable). `registered` gates dead
 * detection — custom / unknown keys are never flagged.
 */
export function classifyCheck(
  a: Pick<CheckAggregate, "passCount" | "warnCount" | "failCount" | "skipCount">,
  registered: boolean,
  minFires: number = MIN_FIRES,
): CheckSignal | null {
  if (!registered) return null;
  const fires = a.passCount + a.warnCount + a.failCount;
  // Never evaluated and never even skipped → the check simply isn't running.
  if (fires === 0 && a.skipCount === 0) return "dead";
  // Only ever skipped → filtered out legitimately, not dead.
  if (fires === 0) return null;
  if (fires >= minFires) {
    if (a.passCount === fires) return "always_pass";
    if (a.failCount === fires) return "noisy";
  }
  return null;
}

export interface CheckCandidate {
  checkKey: string;
  label: string;
  signal: CheckSignal;
  fireCount: number;
  passRate: number; // 0..1 over evaluations (PASS / (PASS+WARN+FAIL)); 0 for dead
}

export interface ChecksPassResult {
  aggregated: number;
  deadChecks: number;
  alwaysPassChecks: number;
  noisyChecks: number;
  candidates: CheckCandidate[];
}

type StatusCount = { checkKey: string; status: string; _count: { _all: number }; _max: { createdAt: Date | null } };

/**
 * Aggregate + classify + upsert `PulseCheckStat` for a workspace. Writes nothing when `dryRun`.
 */
export async function runChecksPass(
  workspaceId: string,
  now: Date,
  dryRun: boolean,
): Promise<ChecksPassResult> {
  const since = new Date(now.getTime() - CHECK_WINDOW_DAYS * 86_400_000);

  const scans = await prisma.pulseScan.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { id: true },
  });
  const scanIds = scans.map((s) => s.id);

  // Fold (checkKey × status) group counts into per-check aggregates.
  const byKey = new Map<string, CheckAggregate>();
  if (scanIds.length > 0) {
    const grouped = (await prisma.pulseScanCheck.groupBy({
      by: ["checkKey", "status"],
      where: { scanId: { in: scanIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    })) as unknown as StatusCount[];

    for (const g of grouped) {
      const agg =
        byKey.get(g.checkKey) ??
        {
          checkKey: g.checkKey,
          passCount: 0,
          warnCount: 0,
          failCount: 0,
          skipCount: 0,
          lastFiredAt: null,
          lastNonPassAt: null,
        };
      const n = g._count._all;
      const at = g._max.createdAt ?? null;
      if (g.status === "PASS") agg.passCount += n;
      else if (g.status === "WARN") agg.warnCount += n;
      else if (g.status === "FAIL") agg.failCount += n;
      else if (g.status === "SKIPPED") agg.skipCount += n;

      // lastFiredAt tracks any non-skip evaluation; lastNonPassAt tracks WARN/FAIL.
      if (g.status !== "SKIPPED" && at && (!agg.lastFiredAt || at > agg.lastFiredAt)) agg.lastFiredAt = at;
      if ((g.status === "WARN" || g.status === "FAIL") && at && (!agg.lastNonPassAt || at > agg.lastNonPassAt)) {
        agg.lastNonPassAt = at;
      }
      byKey.set(g.checkKey, agg);
    }
  }

  // Build the full key set: everything in the registry (so dead checks surface) + any seen keys.
  const registeredKeys = new Set(CHECKS_REGISTRY.map((c) => c.key));
  const labelByKey = new Map(CHECKS_REGISTRY.map((c) => [c.key, c.label]));
  const allKeys = new Set<string>([...registeredKeys, ...byKey.keys()]);

  const candidates: CheckCandidate[] = [];
  let deadChecks = 0;
  let alwaysPassChecks = 0;
  let noisyChecks = 0;

  for (const key of allKeys) {
    const agg =
      byKey.get(key) ??
      { checkKey: key, passCount: 0, warnCount: 0, failCount: 0, skipCount: 0, lastFiredAt: null, lastNonPassAt: null };
    const registered = registeredKeys.has(key);
    const signal = classifyCheck(agg, registered);
    const fireCount = agg.passCount + agg.warnCount + agg.failCount;

    if (signal === "dead") deadChecks += 1;
    else if (signal === "always_pass") alwaysPassChecks += 1;
    else if (signal === "noisy") noisyChecks += 1;

    if (signal) {
      candidates.push({
        checkKey: key,
        label: labelByKey.get(key) ?? key,
        signal,
        fireCount,
        passRate: fireCount > 0 ? agg.passCount / fireCount : 0,
      });
    }

    if (!dryRun) {
      await prisma.pulseCheckStat.upsert({
        where: { workspaceId_checkKey: { workspaceId, checkKey: key } },
        create: {
          workspaceId,
          checkKey: key,
          fireCount,
          passCount: agg.passCount,
          warnCount: agg.warnCount,
          failCount: agg.failCount,
          skipCount: agg.skipCount,
          lastFiredAt: agg.lastFiredAt,
          lastNonPassAt: agg.lastNonPassAt,
          windowStart: since,
          windowEnd: now,
          signal: signal ?? null,
        },
        update: {
          fireCount,
          passCount: agg.passCount,
          warnCount: agg.warnCount,
          failCount: agg.failCount,
          skipCount: agg.skipCount,
          lastFiredAt: agg.lastFiredAt,
          lastNonPassAt: agg.lastNonPassAt,
          windowStart: since,
          windowEnd: now,
          signal: signal ?? null,
        },
      });
    }
  }

  return {
    aggregated: allKeys.size,
    deadChecks,
    alwaysPassChecks,
    noisyChecks,
    candidates,
  };
}
