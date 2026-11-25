/**
 * The AI budget: how much of it is spent, and telling Super Admins as it fills (§156, §159).
 *
 * Spend is ANTHROPIC'S OWN billed figure when an Anthropic Admin key is connected (Settings →
 * Dispatch): organisation-wide, because one prepaid credit pays for every key. Anthropic's
 * report stops at the last UTC midnight, so today is added from Foundry's own log (AiUsageLog,
 * estimated from list prices). With no Admin key it is Foundry's estimate alone, and says so.
 *
 * There is no API for the credit balance or a spend limit on a Console organisation, so the
 * budget figure itself is the one set in Settings → Dispatch.
 *
 * Checked hourly from the `jobs` worker (the disk check's pattern, CLAUDE.md §144): each level is
 * sent once per period, latched with a system marker.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { budgetAlert, budgetAlertCopy, budgetPeriod, BUDGET_LEVELS, type BudgetPeriod } from "@/lib/dispatch/budget";
import { resolveDispatchConfig } from "@/server/dispatch/config";
import { markSystem, readSystemMarkers } from "@/server/system-markers";
import { anthropicAdminKey, anthropicBilledSince } from "@/server/ai-cost";

const CHECKED = "ai-budget-checked";
const EVERY_MS = 60 * 60_000;
/** Anthropic's figures change once a day; read them at most hourly. */
const BILLED_TTL_MS = 60 * 60_000;

export interface BudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  /** Of which Dispatch (Foundry's own estimate: Anthropic doesn't split by feature). */
  dispatchUsd: number;
  /** "anthropic": Anthropic's billed spend (+ today's estimate). "estimate": Foundry's alone. */
  source: "anthropic" | "estimate";
  /** With Anthropic's figures: billed up to here (the last UTC midnight); estimated after it. */
  billedThrough: string | null;
  /** An Admin key is set but Anthropic didn't answer: shown so it isn't mistaken for "not set". */
  anthropicError: boolean;
  period: { key: string; label: string; start: string };
}

async function estimateSince(workspaceId: string, since: Date, module?: "DISPATCH"): Promise<number> {
  const agg = await prisma.aiUsageLog.aggregate({
    where: {
      workspaceId,
      createdAt: { gte: since },
      provider: { equals: "anthropic", mode: "insensitive" },
      ...(module ? { module } : {}),
    },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

/** Anthropic's billed figure for the period, cached an hour in AiResponseCache. */
async function billedCached(
  workspaceId: string,
  key: string,
  period: BudgetPeriod,
  now: Date,
): Promise<{ usd: number; through: Date } | null> {
  const cacheKey = `ai-billed:${period.key}`;
  const row = await prisma.aiResponseCache.findUnique({ where: { workspaceId_cacheKey: { workspaceId, cacheKey } } });
  const hit = row?.response as { usd?: number; through?: string; fetchedAt?: string } | undefined;
  const through = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (
    hit?.fetchedAt &&
    typeof hit.usd === "number" &&
    hit.through === through.toISOString() &&
    now.getTime() - Date.parse(hit.fetchedAt) < BILLED_TTL_MS
  ) {
    return { usd: hit.usd, through };
  }
  const fresh = await anthropicBilledSince(key, period.start, now);
  if (!fresh) return null;
  const response = { usd: fresh.usd, through: fresh.through.toISOString(), fetchedAt: now.toISOString() } as Prisma.InputJsonValue;
  await prisma.aiResponseCache
    .upsert({
      where: { workspaceId_cacheKey: { workspaceId, cacheKey } },
      update: { response, inputsHash: now.toISOString() },
      create: { workspaceId, cacheKey, inputsHash: now.toISOString(), response },
    })
    .catch(() => undefined);
  return fresh;
}

export async function budgetStatus(workspaceId: string, now: Date = new Date()): Promise<BudgetStatus> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { dispatchConfig: true, anthropicAdminApiKey: true },
  });
  const config = resolveDispatchConfig(ws?.dispatchConfig);
  const period = budgetPeriod(config.budgetSince, now);
  const key = ws ? anthropicAdminKey(ws) : null;
  const billed = key ? await billedCached(workspaceId, key, period, now) : null;

  const [dispatchEst, totalEst] = await Promise.all([
    estimateSince(workspaceId, period.start, "DISPATCH"),
    // With Anthropic's figure, only what it hasn't reported yet (since its last midnight).
    estimateSince(workspaceId, billed ? billed.through : period.start),
  ]);
  return {
    budgetUsd: config.budgetUsd,
    spentUsd: round2((billed?.usd ?? 0) + totalEst),
    dispatchUsd: round2(dispatchEst),
    source: billed ? "anthropic" : "estimate",
    billedThrough: billed ? billed.through.toISOString() : null,
    anthropicError: Boolean(key) && !billed,
    period: { key: period.key, label: period.label, start: period.start.toISOString() },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const markerName = (workspaceId: string, period: Pick<BudgetPeriod, "key">, level: number) =>
  `ai-budget:${workspaceId}:${period.key}:${level}`;

/** Hourly: for each workspace, send the highest newly crossed level to its Super Admins. */
export async function checkAiBudgets(now: Date = new Date()): Promise<{ checked: number; sent: string[] } | null> {
  const last = (await readSystemMarkers([CHECKED]))[CHECKED];
  if (last && now.getTime() - last.getTime() < EVERY_MS) return null;
  await markSystem(CHECKED, now);

  // Only workspaces that spend on AI at all: the ones with Anthropic usage this month or a
  // Dispatch budget set (a handful).
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const active = await prisma.aiUsageLog.findMany({
    where: { createdAt: { gte: since }, provider: { equals: "anthropic", mode: "insensitive" } },
    distinct: ["workspaceId"],
    select: { workspaceId: true },
  });

  const sent: string[] = [];
  for (const { workspaceId } of active) {
    const status = await budgetStatus(workspaceId, now);
    const period = { key: status.period.key, label: status.period.label, start: new Date(status.period.start) };
    const names = BUDGET_LEVELS.map((l) => markerName(workspaceId, period, l));
    const markers = await readSystemMarkers(names);
    const alreadySent = BUDGET_LEVELS.filter((l) => markers[markerName(workspaceId, period, l)]);
    const { send, mark } = budgetAlert(status.spentUsd, status.budgetUsd, alreadySent);
    for (const l of mark) await markSystem(markerName(workspaceId, period, l), now);
    if (!send) continue;

    const copy = budgetAlertCopy(send, status.spentUsd, status.budgetUsd, period);
    const superAdmins = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: "SUPER_ADMIN", ...ACTIVE_MEMBER },
      select: { userId: true },
    });
    const { dispatchNotification } = await import("@/server/notifications");
    dispatchNotification({
      event: "ai.budget_alert",
      workspaceId,
      title: copy.title,
      body: copy.body,
      actionUrl: "/app/analytics",
      target: { kind: "users", userIds: superAdmins.map((m) => m.userId) },
      groupKey: `ai.budget_alert:${period.key}:${send}`,
      count: 1,
    });
    // The ops channel too, so it is seen even with Foundry closed.
    const { postOpsWebhook } = await import("@/server/ops-alert");
    await postOpsWebhook(`⚠️ *${copy.title}*\n${copy.body}`);
    sent.push(`${workspaceId}:${send}`);
  }
  return { checked: active.length, sent };
}
