// Continuous re-examination — the persistence and job side. The rules live in
// recheck-rules.ts (pure, tested); this file reads and writes, and nothing else.
//
// Flow, all on the existing every-minute `jobs` worker (no crontab line of its own):
//   1. `startDueRechecks` (called from GET /api/cron/jobs) finds schedules that are due and
//      enqueues one deduped COUNTERMARK_RECHECK "start" job each.
//   2. "start" checks the schedule may still run, records the attempt, starts a fresh Pulse
//      scan of the same subject WITHOUT waiting for it, and enqueues a "poll" job.
//   3. "poll" re-enqueues itself every couple of minutes until the scan finishes (bounded),
//      then strikes a successor — or, if the scan failed or established nothing, records the
//      failed attempt and leaves the old mark exactly as it was.

import type { CountermarkGrade, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canIssueCountermark } from "@/server/auth/effective-user";
import { resolveEffectiveUserById } from "@/server/mcp/auth";
import { dispatchNotification } from "@/server/notifications";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import { enqueueJob } from "@/server/jobs/queue";
import {
  POLL_INTERVAL_MS,
  RETRY_AFTER_FAILURE_MS,
  RUNNING_LEASE_MS,
  decideRecheck,
  nextDueAt,
  pauseReason,
  recheckHeadline,
  withinDailyCap,
} from "./recheck-rules";
import { issueCountermark, ProvenanceError, ProvenanceNotEstablishedError } from "./issue";

const MS_PER_DAY = 86_400_000;
const CHAIN_LIMIT = 50;

export type RecheckJobPayload =
  | { phase: "start"; scheduleId: string }
  | { phase: "poll"; recheckId: string; polls: number };

/**
 * The live end of a mark's supersession chain: re-checking always works from the newest mark
 * for the subject, including one somebody struck by hand since the schedule was switched on.
 */
export async function currentMarkFor(workspaceId: string, countermarkId: string) {
  let id: string | null = countermarkId;
  for (let i = 0; i < CHAIN_LIMIT && id; i += 1) {
    const mark: {
      id: string;
      supersededById: string | null;
      revokedAt: Date | null;
      issuedAt: Date;
      expiresAt: Date;
      grade: CountermarkGrade;
      subjectName: string;
      subjectRepo: string | null;
      subjectUrl: string | null;
      scanId: string;
      clientId: string | null;
      standardId: string;
    } | null = await prisma.countermark.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        supersededById: true,
        revokedAt: true,
        issuedAt: true,
        expiresAt: true,
        grade: true,
        subjectName: true,
        subjectRepo: true,
        subjectUrl: true,
        scanId: true,
        clientId: true,
        standardId: true,
      },
    });
    if (!mark) return null;
    if (!mark.supersededById || mark.revokedAt) return mark;
    id = mark.supersededById;
  }
  return null;
}

async function issuerState(userId: string, workspaceId: string) {
  const user = await resolveEffectiveUserById(userId, workspaceId, { onlyThisWorkspace: true });
  if (!user) return null;
  return { active: true, canIssue: canIssueCountermark(user) };
}

function notify(input: {
  workspaceId: string;
  clientId: string | null;
  title: string;
  body: string | null;
  scheduleId: string;
  outcome: string;
}) {
  dispatchNotification({
    event: "provenance.recheck",
    workspaceId: input.workspaceId,
    clientId: input.clientId ?? undefined,
    title: input.title,
    body: input.body,
    actionUrl: "/app/provenance",
    target: { kind: "permission", permission: "provenance.issue" },
    groupKey: `provenance.recheck:${input.scheduleId}:${input.outcome}`,
    count: 1,
    metadata: { scheduleId: input.scheduleId, outcome: input.outcome },
  });
}

async function pauseSchedule(scheduleId: string, reason: string) {
  await prisma.countermarkSchedule.update({
    where: { id: scheduleId },
    data: { pausedReason: reason },
  });
}

