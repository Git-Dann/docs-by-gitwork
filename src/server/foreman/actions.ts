/**
 * Foreman — per-finding resolution (dismiss / mute) so the daily audit is manageable.
 *
 * Findings are regenerated every run, so a resolution is keyed by the finding's stable `key`
 * (`${kind}:${subjectId}`) and applied at READ time — the Desk report + Settings list + the digest
 * notification all run findings through `findingState()`, so a dismiss/mute takes effect immediately
 * without waiting for the next run. The pure functions here are unit-tested; the DB helpers wrap them.
 *
 *   • mute     → hidden until un-muted (for stale/known noise like ancient imported milestones).
 *   • dismiss  → hidden while the finding's metric stays ≤ the metric it had when dismissed; if it
 *                WORSENS past that, it resurfaces so a real escalation is never silently lost.
 */

import { prisma } from "@/lib/prisma";

export type FindingActionKind = "mute" | "dismiss";
export type FindingState = "active" | "muted" | "dismissed";

export interface FindingAction {
  findingKey: string;
  action: FindingActionKind;
  dismissedMetric: number | null;
}

/** Pure: what a finding's current state is given its resolution (if any). */
export function findingState(
  finding: { key: string; metric: number },
  action: FindingAction | undefined,
): FindingState {
  if (!action) return "active";
  if (action.action === "mute") return "muted";
  // dismiss: resurface once the metric climbs past where it was dismissed.
  return finding.metric > (action.dismissedMetric ?? -Infinity) ? "active" : "dismissed";
}

export interface PartitionedFindings<T extends { key: string; metric: number }> {
  active: T[];
  dismissed: T[];
  muted: T[];
}

/** Pure: split findings into active / dismissed / muted by their resolutions. */
export function partitionFindings<T extends { key: string; metric: number }>(
  findings: T[],
  actionsByKey: Map<string, FindingAction>,
): PartitionedFindings<T> {
  const out: PartitionedFindings<T> = { active: [], dismissed: [], muted: [] };
  for (const f of findings) {
    const state = findingState(f, actionsByKey.get(f.key));
    if (state === "active") out.active.push(f);
    else if (state === "muted") out.muted.push(f);
    else out.dismissed.push(f);
  }
  return out;
}

/** Only the findings a viewer should currently see (the Desk / digest view). */
export function visibleFindings<T extends { key: string; metric: number }>(
  findings: T[],
  actionsByKey: Map<string, FindingAction>,
): T[] {
  return findings.filter((f) => findingState(f, actionsByKey.get(f.key)) === "active");
}

// ─── DB ──────────────────────────────────────────────────────────────────────

export async function listFindingActions(workspaceId: string): Promise<Map<string, FindingAction>> {
  const rows = await prisma.foremanFindingAction.findMany({
    where: { workspaceId },
    select: { findingKey: true, action: true, dismissedMetric: true },
  });
  const map = new Map<string, FindingAction>();
  for (const r of rows) {
    map.set(r.findingKey, {
      findingKey: r.findingKey,
      action: r.action === "mute" ? "mute" : "dismiss",
      dismissedMetric: r.dismissedMetric,
    });
  }
  return map;
}

/** Metric per finding key from the latest successful live run — the authoritative value a dismiss
 *  is pinned to (so the client can't spoof it). */
async function latestRunMetrics(workspaceId: string): Promise<Map<string, number>> {
  const run = await prisma.foremanRun.findFirst({
    where: { workspaceId, mode: "scan", status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { findings: true },
  });
  const map = new Map<string, number>();
  const arr = Array.isArray(run?.findings) ? (run!.findings as Array<{ key?: string; metric?: number }>) : [];
  for (const f of arr) if (typeof f?.key === "string") map.set(f.key, typeof f.metric === "number" ? f.metric : 0);
  return map;
}

/**
 * Apply an action to a set of finding keys (bulk-capable). `dismiss`/`mute` upsert one row per key;
 * `clear` deletes any resolution. Dismiss pins to the finding's current metric from the latest run.
 */
export async function applyFindingActions(
  workspaceId: string,
  input: { findingKeys: string[]; action: FindingActionKind | "clear"; actorId?: string | null },
): Promise<{ affected: number }> {
  const keys = [...new Set(input.findingKeys.filter((k) => typeof k === "string" && k.length > 0))];
  if (keys.length === 0) return { affected: 0 };

  if (input.action === "clear") {
    const res = await prisma.foremanFindingAction.deleteMany({
      where: { workspaceId, findingKey: { in: keys } },
    });
    return { affected: res.count };
  }

  const metrics = input.action === "dismiss" ? await latestRunMetrics(workspaceId) : null;
  let affected = 0;
  for (const findingKey of keys) {
    const dismissedMetric = input.action === "dismiss" ? (metrics!.get(findingKey) ?? 0) : null;
    await prisma.foremanFindingAction.upsert({
      where: { workspaceId_findingKey: { workspaceId, findingKey } },
      create: { workspaceId, findingKey, action: input.action, dismissedMetric, createdById: input.actorId ?? null },
      update: { action: input.action, dismissedMetric, createdById: input.actorId ?? null },
    });
    affected += 1;
  }
  return { affected };
}
