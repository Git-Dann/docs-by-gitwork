/**
 * Portal analytics — the first scope of Foundry's "GA4 for Foundry" dashboard (super-admin only).
 *
 * A workspace-wide delivery/output rollup built from the task graph: throughput over time
 * (created vs completed), the status / priority / label mix, a per-developer output leaderboard,
 * and per-client activity. All computed server-side, batched (no N+1), and keyed by id.
 *
 * Reuses the established batching helpers in `client-metrics.ts` (overdue counts, Pulse health,
 * derived health, business-day maths) and the dev roster from `tasks-standup.ts` so the numbers
 * line up exactly with the Portal cards and the DevOps roll-up.
 *
 * 42702 note: `Task` shares a `createdAt` column with `TaskComment` / `DailyUpdate`, so a
 * `task.groupBy` that combines a relation filter with a date `_max`/`orderBy` triggers Postgres'
 * ambiguous-column error (42702) — the same trap documented in `document-analytics.ts`. Every
 * query here is therefore either a scalar-only `groupBy` (no relation, no date aggregate) or a
 * plain `findMany` with an explicit date filter that is then bucketed in JS.
 *
 * All numeric outputs are plain numbers; all timestamps are ISO strings — a stable JSON contract.
 */

import type { TaskStatus, TaskPriority, TaskLabel, ClientEngagementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  businessDaysBetween,
  computeClientDevCounts,
  computeClientFinancials,
  computeClientOverdueTaskCounts,
  computeClientPulseHealth,
  deriveClientHealth,
} from "@/server/client-metrics";
import { normalizeToMonthly } from "@/server/rate-card";
import { getDeveloperUserIds } from "@/server/tasks-standup";
import {
  buildThroughput,
  round2,
  startOfUtcDay,
  tallyDevOutput,
  ymd,
} from "@/server/analytics/portal-analytics-helpers";
import type { ClientHealth } from "@/types/client";

export interface PortalAnalyticsOptions {
  from?: Date;
  to?: Date;
  /** Time-series granularity. Defaults to "day" for ≤120-day ranges, else "week". */
  bucket?: "day" | "week";
}

export interface PortalAnalytics {
  range: { from: string; to: string; bucket: "day" | "week" };
  totals: {
    createdInRange: number;
    completedInRange: number;
    openNow: number;
    overdueNow: number;
    inProgressNow: number;
    /** completed / created within the range (throughput ratio), or null when nothing was created. */
    completionRate: number | null;
    /** Mean DOING→DONE time over tasks completed in range that carry a startedAt. */
    avgLeadTimeMs: number | null;
    leadTimeSamples: number;
    /** Distinct billable devs on an active placement right now (excludes off-bench / pro-bono). */
    activeDevs: number;
    /** Workspace-wide monthly dev burn (dominant currency), or null when no priced devs. */
    monthlyCost: { amount: number; currency: string } | null;
    /** Mean business-days-elapsed across clients that have a dated Gantt start. */
    avgWorkingDays: number | null;
  };
  throughput: Array<{ bucket: string; created: number; completed: number }>;
  /** Histogram of DOING→DONE lead time over tasks completed in range (that carry a startedAt). */
  leadTimeBuckets: Array<{ label: string; count: number }>;
  byStatus: Array<{ status: TaskStatus; count: number }>;
  byPriority: Array<{ priority: TaskPriority; count: number }>;
  byLabel: Array<{ label: TaskLabel | "UNLABELED"; count: number }>;
  leaderboard: Array<{
    userId: string;
    name: string;
    avatarUrl: string | null;
    completed: number;
    openAssigned: number;
    avgLeadTimeMs: number | null;
    /** Distinct days a PM update was pushed / business days in range, capped at 100. */
    standupCompliancePct: number | null;
  }>;
  clients: Array<{
    clientId: string;
    name: string;
    slug: string;
    open: number;
    overdue: number;
    completedInRange: number;
    /** Active devs on this client (distinct candidates with an open placement). */
    devs: number;
    /** Monthly dev cost for this client, or null when no priced billable dev. */
    monthlyCost: { amount: number; currency: string; unpricedDevs: number } | null;
    /** Business days since the earliest dated feature block, or null when no Gantt timeline. */
    workingDays: number | null;
    /** Engagement shape (fixed/phased have an end; rolling/retainer are ongoing). */
    engagementType: ClientEngagementType | null;
    /** Project/proposal end date (ISO), or null when ongoing / unset. */
    endDate: string | null;
    /** Calendar days from today until endDate (negative = past end); null when no endDate. */
    daysLeft: number | null;
    health: ClientHealth | null;
  }>;
  /** Client count by engagement type (for the mix donut); null → "UNSET". */
  byEngagement: Array<{ type: ClientEngagementType | "UNSET"; count: number }>;
}