/**
 * Enqueue a start job for every schedule that is due. Bounded per tick; a schedule whose attempt
 * is still running is skipped (its lease keeps it from being due, and the open attempt is
 * checked too, belt and braces).
 */
export async function startDueRechecks(now: Date = new Date()): Promise<{ enqueued: number }> {
  const due = await prisma.countermarkSchedule.findMany({
    where: { enabled: true, pausedReason: null, nextDueAt: { lte: now } },
    orderBy: { nextDueAt: "asc" },
    take: 10,
    select: { id: true, workspaceId: true },
  });
  let enqueued = 0;
  for (const schedule of due) {
    const running = await prisma.countermarkRecheck.count({
      where: { scheduleId: schedule.id, status: "running" },
    });
    if (running > 0) continue;
    const { deduped } = await enqueueJob({
      type: "COUNTERMARK_RECHECK",
      payload: { phase: "start", scheduleId: schedule.id },
      workspaceId: schedule.workspaceId,
      dedupeKey: `countermark-recheck:${schedule.id}`,
    });
    if (!deduped) enqueued += 1;
  }
  return { enqueued };
}

/** The job handler for COUNTERMARK_RECHECK. */
export async function runRecheckJob(payload: RecheckJobPayload, now: Date = new Date()) {
  return payload.phase === "start"
    ? startRecheck(payload.scheduleId, now)
    : pollRecheck(payload.recheckId, payload.polls, now);
}

