/**
 * Foreman — deterministic detection.
 *
 * `gatherWorkspace` pulls the minimal data set in a handful of batched queries (no N+1). The
 * `detectFindings` layer is pure (data + config + `now` in, findings out) so every rule is
 * unit-testable without a database. Trend (vs the previous run) is layered on afterwards in run.ts.
 *
 * Anti-false-flag rules, applied consistently:
 *   • Only ACTIVE, non-hidden clients are scanned.
 *   • A task with no due date is NEVER "overdue" or "due soon".
 *   • Overdue uses the same boundary as the rest of the app: dueDate < UTC-midnight-today.
 *   • A feature block only counts as "slipping" if it has BOTH dates AND real tasks (else it's a
 *     blind spot, not a risk).
 *   • A milestone is only "missed" when the client still has incomplete work.
 *   • Blind spots (missing dates/timelines) are reported as info, separately — Foreman says what it
 *     can't see instead of inventing a flag.
 */

import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recommendationFor } from "./recommend";
import type {
  ForemanConfig,
  ForemanFinding,
  Severity,
} from "./types";

const DAY_MS = 86_400_000;
const DOING_STATUSES: TaskStatus[] = ["DOING", "IN_REVIEW", "UI_DONE"];

// ─── Gathered raw data (plain, DB-free from here on) ─────────────────────────

export interface RawClient {
  id: string;
  name: string;
  slug: string;
}
export interface RawAssignee {
  id: string;
  name: string | null;
}
export interface RawTask {
  id: string;
  clientId: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  startedAt: Date | null;
  assignees: RawAssignee[];
  /** The category (feature block) it's planned in, or null for work outside the plan. */
  featureBlockId: string | null;
  updatedAt: Date;
}
/** A top-level task completed in the plan-drift window. */
export interface RawRecentDone {
  clientId: string;
  planned: boolean;
}
export interface RawBlock {
  id: string;
  clientId: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  taskTotal: number;
  taskDone: number;
}
export interface RawMilestone {
  id: string;
  clientId: string;
  name: string;
  date: Date;
}
export interface WorkspaceScanData {
  clients: RawClient[];
  tasks: RawTask[]; // open (non-DONE), top-level, non-archived
  blocks: RawBlock[];
  milestones: RawMilestone[];
  /** Top-level tasks completed in the last PLAN_DRIFT_WINDOW_DAYS days. */
  recentDone: RawRecentDone[];
}

/** Plan drift: how far back "recent work" looks, and when a planned task counts as left alone. */
export const PLAN_DRIFT_WINDOW_DAYS = 30;
export const PLAN_DRIFT_STALE_DAYS = 21;
/** Below these, drift is noise — one stray task, or two planned items parked on purpose. */
const PLAN_DRIFT_MIN_UNPLANNED = 5;
const PLAN_DRIFT_MIN_STALE = 3;
/**
 * …and the off-plan work has to be a real share of what was done — the same 25% the
 * board's plan strip uses. PollenIQ did 65 of 71 tasks on its plan, so 6 stray tasks and
 * a few parked ones are housekeeping, not drift.
 */
const PLAN_DRIFT_MIN_SHARE = 0.25;

