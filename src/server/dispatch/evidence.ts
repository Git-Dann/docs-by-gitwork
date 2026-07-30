/**
 * Dispatch — deterministic evidence gathering.
 *
 * Everything Dispatch is allowed to say is assembled here, from Prisma, with no AI involved.
 * The answer step downstream may only rephrase this pack; it cannot look anything up. That
 * split is what makes the "never over-claim" guarantee real rather than a prompt instruction.
 *
 * Two rules this file exists to enforce:
 *   1. Bounded. Every list is capped at `maxEvidenceItems` and the pack records `truncated`,
 *      so a 400-task client can't blow the token budget or make the model imply completeness.
 *   2. Honest about gaps. Anything Dispatch looked for and did not find becomes an explicit
 *      blind spot rather than an absence the model gets to interpret. "No overdue tasks"
 *      because everything is on time and "no overdue tasks" because nothing has a due date
 *      are completely different answers, and only this layer can tell them apart.
 *
 * The window: `recentDays` reaches BACKWARD for completed work / recent activity and FORWARD
 * for upcoming due dates. One knob, both directions, deliberately — it's the horizon the
 * question "where are we?" implicitly means.
 */

import { Prisma, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ForemanFinding } from "@/server/foreman/types";
import type {
  DispatchConfig,
  DispatchEvidence,
  DispatchSubject,
  EvidenceBlindSpot,
  EvidenceBlock,
  EvidenceClient,
  EvidenceDocument,
  EvidenceMeeting,
  EvidenceMilestone,
  EvidenceTask,
} from "./types";

const DAY_MS = 86_400_000;

/** Statuses that mean "actively being worked", matching the task board's own grouping. */
const IN_FLIGHT: TaskStatus[] = ["DOING", "IN_REVIEW", "UI_DONE"];

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Only ever consider real, top-level, live tasks — subtasks and archived rows are noise here. */
const LIVE_TASK: Prisma.TaskWhereInput = { archivedAt: null, parentId: null };