async function startRecheck(scheduleId: string, now: Date) {
  const schedule = await prisma.countermarkSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || !schedule.enabled || schedule.pausedReason) return { started: false, why: "not active" };
  if (schedule.nextDueAt.getTime() > now.getTime()) return { started: false, why: "not due" };

  const open = await prisma.countermarkRecheck.count({ where: { scheduleId, status: "running" } });
  if (open > 0) return { started: false, why: "already running" };

  const mark = await currentMarkFor(schedule.workspaceId, schedule.countermarkId);
  const issuer = await issuerState(schedule.enabledById, schedule.workspaceId);
  const stop = pauseReason({
    issuer,
    issuerName: schedule.enabledByName,
    mark,
    failureStreak: schedule.failureStreak,
  });
  if (stop || !mark) {
    const reason = stop ?? "The countermark this schedule keeps current no longer exists.";
    await pauseSchedule(scheduleId, reason);
    if (mark) {
      await prisma.countermarkRecheck.create({
        data: {
          workspaceId: schedule.workspaceId,
          scheduleId,
          fromCountermarkId: mark.id,
          status: "paused",
          reason,
          gradeBefore: mark.grade,
          issuerName: schedule.enabledByName,
          finishedAt: now,
        },
      });
    }
    notify({
      workspaceId: schedule.workspaceId,
      clientId: mark?.clientId ?? null,
      title: recheckHeadline({ subjectName: schedule.subjectName, outcome: "paused", gradeBefore: mark?.grade ?? "INCOMPLETE" }),
      body: reason,
      scheduleId,
      outcome: "paused",
    });
    return { started: false, why: "paused", reason };
  }

  // Follow a mark struck by hand since the schedule was switched on.
  if (mark.id !== schedule.countermarkId) {
    await prisma.countermarkSchedule.update({ where: { id: scheduleId }, data: { countermarkId: mark.id } });
  }

  const startedToday = await prisma.countermarkRecheck.count({
    where: {
      workspaceId: schedule.workspaceId,
      status: { not: "paused" },
      startedAt: { gt: new Date(now.getTime() - MS_PER_DAY) },
    },
  });
  if (!withinDailyCap(startedToday)) {
    // Try again in an hour. The old mark stands meanwhile; nothing has been attempted.
    await prisma.countermarkSchedule.update({
      where: { id: scheduleId },
      data: { nextDueAt: new Date(now.getTime() + 60 * 60_000) },
    });
    return { started: false, why: "daily cap" };
  }

  // The subject's own inputs, from the scan the mark was struck from. Falls back to what the
  // mark itself recorded if that scan has since been pruned.
  const source = await prisma.pulseScan.findFirst({
    where: { id: mark.scanId, workspaceId: schedule.workspaceId },
    select: {
      inputType: true,
      inputUrl: true,
      inputGithubRepo: true,
      inputDescription: true,
      platform: true,
      clientId: true,
      targetMarkets: true,
    },
  });
  const inputType = source?.inputType ?? (mark.subjectRepo ? "GITHUB_REPO" : mark.subjectUrl ? "URL" : null);
  if (!inputType || inputType === "FREE_TEXT") {
    const reason = "This mark's subject has no URL or repository to re-examine.";
    await pauseSchedule(scheduleId, reason);
    return { started: false, why: "no subject", reason };
  }
  const inputUrl = source?.inputUrl ?? mark.subjectUrl ?? undefined;
  const inputGithubRepo = source?.inputGithubRepo ?? mark.subjectRepo ?? undefined;
  const clientId = source?.clientId ?? mark.clientId ?? undefined;
  const platform = source?.platform ?? undefined;
  const targetMarkets = Array.isArray(source?.targetMarkets)
    ? (source!.targetMarkets as unknown[]).filter((m): m is string => typeof m === "string")
    : undefined;

  const recheck = await prisma.countermarkRecheck.create({
    data: {
      workspaceId: schedule.workspaceId,
      scheduleId,
      fromCountermarkId: mark.id,
      status: "running",
      gradeBefore: mark.grade,
      issuerName: schedule.enabledByName,
      startedAt: now,
    },
  });
  // The lease: until this attempt ends, the schedule is not due again.
  await prisma.countermarkSchedule.update({
    where: { id: scheduleId },
    data: { nextDueAt: new Date(now.getTime() + RUNNING_LEASE_MS) },
  });

  try {
    const { scan, aiConfig } = await createPulseScanRecord({
      projectName: mark.subjectName,
      inputType,
      inputUrl,
      inputGithubRepo,
      platform,
      clientId,
      targetMarkets,
      triggeredByUserId: null,
      workspaceId: schedule.workspaceId,
    });
    await prisma.countermarkRecheck.update({ where: { id: recheck.id }, data: { scanId: scan.id } });

    // Not awaited: a scan takes minutes and the worker must stay short. The poll job watches it;
    // the pulse-reconcile cron already settles a scan whose process died mid-run.
    void runAnalysis(
      scan.id,
      { inputType, inputUrl, inputGithubRepo, platform, projectName: mark.subjectName, clientId },
      aiConfig,
    ).catch((err) => console.error("[provenance] re-examination scan failed to run", err));

    await enqueueJob({
      type: "COUNTERMARK_RECHECK",
      payload: { phase: "poll", recheckId: recheck.id, polls: 0 },
      workspaceId: schedule.workspaceId,
      dedupeKey: `countermark-recheck-poll:${recheck.id}`,
      runAt: new Date(now.getTime() + POLL_INTERVAL_MS),
    });
    return { started: true, recheckId: recheck.id, scanId: scan.id };
  } catch (err) {
    const reason = `The re-examination scan could not be started: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`;
    await finishFailed(recheck.id, scheduleId, schedule.workspaceId, reason, "failed", now);
    return { started: false, why: "start failed", reason };
  }
}