const MS_PER_DAY = 86_400_000;

// ── aggregator ──────────────────────────────────────────────────────────────────

export async function getPortalAnalytics(
  workspaceId: string,
  opts: PortalAnalyticsOptions = {},
): Promise<PortalAnalytics> {
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - 90 * MS_PER_DAY);
  const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
  const bucket: "day" | "week" = opts.bucket ?? (rangeDays > 120 ? "week" : "day");

  const startOfToday = startOfUtcDay(new Date());

  // Resolve id sets up front so every downstream query is join-free (42702-safe).
  const [clientRows, devIds] = await Promise.all([
    prisma.workspaceClient.findMany({
      where: { workspaceId },
      select: { id: true, name: true, slug: true, engagementType: true, endDate: true },
    }),
    getDeveloperUserIds(workspaceId),
  ]);
  const clientIds = clientRows.map((c) => c.id);

  const assigneeFilter = [
    { assignees: { some: { id: { in: devIds } } } },
    { assigneeId: { in: devIds } },
  ];

  const [
    devUsers,
    statusGroups,
    priorityGroups,
    labelGroups,
    openNow,
    overdueNow,
    inProgressNow,
    createdRows,
    completedRows,
    openAssignedRows,
    dailyUpdates,
    clientOpenGroups,
    overdueByClient,
    pulseHealthByClient,
    devCountByClient,
    financialsByClient,
    offBenchCandidates,
    activePlacements,
  ] = await Promise.all([
    devIds.length
      ? prisma.user.findMany({
          where: { id: { in: devIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : Promise.resolve([]),
    // Full pipeline shape: all non-archived top-level tasks by status (incl. DONE).
    prisma.task.groupBy({
      by: ["status"],
      where: { workspaceId, archivedAt: null, parentId: null },
      _count: { _all: true },
    }),
    // Priority / label mix of what's currently in flight (open, non-archived, top-level).
    prisma.task.groupBy({
      by: ["priority"],
      where: { workspaceId, archivedAt: null, parentId: null, status: { not: "DONE" } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["label"],
      where: { workspaceId, archivedAt: null, parentId: null, status: { not: "DONE" } },
      _count: { _all: true },
    }),
    prisma.task.count({ where: { workspaceId, archivedAt: null, parentId: null, status: { not: "DONE" } } }),
    prisma.task.count({
      where: {
        workspaceId,
        archivedAt: null,
        parentId: null,
        status: { not: "DONE" },
        dueDate: { lt: startOfToday },
      },
    }),
    prisma.task.count({
      where: { workspaceId, archivedAt: null, parentId: null, status: { in: ["DOING", "IN_REVIEW", "UI_DONE"] } },
    }),
    // Throughput created — plain findMany, explicit date filter, bucketed in JS.
    prisma.task.findMany({
      where: { workspaceId, parentId: null, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    // Completed set — feeds completed time-series, lead time, per-dev + per-client output.
    prisma.task.findMany({
      where: { workspaceId, parentId: null, status: "DONE", completedAt: { gte: from, lte: to } },
      select: {
        completedAt: true,
        startedAt: true,
        clientId: true,
        assigneeId: true,
        assignees: { select: { id: true } },
      },
    }),
    // Per-dev open assigned — union of m-n assignees + legacy assigneeId.
    devIds.length
      ? prisma.task.findMany({
          where: { workspaceId, archivedAt: null, parentId: null, status: { not: "DONE" }, OR: assigneeFilter },
          select: { assigneeId: true, assignees: { select: { id: true } } },
        })
      : Promise.resolve([]),
    // Standup cadence for compliance %.
    devIds.length
      ? prisma.dailyUpdate.findMany({
          where: { workspaceId, userId: { in: devIds }, workDate: { gte: from, lte: to } },
          select: { userId: true, workDate: true, pmPushedAt: true },
        })
      : Promise.resolve([]),
    // Per-client open counts (scalar groupBy on clientId — 42702-safe).
    clientIds.length
      ? prisma.task.groupBy({
          by: ["clientId"],
          where: { workspaceId, clientId: { in: clientIds }, archivedAt: null, parentId: null, status: { not: "DONE" } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ clientId: string; _count: { _all: number } }>),
    computeClientOverdueTaskCounts(workspaceId, clientIds),
    computeClientPulseHealth(workspaceId, clientIds),
    computeClientDevCounts(workspaceId, clientIds),
    computeClientFinancials(workspaceId, clientRows.map((c) => ({ id: c.id }))),
    // Off-bench (pro-bono) devs — excluded from the output leaderboard. Matched to roster users
    // by email (the User↔Candidate split has no FK; the team roster reconciles by email).
    prisma.candidate.findMany({
      where: { workspaceId, devGroup: "PRO_BONO" },
      select: { email: true },
    }),
    // Workspace capacity/burn — distinct billable devs on an active placement + their rates.
    prisma.placement.findMany({
      where: { endDate: null, candidate: { workspaceId, devGroup: { not: "PRO_BONO" } } },
      select: {
        candidateId: true,
        candidate: {
          select: {
            rateCardPerson: {
              select: { sourceRate: true, billingPeriod: true, sourceCurrencyCode: true, archivedAt: true },
            },
          },
        },
      },
    }),
  ]);

  // Throughput time-series (pure, gapless).
  const throughput = buildThroughput(
    createdRows.map((r) => r.createdAt),
    completedRows.map((r) => r.completedAt).filter((d): d is Date => d != null),
    from,
    to,
    bucket,
  );

  // Per-dev completion + lead tallies from the single completed fetch (pure).
  const devOutput = tallyDevOutput(completedRows, devIds);

  // Overall lead time + per-client completion counts + lead-time histogram.
  const completedByClient = new Map<string, number>();
  const LT_BUCKETS = [
    { label: "<1d", max: 1 },
    { label: "1–3d", max: 3 },
    { label: "3–7d", max: 7 },
    { label: "1–2w", max: 14 },
    { label: ">2w", max: Infinity },
  ];
  const ltCounts = new Array(LT_BUCKETS.length).fill(0);
  let leadSum = 0;
  let leadN = 0;
  for (const t of completedRows) {
    if (t.startedAt && t.completedAt) {
      const ms = Math.max(0, t.completedAt.getTime() - t.startedAt.getTime());
      leadSum += ms;
      leadN += 1;
      const days = ms / MS_PER_DAY;
      const idx = LT_BUCKETS.findIndex((b) => days < b.max);
      ltCounts[idx === -1 ? LT_BUCKETS.length - 1 : idx] += 1;
    }
    if (t.clientId) completedByClient.set(t.clientId, (completedByClient.get(t.clientId) ?? 0) + 1);
  }
  const leadTimeBuckets = LT_BUCKETS.map((b, i) => ({ label: b.label, count: ltCounts[i] }));

  // Per-dev open assigned.
  const devSet = new Set(devIds);
  const openByDev = new Map<string, number>();
  for (const t of openAssignedRows) {
    const ids = new Set<string>(t.assignees.map((a) => a.id));
    if (t.assigneeId) ids.add(t.assigneeId);
    for (const id of ids) if (devSet.has(id)) openByDev.set(id, (openByDev.get(id) ?? 0) + 1);
  }

  // Standup compliance — distinct PM-pushed days per dev over the range's business days.
  const pmDaysByDev = new Map<string, Set<string>>();
  for (const u of dailyUpdates) {
    if (!u.pmPushedAt) continue;
    const set = pmDaysByDev.get(u.userId) ?? new Set<string>();
    set.add(ymd(startOfUtcDay(u.workDate)));
    pmDaysByDev.set(u.userId, set);
  }
  const businessDays = businessDaysBetween(from, to);

  // Only surface devs who are actually on project work: exclude off-bench (pro-bono) devs, and
  // drop anyone with no output AND no open assignments in range (unassigned / idle roster noise).
  const offBenchEmails = new Set(
    offBenchCandidates.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e),
  );

  const leaderboard = devUsers
    .filter((u) => !offBenchEmails.has(u.email.toLowerCase()))
    .map((u) => {
      const out = devOutput.get(u.id);
      const pmDays = pmDaysByDev.get(u.id)?.size ?? 0;
      return {
        userId: u.id,
        name: u.name?.trim() || u.email,
        avatarUrl: u.avatarUrl,
        completed: out?.completed ?? 0,
        openAssigned: openByDev.get(u.id) ?? 0,
        avgLeadTimeMs: out && out.leadN ? Math.round(out.leadSum / out.leadN) : null,
        standupCompliancePct: businessDays ? Math.min(100, Math.round((pmDays / businessDays) * 100)) : null,
      };
    })
    .filter((d) => d.completed > 0 || d.openAssigned > 0)
    .sort((a, b) => b.completed - a.completed || b.openAssigned - a.openAssigned);

  // Workspace capacity + burn: distinct billable active devs and their combined monthly rate,
  // taking the dominant currency (summing across currencies would be meaningless).
  const seenCandidate = new Set<string>();
  const burnByCurrency = new Map<string, number>();
  for (const p of activePlacements) {
    if (seenCandidate.has(p.candidateId)) continue;
    seenCandidate.add(p.candidateId);
    const rc = p.candidate.rateCardPerson;
    if (rc && !rc.archivedAt) {
      const monthly = normalizeToMonthly(rc.sourceRate, rc.billingPeriod);
      burnByCurrency.set(rc.sourceCurrencyCode, (burnByCurrency.get(rc.sourceCurrencyCode) ?? 0) + monthly);
    }
  }
  const activeDevs = seenCandidate.size;
  const dominantBurn = [...burnByCurrency.entries()].sort((a, b) => b[1] - a[1])[0];
  const workspaceMonthlyCost = dominantBurn
    ? { amount: Math.round(dominantBurn[1]), currency: dominantBurn[0] }
    : null;

  // Per-client activity.
  const openByClient = new Map<string, number>();
  for (const g of clientOpenGroups) openByClient.set(g.clientId, g._count._all);

  const dayFloor = startOfToday.getTime();
  const clients = clientRows
    .map((c) => {
      const open = openByClient.get(c.id) ?? 0;
      const overdue = overdueByClient.get(c.id) ?? 0;
      const pulse = pulseHealthByClient.get(c.id);
      const fin = financialsByClient.get(c.id);
      const cost = fin?.monthlyCost ?? null;
      const daysLeft = c.endDate
        ? Math.round((startOfUtcDay(c.endDate).getTime() - dayFloor) / MS_PER_DAY)
        : null;
      return {
        clientId: c.id,
        name: c.name,
        slug: c.slug,
        open,
        overdue,
        completedInRange: completedByClient.get(c.id) ?? 0,
        devs: devCountByClient.get(c.id) ?? 0,
        monthlyCost: cost ? { amount: cost.amount, currency: cost.currency, unpricedDevs: cost.unpricedDevs } : null,
        workingDays: fin?.workingDays ?? null,
        engagementType: c.engagementType,
        endDate: c.endDate ? c.endDate.toISOString() : null,
        daysLeft,
        health: deriveClientHealth({ pulseHealthScore: pulse?.healthScore ?? null, overdueTasks: overdue }),
      };
    })
    .filter((c) => c.open > 0 || c.overdue > 0 || c.completedInRange > 0 || c.devs > 0 || c.engagementType != null)
    .sort((a, b) => b.open + b.overdue - (a.open + a.overdue) || b.completedInRange - a.completedInRange);

  // Engagement-type distribution across all clients (for the mix donut).
  const engagementCounts = new Map<ClientEngagementType | "UNSET", number>();
  for (const c of clientRows) {
    const key = c.engagementType ?? "UNSET";
    engagementCounts.set(key, (engagementCounts.get(key) ?? 0) + 1);
  }
  const byEngagement = [...engagementCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const workingDayVals = clients.map((c) => c.workingDays).filter((d): d is number => d != null);
  const avgWorkingDays = workingDayVals.length
    ? Math.round(workingDayVals.reduce((a, b) => a + b, 0) / workingDayVals.length)
    : null;

  const createdInRange = createdRows.length;
  const completedInRange = completedRows.length;

  return {
    range: { from: from.toISOString(), to: to.toISOString(), bucket },
    totals: {
      createdInRange,
      completedInRange,
      openNow,
      overdueNow,
      inProgressNow,
      completionRate: createdInRange ? round2(completedInRange / createdInRange) : null,
      avgLeadTimeMs: leadN ? Math.round(leadSum / leadN) : null,
      leadTimeSamples: leadN,
      activeDevs,
      monthlyCost: workspaceMonthlyCost,
      avgWorkingDays,
    },
    throughput,
    leadTimeBuckets,
    byStatus: statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    byPriority: priorityGroups
      .map((g) => ({ priority: g.priority, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    byLabel: labelGroups
      .map((g) => ({ label: (g.label ?? "UNLABELED") as TaskLabel | "UNLABELED", count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    leaderboard,
    clients,
    byEngagement,
  };
}
