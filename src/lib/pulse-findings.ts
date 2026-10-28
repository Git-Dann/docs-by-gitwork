/**
 * Pulse findings: the one list of problems a scan found, and what the team decided
 * about each. Pure, so the page, the demo, the API and the tests share one definition.
 *
 * Before this, a scan showed the same problem up to six times (AI-written blockers,
 * gaps, quick wins and a plan, plus two "fix first" lists from the checks), and none of
 * them could be acted on. A finding is now a failing or warning CHECK, the only
 * evidence-backed source. The AI write-up summarises above it; it is not a second list.
 *
 * What is stored is the team's DECISION (accepted risk, not a real issue) and the task
 * a finding was sent to, per project (the scanned site or repo, `targetKey`), so it
 * carries from one scan to the next. Whether a finding is fixed is never stored: a check
 * that passes on the next scan is fixed, whoever did the work and whether or not anyone
 * marked anything (the §47.2 rule: store facts, derive the judgement).
 */

import { computePriority } from "@/server/pulse-checks/priority";
import { isDerivedRestatement } from "@/server/pulse-checks/standards-derived";

export type FindingDecision = "ACCEPTED_RISK" | "FALSE_POSITIVE";

/** What a person decided about one finding of one project. */
export interface FindingState {
  checkKey: string;
  decision: FindingDecision | null;
  note: string | null;
  taskId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  /** `findingFingerprint` of the check when the decision was made. Null on older decisions. */
  fingerprint?: string | null;
  /** The check's status (FAIL / WARN) when the decision was made. */
  decisionStatus?: string | null;
  /** A scan of this project after the decision passed the check (derived by the server). */
  passedSinceDecision?: boolean;
}

/** The board task a finding was sent to, as the board sees it now. */
export interface FindingTask {
  id: string;
  status: string;
  title: string;
  assigneeName: string | null;
  /** The slug of the client whose board it is on, for the link to it. */
  clientSlug: string | null;
}

/**
 * Where a finding's task is on the client's board: the same deep link the task
 * notifications and the Desk use (`?task=` opens the task on the board). Null when the
 * board is not known.
 */
export function findingTaskHref(task: Pick<FindingTask, "id" | "clientSlug">): string | null {
  if (!task.clientSlug) return null;
  return `/app/portal/${encodeURIComponent(task.clientSlug)}/tasks?task=${encodeURIComponent(task.id)}`;
}

export type FindingStage =
  | "open"            // failing or warning, nobody has acted
  | "reopened"        // was dismissed, but the finding has changed since (see staleDecision)
  | "in_progress"     // sent to the board, task not done
  | "task_done"       // task marked done but the check still fails on this scan
  | "fixed"           // the check passes now, after failing before or after a decision
  | "accepted"        // the team accepted the risk
  | "false_positive"  // the team says it is not a real issue
  | "unchecked";      // Pulse could not establish it

export interface FindingCheck {
  checkKey: string;
  label: string;
  category: string;
  status: string;
  detail: string | null;
  evidence?: string | null;
}

export interface Finding<C extends FindingCheck = FindingCheck> {
  check: C;
  stage: FindingStage;
  state: FindingState | null;
  task: FindingTask | null;
  /** Why a dismissal no longer holds, when it does not. */
  reopened: ReopenReason | null;
}

/**
 * Why a decision no longer covers what this scan found:
 * - `returned`: a later scan passed the check, and it fails again. The decision was about
 *   the old instance; this is a new one. Applies to both decisions.
 * - `worse`: it was a warning when decided and is a failure now. Applies to both decisions:
 *   a risk accepted as a warning was not accepted as a failure.
 * - `changed`: what Pulse found (the detail and evidence) is materially different. Applies
 *   to "not a real issue" only: that judgement was about what Pulse reported, so a different
 *   report needs a fresh look. An accepted risk is about the issue itself, so new wording of
 *   the same failure does not reopen it.
 */
export type ReopenReason = "returned" | "worse" | "changed";

/**
 * A short, stable fingerprint of what a check found, used to tell whether a dismissed
 * finding has changed. Numbers are folded to `#` and whitespace and case are ignored, so
 * "3 pages" becoming "4 pages" is the same finding, while a different header, path or
 * message is not. FNV-1a, so it is identical in the browser and on the server.
 */