/** Multi-assignee with the legacy single-assignee fallback, same as listTasks/standup. */
function assignedTo(userId: string): Prisma.TaskWhereInput {
  return { OR: [{ assignees: { some: { id: userId } } }, { assigneeId: userId }] };
}

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  blockedReason: true,
  assigneeId: true,
  client: { select: { name: true } },
  featureBlock: { select: { name: true } },
  assignees: { select: { name: true, email: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

function toEvidenceTask(t: TaskRow): EvidenceTask {
  const names = t.assignees.map((a) => a.name ?? a.email).filter((n): n is string => !!n);
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    clientName: t.client?.name ?? null,
    blockName: t.featureBlock?.name ?? null,
    dueDate: iso(t.dueDate),
    startedAt: iso(t.startedAt),
    completedAt: iso(t.completedAt),
    assignees: names,
    blockedReason: t.blockedReason,
  };
}

export interface GatherArgs {
  workspaceId: string;
  subject: DispatchSubject;
  /** Narrows a client-subject question to one person's work ("what has Howard done on X"). */
  personFilter: { id: string; label: string; email: string } | null;
  config: DispatchConfig;
  now?: Date;
}

export async function gatherEvidence(args: GatherArgs): Promise<DispatchEvidence> {
  const now = args.now ?? new Date();
  const { workspaceId, subject, personFilter, config } = args;
  const cap = config.maxEvidenceItems;
  const startToday = utcMidnight(now);
  const windowStart = new Date(startToday - config.recentDays * DAY_MS);
  const dueSoonEnd = new Date(startToday + config.recentDays * DAY_MS);

  // ── Scope: which tasks are in play for this subject ──
  const scope: Prisma.TaskWhereInput = { workspaceId, ...LIVE_TASK };
  if (subject.kind === "client") scope.clientId = subject.id;
  if (subject.kind === "person") Object.assign(scope, assignedTo(subject.id));
  if (subject.kind === "client" && personFilter) Object.assign(scope, assignedTo(personFilter.id));
  if (subject.kind === "workspace") {
    // Workspace-wide questions only concern clients that are actually live.
    scope.client = { status: "ACTIVE" };
  }

  const openScope: Prisma.TaskWhereInput = { ...scope, status: { not: "DONE" } };

  const [overdueRows, doingRows, dueSoonRows, doneRows, blockedRows, openTotal, openWithoutDue, doneWithoutStamp] =
    await Promise.all([
      prisma.task.findMany({
        where: { ...openScope, dueDate: { lt: new Date(startToday) } },
        orderBy: { dueDate: "asc" },
        take: cap,
        select: TASK_SELECT,
      }),
      prisma.task.findMany({
        where: { ...scope, status: { in: IN_FLIGHT } },
        orderBy: { updatedAt: "desc" },
        take: cap,
        select: TASK_SELECT,
      }),
      prisma.task.findMany({
        where: { ...openScope, dueDate: { gte: new Date(startToday), lt: dueSoonEnd } },
        orderBy: { dueDate: "asc" },
        take: cap,
        select: TASK_SELECT,
      }),
      prisma.task.findMany({
        where: { ...scope, status: "DONE", completedAt: { gte: windowStart } },
        orderBy: { completedAt: "desc" },
        take: cap,
        select: TASK_SELECT,
      }),
      prisma.task.findMany({
        where: { ...openScope, blockedReason: { not: null } },
        orderBy: { blockedAt: "desc" },
        take: cap,
        select: TASK_SELECT,
      }),
      prisma.task.count({ where: openScope }),
      prisma.task.count({ where: { ...openScope, dueDate: null } }),
      prisma.task.count({ where: { ...scope, status: "DONE", completedAt: null } }),
    ]);

  const [overdueCount, dueSoonCount, doingCount, doneInWindow, blockedCount] = await Promise.all([
    prisma.task.count({ where: { ...openScope, dueDate: { lt: new Date(startToday) } } }),
    prisma.task.count({ where: { ...openScope, dueDate: { gte: new Date(startToday), lt: dueSoonEnd } } }),
    prisma.task.count({ where: { ...scope, status: { in: IN_FLIGHT } } }),
    prisma.task.count({ where: { ...scope, status: "DONE", completedAt: { gte: windowStart } } }),
    prisma.task.count({ where: { ...openScope, blockedReason: { not: null } } }),
  ]);

  // ── Client-only context ──
  let client: EvidenceClient | null = null;
  let blocks: EvidenceBlock[] = [];
  let milestones: EvidenceMilestone[] = [];
  let meetings: EvidenceMeeting[] = [];
  let documents: EvidenceDocument[] = [];

  if (subject.kind === "client") {
    const [clientRow, blockRows, milestoneRows, meetingRows, docRows] = await Promise.all([
      prisma.workspaceClient.findFirst({
        where: { id: subject.id, workspaceId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          onboarding: { select: { status: true, submittedAt: true } },
        },
      }),
      prisma.featureBlock.findMany({
        where: { workspaceId, clientId: subject.id },
        orderBy: { orderKey: "asc" },
        take: cap,
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          _count: { select: { tasks: true } },
          tasks: { where: { status: "DONE" }, select: { id: true } },
        },
      }),
      prisma.milestone.findMany({
        where: { workspaceId, clientId: subject.id },
        orderBy: { date: "asc" },
        take: cap,
        select: { id: true, name: true, date: true },
      }),
      prisma.meeting.findMany({
        where: { workspaceId, clientId: subject.id },
        orderBy: { startedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          startedAt: true,
          status: true,
          summary: true,
          decisions: true,
          actionItems: { where: { done: false }, select: { text: true }, take: 6 },
        },
      }),
      prisma.document.findMany({
        where: { workspaceId, clientId: subject.id },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          documentType: true,
          status: true,
          sharedAt: true,
          firstViewedAt: true,
          acceptedAt: true,
        },
      }),
    ]);

    if (clientRow) {
      client = {
        id: clientRow.id,
        name: clientRow.name,
        slug: clientRow.slug,
        status: clientRow.status,
        onboardingStatus: clientRow.onboarding?.status ?? null,
        onboardingSubmittedAt: iso(clientRow.onboarding?.submittedAt),
      };
    }

    blocks = blockRows.map((b) => ({
      id: b.id,
      name: b.name,
      clientName: clientRow?.name ?? null,
      startDate: iso(b.startDate),
      endDate: iso(b.endDate),
      totalTasks: b._count.tasks,
      doneTasks: b.tasks.length,
    }));

    milestones = milestoneRows.map((m) => ({
      id: m.id,
      name: m.name,
      clientName: clientRow?.name ?? null,
      date: m.date.toISOString(),
      openTasksInClient: openTotal,
    }));

    meetings = meetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      startedAt: iso(m.startedAt),
      status: m.status,
      summary: m.summary,
      decisions: Array.isArray(m.decisions)
        ? (m.decisions as unknown[]).filter((d): d is string => typeof d === "string").slice(0, 6)
        : [],
      openActionItems: m.actionItems.map((a) => a.text),
    }));

    documents = docRows.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.documentType,
      status: d.status,
      sharedAt: iso(d.sharedAt),
      firstViewedAt: iso(d.firstViewedAt),
      acceptedAt: iso(d.acceptedAt),
    }));
  }

  // ── Foreman's existing findings for this subject — reuse, never re-derive ──
  const foremanFindings = await findForemanFindings(workspaceId, subject);

  // ── Blind spots ──
  const blindSpots = deriveBlindSpots({
    subject,
    openTotal,
    openWithoutDue,
    doneWithoutStamp,
    doneInWindow,
    doingCount,
    blocks,
    recentDays: config.recentDays,
    hasClientRecord: subject.kind !== "client" || client !== null,
  });

  const truncated =
    overdueCount > overdueRows.length ||
    dueSoonCount > dueSoonRows.length ||
    doingCount > doingRows.length ||
    doneInWindow > doneRows.length ||
    blockedCount > blockedRows.length;

  return {
    subject,
    asOf: now.toISOString(),
    client,
    overdue: overdueRows.map(toEvidenceTask),
    doing: doingRows.map(toEvidenceTask),
    dueSoon: dueSoonRows.map(toEvidenceTask),
    recentlyDone: doneRows.map(toEvidenceTask),
    blocked: blockedRows.map(toEvidenceTask),
    blocks,
    milestones,
    meetings,
    documents,
    foremanFindings,
    blindSpots,
    counts: {
      openTasks: openTotal,
      overdue: overdueCount,
      dueSoon: dueSoonCount,
      doing: doingCount,
      doneInWindow,
      blocked: blockedCount,
    },
    truncated,
  };
}

