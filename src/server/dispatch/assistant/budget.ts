/**
 * The AI budget: how much of it is spent, and telling Super Admins as it fills (§155).
 *
 * Spend is the estimated cost of every logged call on the Anthropic key this period (AiUsageLog,
 * from list prices: src/server/ai-pricing.ts), across every AI feature, because the $200 pot is
 * one key. Checked hourly from the `jobs` worker (the disk check's pattern, CLAUDE.md §144):
 * each level is sent once per period, latched with a system marker.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { budgetAlert, budgetAlertCopy, budgetPeriod, BUDGET_LEVELS, type BudgetPeriod } from "@/lib/dispatch/budget";
import { resolveDispatchConfig } from "@/server/dispatch/config";
import { markSystem, readSystemMarkers } from "@/server/system-markers";

const CHECKED = "ai-budget-checked";
const EVERY_MS = 60 * 60_000;

export interface BudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  /** Of which Dispatch. */
  dispatchUsd: number;
  period: { key: string; label: string; start: string };
}

export async function budgetStatus(workspaceId: string, now: Date = new Date()): Promise<BudgetStatus> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { dispatchConfig: true } });
  const config = resolveDispatchConfig(ws?.dispatchConfig);
  const period = budgetPeriod(config.budgetSince, now);
  const where = {
    workspaceId,
    createdAt: { gte: period.start },
    provider: { equals: "anthropic", mode: "insensitive" as const },
  };
  const [all, dispatch] = await Promise.all([
    prisma.aiUsageLog.aggregate({ where, _sum: { costUsd: true } }),
    prisma.aiUsageLog.aggregate({ where: { ...where, module: "DISPATCH" }, _sum: { costUsd: true } }),
  ]);
  return {
    budgetUsd: config.budgetUsd,
    spentUsd: round2(all._sum.costUsd ?? 0),
    dispatchUsd: round2(dispatch._sum.costUsd ?? 0),
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