/** Pull the minimal delivery data set for every active client in one batched pass. */
export async function gatherWorkspace(workspaceId: string): Promise<WorkspaceScanData> {
  const clientRows = await prisma.workspaceClient.findMany({
    where: { workspaceId, status: "ACTIVE", hidden: false },
    select: { id: true, name: true, slug: true },
  });
  const clientIds = clientRows.map((c) => c.id);
  if (clientIds.length === 0) return { clients: [], tasks: [], blocks: [], milestones: [], recentDone: [] };

  const [taskRows, blockRows, milestoneRows, recentDoneRows] = await Promise.all([
    prisma.task.findMany({
      where: {
        workspaceId,
        clientId: { in: clientIds },
        archivedAt: null,
        parentId: null,
        status: { not: "DONE" },
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        status: true,
        dueDate: true,
        startedAt: true,
        featureBlockId: true,
        updatedAt: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
      },
    }),
    prisma.featureBlock.findMany({
      where: { workspaceId, clientId: { in: clientIds } },
      select: {
        id: true,
        clientId: true,
        name: true,
        startDate: true,
        endDate: true,
        tasks: { select: { status: true } },
      },
    }),
    prisma.milestone.findMany({
      where: { workspaceId, clientId: { in: clientIds } },
      select: { id: true, clientId: true, name: true, date: true },
    }),
    // Archived rows included on purpose: done work auto-archives, and it was still done.
    prisma.task.findMany({
      where: {
        workspaceId,
        clientId: { in: clientIds },
        parentId: null,
        status: "DONE",
        completedAt: { gte: new Date(Date.now() - PLAN_DRIFT_WINDOW_DAYS * DAY_MS) },
      },
      select: { clientId: true, featureBlockId: true },
    }),
  ]);

  const tasks: RawTask[] = taskRows.map((t) => {
    // Prefer the many-to-many assignees; fall back to the legacy single assignee, exactly
    // like getTaskAttention / listTasks so counts line up with the rest of the app.
    const assignees = t.assignees.length > 0 ? t.assignees : t.assignee ? [t.assignee] : [];
    return {
      id: t.id,
      clientId: t.clientId,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      startedAt: t.startedAt,
      assignees: assignees.map((a) => ({ id: a.id, name: a.name })),
      featureBlockId: t.featureBlockId,
      updatedAt: t.updatedAt,
    };
  });

  const blocks: RawBlock[] = blockRows.map((b) => ({
    id: b.id,
    clientId: b.clientId,
    name: b.name,
    startDate: b.startDate,
    endDate: b.endDate,
    taskTotal: b.tasks.length,
    taskDone: b.tasks.filter((t) => t.status === "DONE").length,
  }));

  const milestones: RawMilestone[] = milestoneRows.map((m) => ({
    id: m.id,
    clientId: m.clientId,
    name: m.name,
    date: m.date,
  }));

  const recentDone: RawRecentDone[] = recentDoneRows.map((r) => ({
    clientId: r.clientId,
    planned: r.featureBlockId !== null,
  }));

  return { clients: clientRows, tasks, blocks, milestones, recentDone };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** Whole UTC days from `a` to `b` (positive when b is after a), by midnight. */
function dayspan(a: Date, b: number): number {
  return Math.floor((b - utcMidnight(a)) / DAY_MS);
}
function progressPct(total: number, done: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
function assigneeName(a: RawAssignee): string {
  return (a.name ?? "").trim() || "Unnamed teammate";
}

// ─── Finding builder (trend filled in later) ─────────────────────────────────

type NewFinding = Omit<ForemanFinding, "trend" | "previousMetric">;

function mk(
  category: ForemanFinding["category"],
  kind: ForemanFinding["kind"],
  severity: Severity,
  subjectId: string,
  subjectLabel: string,
  headline: string,
  evidence: string[],
  metric: number,
  recommendation: string,
  href?: string,
): NewFinding {
  return { key: `${kind}:${subjectId}`, category, kind, severity, subjectId, subjectLabel, headline, evidence, metric, recommendation, href };
}

// ─── Detection ───────────────────────────────────────────────────────────────

/** Pure: derive all findings (without trend) from gathered data + config, as of `now`. */
export function detectFindings(
  data: WorkspaceScanData,
  config: ForemanConfig,
  now: Date,
): NewFinding[] {
  const startToday = utcMidnight(now);
  const dueSoonEnd = startToday + config.dueSoonDays * DAY_MS;
  const findings: NewFinding[] = [];

  const tasksByClient = new Map<string, RawTask[]>();
  for (const t of data.tasks) {
    const list = tasksByClient.get(t.clientId) ?? [];
    list.push(t);
    tasksByClient.set(t.clientId, list);
  }
  const blocksByClient = new Map<string, RawBlock[]>();
  for (const b of data.blocks) {
    const list = blocksByClient.get(b.clientId) ?? [];
    list.push(b);
    blocksByClient.set(b.clientId, list);
  }
  const recentDoneByClient = new Map<string, RawRecentDone[]>();
  for (const d of data.recentDone) {
    const list = recentDoneByClient.get(d.clientId) ?? [];
    list.push(d);
    recentDoneByClient.set(d.clientId, list);
  }
  const milestonesByClient = new Map<string, RawMilestone[]>();
  for (const m of data.milestones) {
    const list = milestonesByClient.get(m.clientId) ?? [];
    list.push(m);
    milestonesByClient.set(m.clientId, list);
  }

  for (const client of data.clients) {
    const href = `/app/portal/${client.slug}/tasks`;
    const openTasks = tasksByClient.get(client.id) ?? [];
    const clientBlocks = blocksByClient.get(client.id) ?? [];
    const clientMilestones = milestonesByClient.get(client.id) ?? [];

    const overdue = openTasks.filter((t) => t.dueDate && utcMidnight(t.dueDate) < startToday);
    const dueSoon = openTasks.filter(
      (t) => t.dueDate && utcMidnight(t.dueDate) >= startToday && utcMidnight(t.dueDate) < dueSoonEnd,
    );

    // Whether the client still has outstanding work (for milestone judgements).
    const hasIncompleteWork =
      openTasks.length > 0 ||
      clientBlocks.some((b) => b.taskTotal > 0 && progressPct(b.taskTotal, b.taskDone) < 100);

    // Nothing to be late on → skip this client entirely (no empty-client false flags).
    if (openTasks.length === 0 && clientBlocks.length === 0 && clientMilestones.length === 0) {
      continue;
    }

    // 1) Overdue tasks -------------------------------------------------------
    if (overdue.length > 0) {
      const severity: Severity = overdue.length >= config.criticalOverdue ? "critical" : "warn";
      const sorted = [...overdue].sort(
        (a, b) => utcMidnight(a.dueDate!) - utcMidnight(b.dueDate!),
      );
      const evidence = sorted.slice(0, 3).map((t) => {
        const ago = dayspan(t.dueDate!, startToday);
        return `"${t.title}" — due ${ago} ${ago === 1 ? "day" : "days"} ago`;
      });
      if (overdue.length > 3) evidence.push(`+${overdue.length - 3} more`);
      findings.push(
        mk(
          "project",
          "OVERDUE_TASKS",
          severity,
          client.id,
          client.name,
          `${overdue.length} overdue ${overdue.length === 1 ? "task" : "tasks"} on ${client.name}`,
          evidence,
          overdue.length,
          recommendationFor("OVERDUE_TASKS", { clientLabel: client.name, count: overdue.length }),
          href,
        ),
      );
    }

    // 2) Slipping feature blocks --------------------------------------------
    for (const b of clientBlocks) {
      if (!b.startDate || !b.endDate || b.taskTotal === 0) continue;
      if (utcMidnight(b.endDate) >= startToday) continue;
      const pct = progressPct(b.taskTotal, b.taskDone);
      if (pct >= 100) continue;
      const slipDays = dayspan(b.endDate, startToday);
      const severity: Severity = slipDays >= 7 ? "critical" : "warn";
      findings.push(
        mk(
          "project",
          "BLOCK_SLIPPING",
          severity,
          b.id,
          client.name,
          `"${b.name}" is ${slipDays} ${slipDays === 1 ? "day" : "days"} past its end date (${pct}% done)`,
          [
            `Ended ${slipDays} ${slipDays === 1 ? "day" : "days"} ago · ${b.taskDone}/${b.taskTotal} tasks complete`,
            `Client: ${client.name}`,
          ],
          slipDays,
          recommendationFor("BLOCK_SLIPPING", {
            clientLabel: client.name,
            blockName: b.name,
            progressPct: pct,
          }),
          href,
        ),
      );
    }

    // 3) Milestones (missed + imminent) -------------------------------------
    for (const m of clientMilestones) {
      const mDay = utcMidnight(m.date);
      if (mDay < startToday && hasIncompleteWork) {
        const days = dayspan(m.date, startToday);
        findings.push(
          mk(
            "project",
            "MILESTONE_MISSED",
            days >= 7 ? "critical" : "warn",
            m.id,
            client.name,
            `Milestone "${m.name}" is ${days} ${days === 1 ? "day" : "days"} overdue`,
            [`Due ${days} ${days === 1 ? "day" : "days"} ago with work still open`, `Client: ${client.name}`],
            days,
            recommendationFor("MILESTONE_MISSED", { clientLabel: client.name, milestoneName: m.name, days }),
            href,
          ),
        );
      } else if (mDay >= startToday && mDay < dueSoonEnd && hasIncompleteWork) {
        const days = dayspan(now, mDay);
        findings.push(
          mk(
            "project",
            "MILESTONE_IMMINENT",
            days <= 1 ? "warn" : "info",
            m.id,
            client.name,
            `Milestone "${m.name}" is due in ${days} ${days === 1 ? "day" : "days"}`,
            [`Lands in ${days} ${days === 1 ? "day" : "days"} with work still open`, `Client: ${client.name}`],
            days,
            recommendationFor("MILESTONE_IMMINENT", { clientLabel: client.name, milestoneName: m.name, days }),
            href,
          ),
        );
      }
    }

    // 4) Due-soon cluster ("about to be late") ------------------------------
    if (dueSoon.length >= 3) {
      findings.push(
        mk(
          "project",
          "DUE_SOON_CLUSTER",
          "info",
          client.id,
          client.name,
          `${dueSoon.length} tasks due for ${client.name} within ${config.dueSoonDays} days`,
          dueSoon.slice(0, 3).map((t) => {
            const inDays = dayspan(now, utcMidnight(t.dueDate!));
            return `"${t.title}" — due in ${inDays} ${inDays === 1 ? "day" : "days"}`;
          }),
          dueSoon.length,
          recommendationFor("DUE_SOON_CLUSTER", { clientLabel: client.name, count: dueSoon.length, dueSoonDays: config.dueSoonDays }),
          href,
        ),
      );
    }

    // 5) Unassigned time-critical work --------------------------------------
    const timeCritical = [...overdue, ...dueSoon].filter((t) => t.assignees.length === 0);
    if (timeCritical.length > 0) {
      const anyOverdue = timeCritical.some((t) => t.dueDate && utcMidnight(t.dueDate) < startToday);
      findings.push(
        mk(
          "project",
          "UNASSIGNED_WORK",
          anyOverdue ? "warn" : "info",
          client.id,
          client.name,
          `${timeCritical.length} time-critical ${timeCritical.length === 1 ? "task has" : "tasks have"} no owner on ${client.name}`,
          timeCritical.slice(0, 3).map((t) => `"${t.title}" — unassigned`),
          timeCritical.length,
          recommendationFor("UNASSIGNED_WORK", { clientLabel: client.name, count: timeCritical.length }),
          href,
        ),
      );
    }

    // 5b) Plan drift ---------------------------------------------------------
    // ⚠️ The October 2026 audit: Fellas completed 150 tasks in 30 days, none in a
    // category, while 78 planned tasks sat untouched. Every other check here reads the
    // PLAN, so they all said the project was quiet. Only fires when BOTH halves hold —
    // work is happening, and it is happening outside a plan that is being left alone —
    // because either alone is normal (a quiet week; a parked backlog).
    {
      const done = recentDoneByClient.get(client.id) ?? [];
      const unplannedDone = done.filter((d) => !d.planned).length;
      const plannedOpen = openTasks.filter((t) => t.featureBlockId);
      const staleCutoff = startToday - PLAN_DRIFT_STALE_DAYS * DAY_MS;
      const stale = plannedOpen.filter((t) => t.updatedAt.getTime() < staleCutoff);
      const share = done.length === 0 ? 0 : unplannedDone / done.length;
      if (
        unplannedDone >= PLAN_DRIFT_MIN_UNPLANNED &&
        share >= PLAN_DRIFT_MIN_SHARE &&
        stale.length >= PLAN_DRIFT_MIN_STALE
      ) {
        const perBlock = new Map<string, number>();
        for (const t of stale) perBlock.set(t.featureBlockId!, (perBlock.get(t.featureBlockId!) ?? 0) + 1);
        const [topBlockId, topCount] = [...perBlock.entries()].sort((a, b) => b[1] - a[1])[0];
        const topBlock = clientBlocks.find((b) => b.id === topBlockId);
        const oldest = [...stale].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0];
        const evidence = [
          `${unplannedDone} of ${done.length} tasks completed in the last ${PLAN_DRIFT_WINDOW_DAYS} days were outside the plan`,
          `${stale.length} of ${plannedOpen.length} planned tasks untouched for ${PLAN_DRIFT_STALE_DAYS}+ days`,
        ];
        if (topBlock) evidence.push(`Most left alone: "${topBlock.name}" (${topCount})`);
        evidence.push(`e.g. "${oldest.title}" — last touched ${dayspan(oldest.updatedAt, startToday)} days ago`);
        findings.push(
          mk(
            "project",
            "PLAN_DRIFT",
            "warn",
            client.id,
            client.name,
            `${client.name}'s work is happening outside its plan`,
            evidence,
            stale.length,
            recommendationFor("PLAN_DRIFT", {
              clientLabel: client.name,
              count: stale.length,
              blockName: topBlock?.name,
            }),
            href,
          ),
        );
      }
    }

    // 6) Blind spots (info) — what Foreman can't see, called out plainly -----
    if (openTasks.length > 0) {
      const datedBlocks = clientBlocks.filter((b) => b.startDate && b.endDate);
      if (clientBlocks.length === 0) {
        findings.push(
          mk(
            "blindspot",
            "NO_TIMELINE",
            "info",
            client.id,
            client.name,
            `No timeline set for ${client.name}`,
            [`${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"} but no dated feature block`],
            openTasks.length,
            recommendationFor("NO_TIMELINE", { clientLabel: client.name }),
            href,
          ),
        );
      }
      const undatedBlocks = clientBlocks.filter((b) => !(b.startDate && b.endDate));
      if (undatedBlocks.length > 0) {
        findings.push(
          mk(
            "blindspot",
            "BLOCK_NO_DATES",
            "info",
            client.id,
            client.name,
            `${undatedBlocks.length} feature ${undatedBlocks.length === 1 ? "block has" : "blocks have"} no dates on ${client.name}`,
            undatedBlocks.slice(0, 3).map((b) => `"${b.name}" — no start/end`),
            undatedBlocks.length,
            recommendationFor("BLOCK_NO_DATES", { clientLabel: client.name, count: undatedBlocks.length }),
            href,
          ),
        );
      }
      void datedBlocks; // NO_TIMELINE already covers the no-dated-block case above.

      const undated = openTasks.filter((t) => !t.dueDate);
      if (undated.length >= 3 && undated.length / openTasks.length >= 0.5) {
        findings.push(
          mk(
            "blindspot",
            "NO_DUE_DATES",
            "info",
            client.id,
            client.name,
            `${undated.length} of ${openTasks.length} open tasks have no due date on ${client.name}`,
            [`Timing can't be judged for ${undated.length} ${undated.length === 1 ? "task" : "tasks"}`],
            undated.length,
            recommendationFor("NO_DUE_DATES", { clientLabel: client.name, count: undated.length }),
            href,
          ),
        );
      }
    }
  }

  // ── Developer findings ────────────────────────────────────────────────────
  interface DevAgg {
    name: string;
    tasks: RawTask[];
  }
  const byDev = new Map<string, DevAgg>();
  for (const t of data.tasks) {
    for (const a of t.assignees) {
      const agg = byDev.get(a.id) ?? { name: assigneeName(a), tasks: [] };
      agg.tasks.push(t);
      byDev.set(a.id, agg);
    }
  }

  for (const [userId, agg] of byDev) {
    const devOverdue = agg.tasks.filter((t) => t.dueDate && utcMidnight(t.dueDate) < startToday);
    const clientsForOverdue = new Set(devOverdue.map((t) => t.clientId));
    if (devOverdue.length > 0) {
      const severity: Severity = devOverdue.length >= config.criticalOverdue ? "critical" : "warn";
      const evidence = devOverdue.slice(0, 3).map((t) => {
        const ago = dayspan(t.dueDate!, startToday);
        return `"${t.title}" — ${ago} ${ago === 1 ? "day" : "days"} overdue`;
      });
      if (clientsForOverdue.size > 1) evidence.push(`Across ${clientsForOverdue.size} clients`);
      findings.push(
        mk(
          "developer",
          "DEV_OVERDUE",
          severity,
          userId,
          agg.name,
          `${agg.name} has ${devOverdue.length} overdue ${devOverdue.length === 1 ? "task" : "tasks"}`,
          evidence,
          devOverdue.length,
          recommendationFor("DEV_OVERDUE", { devLabel: agg.name, count: devOverdue.length, clientCount: clientsForOverdue.size }),
          "/app",
        ),
      );
    }

    const stalled = agg.tasks.filter(
      (t) =>
        DOING_STATUSES.includes(t.status) &&
        t.startedAt &&
        dayspan(t.startedAt, startToday) >= config.staleDoingDays,
    );
    if (stalled.length > 0) {
      const maxAge = Math.max(...stalled.map((t) => dayspan(t.startedAt!, startToday)));
      findings.push(
        mk(
          "developer",
          "DEV_STALLED",
          "info",
          userId,
          agg.name,
          `${agg.name} has ${stalled.length} in-progress ${stalled.length === 1 ? "task" : "tasks"} with no movement`,
          stalled.slice(0, 3).map((t) => {
            const age = dayspan(t.startedAt!, startToday);
            return `"${t.title}" — in progress ${age} ${age === 1 ? "day" : "days"}`;
          }),
          stalled.length,
          recommendationFor("DEV_STALLED", { devLabel: agg.name, count: stalled.length, days: maxAge }),
          "/app",
        ),
      );
    }

    const distinctClients = new Set(agg.tasks.map((t) => t.clientId));
    if (distinctClients.size >= 4) {
      findings.push(
        mk(
          "developer",
          "DEV_OVERLOADED",
          "info",
          userId,
          agg.name,
          `${agg.name} is spread across ${distinctClients.size} clients`,
          [`${agg.tasks.length} open tasks across ${distinctClients.size} clients`],
          agg.tasks.length,
          recommendationFor("DEV_OVERLOADED", { devLabel: agg.name, count: agg.tasks.length, clientCount: distinctClients.size }),
          "/app",
        ),
      );
    }
  }

  return findings;
}

/** Count of distinct developers with any open task — for the run stats. */
export function countDevelopers(data: WorkspaceScanData): number {
  const ids = new Set<string>();
  for (const t of data.tasks) for (const a of t.assignees) ids.add(a.id);
  return ids.size;
}