/**
 * Findings the daily Foreman scan already raised against this subject. Project findings carry
 * the client name in `subjectLabel` and the client's board in `href` even when `subjectId` is a
 * block/milestone id, so match on either — that's how a "block slipping" flag reaches the client
 * it belongs to.
 */
async function findForemanFindings(
  workspaceId: string,
  subject: DispatchSubject,
): Promise<DispatchEvidence["foremanFindings"]> {
  const run = await prisma.foremanRun.findFirst({
    where: { workspaceId, mode: "scan", status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { findings: true },
  });
  if (!run || !Array.isArray(run.findings)) return [];

  const all = run.findings as unknown as ForemanFinding[];
  const href = subject.kind === "client" ? `/app/portal/${subject.slug}/tasks` : null;

  return all
    .filter((f) => {
      if (!f || typeof f !== "object") return false;
      if (subject.kind === "workspace") return f.severity === "critical";
      if (f.subjectId === subject.id) return true;
      if (f.subjectLabel === subject.label) return true;
      return href !== null && f.href === href;
    })
    .slice(0, 6)
    .map((f) => ({
      headline: f.headline,
      severity: f.severity,
      evidence: Array.isArray(f.evidence) ? f.evidence.slice(0, 3) : [],
      recommendation: f.recommendation,
    }));
}

/**
 * Pure — what Dispatch looked for and could not find. Exported for unit tests.
 *
 * These are not "no news is good news" signals; each one names a question the evidence pack
 * cannot answer, so the writer downstream is obliged to say so instead of filling the silence.
 */
export function deriveBlindSpots(input: {
  subject: DispatchSubject;
  openTotal: number;
  openWithoutDue: number;
  doneWithoutStamp: number;
  doneInWindow: number;
  doingCount: number;
  blocks: EvidenceBlock[];
  recentDays: number;
  hasClientRecord: boolean;
}): EvidenceBlindSpot[] {
  const out: EvidenceBlindSpot[] = [];
  const { subject, openTotal, openWithoutDue, doneInWindow, doingCount, blocks, recentDays } = input;

  if (!input.hasClientRecord) {
    out.push({
      kind: "NOT_IN_FOUNDRY",
      detail: `No Foundry client record for "${subject.label}" — nothing to report from.`,
    });
    return out;
  }

  if (openTotal === 0 && doneInWindow === 0) {
    out.push({
      kind: "NO_TASKS",
      detail: `No tracked tasks for ${subject.label}, so progress can't be judged from the board.`,
    });
  }

  // The distinction that matters most: "nothing overdue" is meaningless if nothing is dated.
  if (openTotal > 0 && openWithoutDue >= openTotal / 2) {
    out.push({
      kind: "NO_DUE_DATES",
      detail: `${openWithoutDue} of ${openTotal} open tasks have no due date — "on time" can't be verified for those.`,
    });
  }

  if (input.doneWithoutStamp > 0) {
    out.push({
      kind: "NO_COMPLETION_STAMPS",
      detail: `${input.doneWithoutStamp} task(s) are marked done with no completion date — when they finished is unknown.`,
    });
  }

  if (subject.kind === "client" && blocks.length > 0 && !blocks.some((b) => b.startDate && b.endDate)) {
    out.push({
      kind: "NO_TIMELINE",
      detail: `${subject.label} has feature blocks but none are dated, so slippage against a plan can't be measured.`,
    });
  }

  if (subject.kind === "client" && blocks.length === 0 && openTotal > 0) {
    out.push({
      kind: "NO_TIMELINE",
      detail: `${subject.label} has no feature blocks, so there's no timeline to measure progress against.`,
    });
  }

  const quiet = doneInWindow === 0 && doingCount === 0 && openTotal > 0;
  if (quiet) {
    out.push({
      kind: "NO_RECENT_ACTIVITY",
      detail: `Nothing moved on the board in the last ${recentDays} days — open work exists but none of it is in progress.`,
    });
    // Only worth saying when the board is silent: that's exactly when someone would otherwise
    // assume nothing happened, and Slack is where the work may actually have been discussed.
    out.push({
      kind: "SLACK_NOT_READ",
      detail:
        "Dispatch reads Foundry's records only — it does not read Slack conversation, so anything agreed in chat and not tracked won't appear here.",
    });
  }

  return out;
}