async function pollRecheck(recheckId: string, polls: number, now: Date) {
  const recheck = await prisma.countermarkRecheck.findUnique({ where: { id: recheckId } });
  if (!recheck || recheck.status !== "running") return { done: true, why: "not running" };

  const scan = recheck.scanId
    ? await prisma.pulseScan.findFirst({
        where: { id: recheck.scanId, workspaceId: recheck.workspaceId },
        select: { status: true, errorMessage: true },
      })
    : null;

  const first = decideRecheck({ scanStatus: scan?.status ?? null, scanError: scan?.errorMessage, polls });
  if (first.kind === "wait") {
    await enqueueJob({
      type: "COUNTERMARK_RECHECK",
      payload: { phase: "poll", recheckId, polls: polls + 1 },
      workspaceId: recheck.workspaceId,
      dedupeKey: `countermark-recheck-poll:${recheckId}:${polls + 1}`,
      runAt: new Date(now.getTime() + POLL_INTERVAL_MS),
    });
    return { done: false, polls: polls + 1 };
  }
  if (first.kind === "failed") {
    await finishFailed(recheckId, recheck.scheduleId, recheck.workspaceId, first.reason, "failed", now);
    return { done: true, outcome: "failed" };
  }

  // The scan completed. Re-checking is issuing, so the issuer must still be allowed to — they
  // can lose access while a scan runs.
  const schedule = await prisma.countermarkSchedule.findUnique({ where: { id: recheck.scheduleId } });
  if (!schedule) return { done: true, why: "schedule gone" };
  const mark = await currentMarkFor(recheck.workspaceId, recheck.fromCountermarkId);
  const issuer = await issuerState(schedule.enabledById, recheck.workspaceId);
  const stop = pauseReason({ issuer, issuerName: schedule.enabledByName, mark, failureStreak: 0 });
  if (stop) {
    await prisma.countermarkRecheck.update({
      where: { id: recheckId },
      data: { status: "paused", reason: stop, finishedAt: now },
    });
    await pauseSchedule(schedule.id, stop);
    notify({
      workspaceId: recheck.workspaceId,
      clientId: mark?.clientId ?? null,
      title: recheckHeadline({ subjectName: schedule.subjectName, outcome: "paused", gradeBefore: recheck.gradeBefore }),
      body: stop,
      scheduleId: schedule.id,
      outcome: "paused",
    });
    return { done: true, outcome: "paused" };
  }

  try {
    const fresh = await issueCountermark({
      workspaceId: recheck.workspaceId,
      scanId: recheck.scanId!,
      issuerName: schedule.enabledByName,
      requireEstablished: true,
      supersedesId: mark!.id,
    });
    await prisma.countermarkRecheck.update({
      where: { id: recheckId },
      data: { status: "issued", newCountermarkId: fresh.id, gradeAfter: fresh.grade, finishedAt: now },
    });
    await prisma.countermarkSchedule.update({
      where: { id: schedule.id },
      data: {
        countermarkId: fresh.id,
        failureStreak: 0,
        nextDueAt: nextDueAt(
          { issuedAt: new Date(fresh.issuedAt), expiresAt: new Date(fresh.expiresAt) },
          schedule.cadenceDays,
          now,
        ),
      },
    });
    // A routine "still certified" stays quiet; a change of grade is worth a ping.
    if (fresh.grade !== recheck.gradeBefore) {
      notify({
        workspaceId: recheck.workspaceId,
        clientId: fresh.clientId,
        title: recheckHeadline({
          subjectName: schedule.subjectName,
          outcome: "issued",
          gradeBefore: recheck.gradeBefore,
          gradeAfter: fresh.grade,
        }),
        body: fresh.gradeReason,
        scheduleId: schedule.id,
        outcome: "issued",
      });
    }
    return { done: true, outcome: "issued", countermarkId: fresh.id };
  } catch (err) {
    if (err instanceof ProvenanceNotEstablishedError) {
      const decision = decideRecheck({
        scanStatus: "COMPLETED",
        polls,
        grade: err.grade,
        gradeReason: err.gradeReason,
      });
      const reason = decision.kind === "not_established" ? decision.reason : err.message;
      await finishFailed(recheckId, schedule.id, recheck.workspaceId, reason, "not_established", now);
      return { done: true, outcome: "not_established" };
    }
    const reason =
      err instanceof ProvenanceError
        ? `A new mark could not be struck: ${err.message}`
        : `A new mark could not be struck: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`;
    await finishFailed(recheckId, schedule.id, recheck.workspaceId, reason, "failed", now);
    return { done: true, outcome: "failed" };
  }
}

