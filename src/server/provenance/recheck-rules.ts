// Continuous re-examination — the rules, PURE (the clock is an argument, never read here).
//
// A countermark expires on purpose (lapse.ts): software changes, so a mark that never ran out
// would be a lie. "Keep this mark current" is the other half of that bargain: re-examine the
// subject before the mark runs out, and strike a successor from the fresh evidence.
//
// Three rules carry the weight, and each has a test named for it:
//   • A successor is struck ONLY from a completed scan that establishes a grade. A failed scan,
//     a scan that never finished, or an INCOMPLETE examination keeps the old mark exactly as it
//     was. Re-examination must never be the thing that makes a mark silently stop counting.
//   • A worse grade IS struck. Re-examining a certified app that has since regressed and keeping
//     the old certificate would be the opposite lie.
//   • Re-examining is issuing, so the person whose name goes on the successor must still be an
//     active member holding `provenance.issue`. Otherwise the schedule pauses and says why.

import { EXPIRY_NOTICE_DAYS } from "./lapse";
import type { CountermarkGrade } from "./types";

const MS_PER_DAY = 86_400_000;

/** The cadences offered. Null (the default) means "when the mark enters its notice window". */
export const RECHECK_CADENCES = [30, 60, 90] as const;
export type RecheckCadence = (typeof RECHECK_CADENCES)[number];

/** How often the worker looks at a running scan, and for how long before giving up. */
export const POLL_INTERVAL_MS = 2 * 60_000;
export const MAX_POLLS = 45; // 90 minutes: a full scan is minutes; this is a generous ceiling.

/** Re-checks a workspace may START in any rolling 24 hours. Each one is a full Pulse scan. */
export const MAX_RECHECKS_PER_DAY = 5;

/** After a failed attempt, try again this much later (the old mark still stands meanwhile). */
export const RETRY_AFTER_FAILURE_MS = MS_PER_DAY;

/** Consecutive failed or unestablished attempts before the schedule stops itself. */
export const MAX_FAILURE_STREAK = 5;

/** While a re-check runs, the schedule's next due date is pushed this far out (a lease), so the
 *  scheduler can never start a second scan for the same subject. Reset when the attempt ends. */
export const RUNNING_LEASE_MS = MS_PER_DAY;

export function isCadence(value: unknown): value is RecheckCadence {
  return typeof value === "number" && (RECHECK_CADENCES as readonly number[]).includes(value);
}

/**
 * When the mark should next be re-examined.
 *
 * With a cadence: that many days after the mark was issued, but never later than the start of
 * its notice window — a 90-day cadence on a 30-day conditional mark must not wait until long
 * after the mark has lapsed. Without one: the start of the notice window. A date already past
 * comes back as `now`, i.e. due straight away.
 */
export function nextDueAt(
  mark: { issuedAt: Date; expiresAt: Date },
  cadenceDays: number | null,
  now: Date,
): Date {
  const noticeStart = mark.expiresAt.getTime() - EXPIRY_NOTICE_DAYS * MS_PER_DAY;
  const byCadence = cadenceDays ? mark.issuedAt.getTime() + cadenceDays * MS_PER_DAY : noticeStart;
  const due = Math.min(byCadence, noticeStart);
  return new Date(Math.max(due, now.getTime()));
}

export type RecheckDecision =
  | { kind: "wait" }
  | { kind: "issue" }
  | { kind: "failed"; reason: string }
  | { kind: "not_established"; reason: string };

/**
 * What to do with a re-check's scan at a poll.
 *
 * `grade` is the grade the evidence WOULD earn (evaluated without writing anything); it is only
 * consulted for a completed scan. INCOMPLETE means a critical clause could not be established —
 * striking that over a mark that did establish it would replace a verdict with a shrug.
 */
export function decideRecheck(input: {
  scanStatus: string | null;
  scanError?: string | null;
  polls: number;
  grade?: CountermarkGrade | null;
  gradeReason?: string | null;
}): RecheckDecision {
  const { scanStatus } = input;
  if (scanStatus === null) {
    return { kind: "failed", reason: "The re-examination scan could not be found." };
  }
  if (scanStatus === "FAILED") {
    return {
      kind: "failed",
      reason: input.scanError?.trim()
        ? `The re-examination scan failed: ${input.scanError.trim().slice(0, 300)}`
        : "The re-examination scan failed.",
    };
  }
  if (scanStatus !== "COMPLETED") {
    if (input.polls >= MAX_POLLS) {
      return {
        kind: "failed",
        reason: `The re-examination scan did not finish within ${Math.round((MAX_POLLS * POLL_INTERVAL_MS) / 60_000)} minutes.`,
      };
    }
    return { kind: "wait" };
  }
  if (input.grade === "INCOMPLETE") {
    return {
      kind: "not_established",
      reason: input.gradeReason?.trim()
        ? `The fresh examination could not establish a grade: ${input.gradeReason.trim()}`
        : "The fresh examination could not establish a grade.",
    };
  }
  return { kind: "issue" };
}

/**
 * Why a schedule must stop rather than run, or null when it may run. Checked before a re-check
 * starts and again before a successor is struck — the issuer can lose access in between.
 */
export function pauseReason(input: {
  issuer: { active: boolean; canIssue: boolean } | null;
  issuerName: string;
  mark: { revokedAt: Date | null } | null;
  failureStreak: number;
}): string | null {
  if (!input.mark) return "The countermark this schedule keeps current no longer exists.";
  if (input.mark.revokedAt) {
    return "The countermark was revoked, so it is no longer re-examined. Strike a new mark to start again.";
  }
  if (!input.issuer || !input.issuer.active) {
    return `${input.issuerName} is no longer an active member, and re-examinations are issued in their name. Someone who can issue countermarks needs to resume it.`;
  }
  if (!input.issuer.canIssue) {
    return `${input.issuerName} can no longer issue countermarks, and re-examinations are issued in their name. Someone who can needs to resume it.`;
  }
  if (input.failureStreak >= MAX_FAILURE_STREAK) {
    return `The last ${input.failureStreak} re-examinations did not produce a mark. It has stopped trying; check the subject and resume it.`;
  }
  return null;
}

/** Whether this workspace may start another re-check now (rolling 24-hour cap). */
export function withinDailyCap(startedInLastDay: number): boolean {
  return startedInLastDay < MAX_RECHECKS_PER_DAY;
}

/** The plain-English summary a notification and the register show for a finished attempt. */
export function recheckHeadline(input: {
  subjectName: string;
  outcome: "issued" | "failed" | "not_established" | "paused";
  gradeBefore: CountermarkGrade;
  gradeAfter?: CountermarkGrade | null;
}): string {
  const label: Record<CountermarkGrade, string> = {
    CERTIFIED: "Certified",
    CONDITIONAL: "Conditional",
    NOT_CERTIFIED: "Not certified",
    INCOMPLETE: "Incomplete",
  };
  switch (input.outcome) {
    case "issued":
      return input.gradeAfter && input.gradeAfter !== input.gradeBefore
        ? `${input.subjectName} re-examined: ${label[input.gradeBefore]} → ${label[input.gradeAfter]}`
        : `${input.subjectName} re-examined: still ${label[input.gradeBefore]}`;
    case "failed":
      return `${input.subjectName}: re-examination failed, the current mark still stands`;
    case "not_established":
      return `${input.subjectName}: re-examination couldn't establish a grade, the current mark still stands`;
    case "paused":
      return `${input.subjectName}: keeping this mark current has paused`;
  }
}
