// ─────────────────────────────────────────────────────────────────────────────
// SCAN DIFF — what changed since last time, and what we can no longer say.
//
// This is the "has the fix been proven?" half of the assurance model, and it is
// the surface where an overstatement does the most damage: a client reads
// "3 fixed" and stops looking.
//
// The rule that makes it trustworthy is a single asymmetry:
//
//   A FIX MUST BE PROVEN. A DISAPPEARANCE MUST NOT BE MISTAKEN FOR ONE.
//
// The previous implementation broke it twice, both silently:
//
//   1. A check that FAILED last time and is MISSING now vanished from every
//      list. Not fixed, not new, not regressed — simply unmentioned. That is
//      what a scan looks like when a collector errors, when a repository stops
//      being reachable, or when someone switches the check off. The finding is
//      still true; the report just stopped saying so.
//
//   2. Any `status === "PASS"` counted as a fix, at any confidence. A
//      LOW-confidence PASS is one the score itself declines to count, because a
//      probe that could not complete is not evidence. It should certainly not
//      be able to close a finding.
//
// So there is a fourth bucket — `unverified` — and it is the point of this
// file. "We can no longer confirm this" is a different fact from "this is
// fixed" and from "this is still broken", and it is the one a remediation
// workflow must never lose. Same distinction as Provenance's UNPROVEN (§38) and
// the release gate's INCONCLUSIVE.
//
// Pure and DB-free so it can be unit-tested; the query lives in pulse.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseCheckStatus, CheckConfidence } from "@/types/pulse";

/** The subset of a stored check row this needs. Deliberately narrow. */
export interface DiffCheck {
  checkKey: string;
  label: string;
  category: string;
  status: PulseCheckStatus;
  /**
   * Required, not optional. A caller that narrowed its `select` and omitted it
   * would otherwise silently get "every PASS counts as proof" — the exact
   * failure this file exists to prevent. Null is honest; absent is not.
   *
   * Typed `string` because the column is `String?`, not an enum. That is the
   * fail-CLOSED direction: an unrecognised value is treated as unproven rather
   * than trusted, so a stray write can only ever make the diff more cautious.
   */
  confidence: CheckConfidence | string | null;
}

export type UnverifiedReason =
  | "CHECK_ABSENT"
  | "PROBE_INCONCLUSIVE"
  | "CHECK_DISABLED"
  | "NOT_APPLICABLE_NOW"
  | "PASS_NOT_PROVEN";

export interface DiffItem {
  checkKey: string;
  label: string;
  category: string;
  status: PulseCheckStatus;
  prevStatus?: PulseCheckStatus;
}

/**
 * Its own type, and `status` is nullable here and nowhere else: the commonest
 * unverified case is a control that produced no row at all, and a made-up
 * status would be the very fiction this bucket exists to avoid.
 */
export interface UnverifiedDiffItem {
  checkKey: string;
  label: string;
  category: string;
  status: PulseCheckStatus | null;
  prevStatus: PulseCheckStatus;
  reason: UnverifiedReason;
  /** One sentence a non-engineer can act on. */
  detail: string;
}

export interface ChecksDiff {
  /** Was an issue, and is now PASSING WITH PROOF. */
  fixed: DiffItem[];
  /** Was passing, now an issue. */
  regressed: DiffItem[];
  /** An issue that was not present last time. */
  newIssues: DiffItem[];
  /**
   * Was an issue, and this scan cannot say whether it still is. NOT a fix and
   * NOT a regression — an outstanding finding whose evidence went missing.
   */
  unverified: UnverifiedDiffItem[];
}

const ISSUE: ReadonlySet<PulseCheckStatus> = new Set(["FAIL", "WARN"]);

/** Statuses that mean "we tried and could not establish an answer". */
const CANNOT_SAY: ReadonlySet<PulseCheckStatus> = new Set([
  "INCONCLUSIVE",
  "ERROR",
  "EVIDENCE_REQUIRED",
]);

/**
 * A PASS only closes a finding when we would have believed it as evidence.
 *
 * LOW confidence is already excluded from the score as an unprovable outcome;
 * letting it close a finding would make it *more* powerful in the remediation
 * flow than it is in the maths, which is backwards. A null confidence is
 * treated as unproven for the same reason — an unannotated row is a row we know
 * nothing about.
 */