/** Record a failed attempt, keep the old mark, and try again later. Never touches a countermark. */
async function finishFailed(
  recheckId: string,
  scheduleId: string,
  workspaceId: string,
  reason: string,
  outcome: "failed" | "not_established",
  now: Date,
) {
  const recheck = await prisma.countermarkRecheck.update({
    where: { id: recheckId },
    data: { status: outcome, reason, finishedAt: now },
  });
  const schedule = await prisma.countermarkSchedule.update({
    where: { id: scheduleId },
    data: {
      failureStreak: { increment: 1 },
      nextDueAt: new Date(now.getTime() + RETRY_AFTER_FAILURE_MS),
    },
  });
  const mark = await prisma.countermark.findFirst({
    where: { id: recheck.fromCountermarkId, workspaceId },
    select: { clientId: true },
  });
  notify({
    workspaceId,
    clientId: mark?.clientId ?? null,
    title: recheckHeadline({ subjectName: schedule.subjectName, outcome, gradeBefore: recheck.gradeBefore }),
    body: reason,
    scheduleId,
    outcome,
  });
}

// ─── The register's side ─────────────────────────────────────────────────────────────────

export interface RecheckRecord {
  id: string;
  status: string;
  reason: string | null;
  gradeBefore: CountermarkGrade;
  gradeAfter: CountermarkGrade | null;
  newCountermarkId: string | null;
  newCountermarkToken: string | null;
  startedAt: string;
  finishedAt: string | null;
  issuerName: string;
}

export interface ScheduleRecord {
  id: string;
  subjectName: string;
  countermarkId: string;
  enabled: boolean;
  cadenceDays: number | null;
  enabledByName: string;
  nextDueAt: string;
  pausedReason: string | null;
  failureStreak: number;
  history: RecheckRecord[];
}

/** ⚠️ `satisfies` (CLAUDE.md §50): an extracted Prisma args object is not excess-checked otherwise. */
const recheckSelect = {
  id: true,
  status: true,
  reason: true,
  gradeBefore: true,
  gradeAfter: true,
  newCountermarkId: true,
  startedAt: true,
  finishedAt: true,
  issuerName: true,
  scheduleId: true,
} as const satisfies Prisma.CountermarkRecheckSelect;

/** Every schedule in the workspace with its last ten attempts, for the register. */
export async function listSchedules(workspaceId: string): Promise<ScheduleRecord[]> {
  const schedules = await prisma.countermarkSchedule.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  if (schedules.length === 0) return [];
  const rechecks = await prisma.countermarkRecheck.findMany({
    where: { workspaceId, scheduleId: { in: schedules.map((s) => s.id) } },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: recheckSelect,
  });
  const newIds = rechecks.map((r) => r.newCountermarkId).filter((id): id is string => Boolean(id));
  const tokens = newIds.length
    ? await prisma.countermark.findMany({ where: { id: { in: newIds }, workspaceId }, select: { id: true, token: true } })
    : [];
  const tokenById = new Map(tokens.map((t) => [t.id, t.token]));
  return schedules.map((s) => ({
    id: s.id,
    subjectName: s.subjectName,
    countermarkId: s.countermarkId,
    enabled: s.enabled,
    cadenceDays: s.cadenceDays,
    enabledByName: s.enabledByName,
    nextDueAt: s.nextDueAt.toISOString(),
    pausedReason: s.pausedReason,
    failureStreak: s.failureStreak,
    history: rechecks
      .filter((r) => r.scheduleId === s.id)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        gradeBefore: r.gradeBefore,
        gradeAfter: r.gradeAfter,
        newCountermarkId: r.newCountermarkId,
        newCountermarkToken: r.newCountermarkId ? (tokenById.get(r.newCountermarkId) ?? null) : null,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        issuerName: r.issuerName,
      })),
  }));
}