export function findingFingerprint(check: { detail?: string | null; evidence?: string | null }): string {
  const text = `${check.detail ?? ""}\n${check.evidence ?? ""}`.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Whether a decision still covers a failing check (null), or why it does not. */
export function staleDecision(check: FindingCheck, state: FindingState | null): ReopenReason | null {
  if (!state?.decision || !ADVERSE.has(check.status)) return null;
  if (state.passedSinceDecision) return "returned";
  if (state.decisionStatus === "WARN" && check.status === "FAIL") return "worse";
  if (state.decision === "FALSE_POSITIVE" && state.fingerprint && state.fingerprint !== findingFingerprint(check)) return "changed";
  return null;
}

const ADVERSE = new Set(["FAIL", "WARN"]);
const UNCHECKED = new Set(["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"]);
const DONE = new Set(["DONE"]);

/**
 * Every finding of a scan, with its stage.
 *
 * `previouslyAdverse` is the set of check keys that failed or warned on the previous scan
 * of the same project, so a check that has since started passing reads as fixed even when
 * nobody sent it anywhere.
 */
export function buildFindings<C extends FindingCheck>(
  checks: C[],
  states: FindingState[],
  tasks: FindingTask[],
  previouslyAdverse: ReadonlySet<string> = new Set(),
): Finding<C>[] {
  const stateOf = new Map(states.map((s) => [s.checkKey, s]));
  const taskOf = new Map(tasks.map((t) => [t.id, t]));
  const out: Finding<C>[] = [];
  for (const check of checks) {
    const state = stateOf.get(check.checkKey) ?? null;
    const task = state?.taskId ? taskOf.get(state.taskId) ?? null : null;
    let stage: FindingStage | null = null;
    const reopened = staleDecision(check, state);
    if (ADVERSE.has(check.status)) {
      // A decision outranks a task: someone looked at the work and chose to stop. A decision
      // that no longer covers what was found does not (see staleDecision).
      if (state?.decision === "ACCEPTED_RISK" && !reopened) stage = "accepted";
      else if (state?.decision === "FALSE_POSITIVE" && !reopened) stage = "false_positive";
      // A task the board says is done, on a check that still fails, is not fixed. Saying
      // so is the point: "done" on the board and failing in the product disagree.
      else if (task) stage = DONE.has(task.status) ? "task_done" : "in_progress";
      else stage = reopened ? "reopened" : "open";
    } else if (UNCHECKED.has(check.status)) {
      stage = "unchecked";
    } else if (check.status === "PASS" && (state || previouslyAdverse.has(check.checkKey))) {
      stage = "fixed";
    }
    if (stage) out.push({ check, stage, state, task, reopened });
  }
  return out;
}

/** The order findings are listed in within a stage: failures before warnings, then by label. */
export function compareFindings(a: Finding, b: Finding, rank?: (checkKey: string) => number): number {
  if (rank) {
    const d = rank(b.check.checkKey) - rank(a.check.checkKey);
    if (d !== 0) return d;
  }
  if (a.check.status !== b.check.status) return a.check.status === "FAIL" ? -1 : 1;
  return a.check.label.localeCompare(b.check.label);
}

/** The views the list offers, in order, and which stages each holds. */
export const FINDING_VIEWS: { id: FindingView; label: string; stages: FindingStage[] }[] = [
  { id: "open", label: "Open", stages: ["open", "reopened", "task_done"] },
  { id: "in_progress", label: "On the board", stages: ["in_progress"] },
  { id: "fixed", label: "Fixed", stages: ["fixed"] },
  { id: "dismissed", label: "Dismissed", stages: ["accepted", "false_positive"] },
  { id: "unchecked", label: "Couldn't check", stages: ["unchecked"] },
];
export type FindingView = "open" | "in_progress" | "fixed" | "dismissed" | "unchecked";

export function countByView(findings: Finding[]): Record<FindingView, number> {
  const counts = { open: 0, in_progress: 0, fixed: 0, dismissed: 0, unchecked: 0 } as Record<FindingView, number>;
  for (const v of FINDING_VIEWS) counts[v.id] = findings.filter((f) => v.stages.includes(f.stage)).length;
  return counts;
}

/** A check as far as the open/urgent counts need it. Priority reads category and certainty. */
export interface CountableCheck {
  checkKey: string;
  status: string;
  category?: string | null;
  confidence?: string | null;
  trustBucket?: string | null;
  detail?: string | null;
  evidence?: string | null;
}

/**
 * How many findings a scan has open, and how many of those are urgent (P1), by the same
 * rules the Findings tab counts and ranks with. Used where only the numbers are wanted
 * (the Projects list), so a project can never read "on track" beside urgent findings the
 * scan page lists first.
 */
export function openFindingCounts(checks: CountableCheck[], states: FindingState[], tasks: FindingTask[]): { open: number; urgent: number } {
  const full = checks.map((c) => ({ checkKey: c.checkKey, status: c.status, label: c.checkKey, category: c.category ?? "", detail: c.detail ?? null, evidence: c.evidence ?? null }));
  const byKey = new Map(checks.map((c) => [c.checkKey, c]));
  const openStages = FINDING_VIEWS.find((v) => v.id === "open")!.stages;
  const open = buildFindings(full, states, tasks).filter((f) => openStages.includes(f.stage));
  const urgent = open.filter((f) => {
    const c = byKey.get(f.check.checkKey)!;
    if (isDerivedRestatement(c.checkKey)) return false;
    return computePriority({ checkKey: c.checkKey, status: c.status, category: c.category ?? "", confidence: c.confidence ?? null, trustBucket: c.trustBucket ?? null } as Parameters<typeof computePriority>[0]).tier === "P1";
  }).length;
  return { open: open.length, urgent };
}

/** How many findings a scan has open. See `openFindingCounts`. */
export function countOpenFindings(checks: CountableCheck[], states: FindingState[], tasks: FindingTask[]): number {
  return openFindingCounts(checks, states, tasks).open;
}

/** What a stage says in a row, in plain words. */
export function stageLabel(f: Finding): string {
  switch (f.stage) {
    case "open": return f.check.status === "FAIL" ? "Failing" : "Warning";
    case "in_progress": return f.task && ["DOING", "IN_REVIEW"].includes(f.task.status) ? "In progress" : "On the board";
    case "reopened": return f.reopened === "returned" ? "Failing again after passing" : f.reopened === "worse" ? "Worse since dismissed" : "Changed since dismissed";
    case "task_done": return "Task done, still failing";
    case "fixed": return "Fixed";
    case "accepted": return "Risk accepted";
    case "false_positive": return "Not a real issue";
    case "unchecked": return "Couldn't check";
  }
}

/** The task a finding becomes when sent to the client's board. */
export function findingTask(check: FindingCheck, scanId: string): { title: string; description: string; priority: "HIGH" | "MEDIUM"; metadata: Record<string, unknown> } {
  return {
    title: `[Pulse] ${check.label}`,
    description: [check.detail, check.evidence].filter(Boolean).join("\n\n"),
    priority: check.status === "FAIL" ? "HIGH" : "MEDIUM",
    metadata: { source: "pulse_scan", pulseScanId: scanId, pulseCheckKey: check.checkKey, pulseCategory: check.category },
  };
}