export function isProvenPass(check: DiffCheck): boolean {
  return check.status === "PASS" && (check.confidence === "HIGH" || check.confidence === "MEDIUM");
}

function unverifiedFor(previous: DiffCheck, current: DiffCheck | undefined): UnverifiedDiffItem {
  const base = {
    checkKey: previous.checkKey,
    label: previous.label,
    category: previous.category,
    prevStatus: previous.status,
  };

  if (!current) {
    return {
      ...base,
      status: null,
      reason: "CHECK_ABSENT",
      detail:
        "This control did not run in the current scan, so the finding from last time is neither confirmed nor cleared. It is still outstanding until something proves otherwise.",
    };
  }
  if (current.status === "NOT_TESTED") {
    return {
      ...base,
      status: current.status,
      reason: "CHECK_DISABLED",
      detail:
        "This control is switched off in workspace settings, so the finding from last time was not re-tested. Turning a check off does not resolve what it found.",
    };
  }
  if (current.status === "SKIPPED" || current.status === "NOT_APPLICABLE") {
    return {
      ...base,
      status: current.status,
      reason: "NOT_APPLICABLE_NOW",
      detail:
        "This control no longer applies to what was scanned — usually a different target or a changed project shape. The earlier finding was not cleared, it stopped being asked about.",
    };
  }
  if (CANNOT_SAY.has(current.status)) {
    return {
      ...base,
      status: current.status,
      reason: "PROBE_INCONCLUSIVE",
      detail:
        "The probe for this control did not complete, so it cannot say whether the earlier finding still stands.",
    };
  }
  // Reaching here means PASS at LOW/absent confidence.
  return {
    ...base,
    status: current.status,
    reason: "PASS_NOT_PROVEN",
    detail:
      "This control passed, but on evidence too weak to count as proof — the same standard the score uses. Treated as unconfirmed rather than fixed.",
  };
}

export function diffChecks(previous: DiffCheck[], current: DiffCheck[]): ChecksDiff {
  const prevByKey = new Map(previous.map((check) => [check.checkKey, check]));
  const currentByKey = new Map(current.map((check) => [check.checkKey, check]));

  const fixed: DiffItem[] = [];
  const regressed: DiffItem[] = [];
  const newIssues: DiffItem[] = [];
  const unverified: UnverifiedDiffItem[] = [];

  for (const check of current) {
    const before = prevByKey.get(check.checkKey);
    const item: DiffItem = {
      checkKey: check.checkKey,
      label: check.label,
      category: check.category,
      status: check.status,
      prevStatus: before?.status,
    };
    if (!before) {
      if (ISSUE.has(check.status)) newIssues.push(item);
    } else if (before.status === "PASS" && ISSUE.has(check.status)) {
      regressed.push(item);
    }
    // The was-an-issue cases are handled in the second pass below, so that a
    // previously-failing check reaches exactly one conclusion whether or not it
    // appears in this scan at all.
  }

  // Walk the PREVIOUS scan's issues. This is the pass the old implementation did
  // not have, and its absence is what let a finding disappear.
  for (const before of previous) {
    if (!ISSUE.has(before.status)) continue;
    const now = currentByKey.get(before.checkKey);
    if (now && isProvenPass(now)) {
      fixed.push({
        checkKey: before.checkKey,
        label: now.label,
        category: now.category,
        status: now.status,
        prevStatus: before.status,
      });
    } else if (!now || !ISSUE.has(now.status)) {
      // Still an issue → nothing to report here; it simply persists.
      unverified.push(unverifiedFor(before, now));
    }
  }

  return { fixed, regressed, newIssues, unverified };
}

/** One line for a report header or a Slack message. */
export function describeDiff(diff: ChecksDiff): string {
  const parts = [`${diff.fixed.length} fixed`, `${diff.regressed.length} regressed`, `${diff.newIssues.length} new`];
  // Always stated, including when zero — a change summary that mentions
  // unverified findings only when there are some teaches a reader that its
  // absence means nothing went missing, which is not what silence proves.
  parts.push(`${diff.unverified.length} no longer verifiable`);
  return parts.join(" · ");
}