/**
 * Switch "keep this mark current" on, off, or change its cadence. Switching on (or resuming a
 * paused schedule) puts the caller's name on future re-checks — they must be able to issue.
 * One schedule per subject: an existing one is updated, never duplicated.
 */
export async function setSchedule(input: {
  workspaceId: string;
  countermarkId: string;
  enabled: boolean;
  cadenceDays: number | null;
  user: { id: string; name: string };
  now?: Date;
}): Promise<ScheduleRecord> {
  const now = input.now ?? new Date();
  const mark = await currentMarkFor(input.workspaceId, input.countermarkId);
  if (!mark) throw new ProvenanceError("Countermark not found in this workspace.", 404);
  if (input.enabled && mark.revokedAt) {
    throw new ProvenanceError("A revoked countermark can't be kept current. Strike a new mark first.", 409);
  }

  const existing = await prisma.countermarkSchedule.findFirst({
    where: { workspaceId: input.workspaceId, subjectName: mark.subjectName },
    orderBy: { createdAt: "asc" },
  });
  const due = nextDueAt(mark, input.cadenceDays, now);

  if (!existing) {
    if (!input.enabled) throw new ProvenanceError("This mark isn't being kept current.", 404);
    await prisma.countermarkSchedule.create({
      data: {
        workspaceId: input.workspaceId,
        subjectName: mark.subjectName,
        countermarkId: mark.id,
        enabled: true,
        cadenceDays: input.cadenceDays,
        enabledById: input.user.id,
        enabledByName: input.user.name,
        nextDueAt: due,
      },
    });
  } else {
    const open = await prisma.countermarkRecheck.count({ where: { scheduleId: existing.id, status: "running" } });
    await prisma.countermarkSchedule.update({
      where: { id: existing.id },
      data: input.enabled
        ? {
            enabled: true,
            countermarkId: mark.id,
            cadenceDays: input.cadenceDays,
            // Resuming hands the schedule to whoever resumed it, and clears the pause.
            enabledById: input.user.id,
            enabledByName: input.user.name,
            pausedReason: null,
            failureStreak: 0,
            // Leave a running attempt's lease alone.
            ...(open > 0 ? {} : { nextDueAt: due }),
          }
        : { enabled: false },
    });
  }
  const all = await listSchedules(input.workspaceId);
  return all.find((s) => s.subjectName === mark.subjectName)!;
}

/** The mark a re-examination superseded, and the newest mark that supersedes this one — for the
 *  public certificate's lineage line. Tokens only go forward along the same subject's chain. */
export async function certificateLineage(countermark: { id: string; workspaceId: string; supersededById: string | null }) {
  const current = countermark.supersededById ? await currentMarkFor(countermark.workspaceId, countermark.supersededById) : null;
  const [currentRow, reexamination] = await Promise.all([
    current
      ? prisma.countermark.findFirst({
          where: { id: current.id, workspaceId: countermark.workspaceId },
          select: { token: true, issuedAt: true },
        })
      : Promise.resolve(null),
    prisma.countermarkRecheck.findFirst({
      where: { newCountermarkId: countermark.id, workspaceId: countermark.workspaceId, status: "issued" },
      select: { fromCountermarkId: true },
    }),
  ]);
  const previous = reexamination
    ? await prisma.countermark.findFirst({
        where: { id: reexamination.fromCountermarkId, workspaceId: countermark.workspaceId },
        select: { issuedAt: true },
      })
    : null;
  return {
    current: currentRow ? { token: currentRow.token, issuedAt: currentRow.issuedAt.toISOString() } : null,
    reexaminationOf: previous ? { issuedAt: previous.issuedAt.toISOString() } : null,
  };
}
