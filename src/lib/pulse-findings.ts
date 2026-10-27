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

export type FindingDecision = "ACCEPTED_RISK" | "FALSE_POSITIVE";

/** What a person decided about one finding of one project. */
export interface FindingState {
  checkKey: string;
  decision: FindingDecision | null;
  note: string | null;
  taskId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
}

/** The board task a finding was sent to, as the board sees it now. */
export interface FindingTask {
  id: string;
  status: string;
  title: string;
  assigneeName: string | null;
}

export type FindingStage =
  | "open"            // failing or warning, nobody has acted
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
    if (ADVERSE.has(check.status)) {
      // A decision outranks a task: someone looked at the work and chose to stop.
      if (state?.decision === "ACCEPTED_RISK") stage = "accepted";
      else if (state?.decision === "FALSE_POSITIVE") stage = "false_positive";
      // A task the board says is done, on a check that still fails, is not fixed. Saying
      // so is the point: "done" on the board and failing in the product disagree.
      else if (task) stage = DONE.has(task.status) ? "task_done" : "in_progress";
      else stage = "open";
    } else if (UNCHECKED.has(check.status)) {
      stage = "unchecked";
    } else if (check.status === "PASS" && (state || previouslyAdverse.has(check.checkKey))) {
      stage = "fixed";
    }
    if (stage) out.push({ check, stage, state, task });
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
  { id: "open", label: "Open", stages: ["open", "task_done"] },
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

/** What a stage says in a row, in plain words. */
export function stageLabel(f: Finding): string {
  switch (f.stage) {
    case "open": return f.check.status === "FAIL" ? "Failing" : "Warning";
    case "in_progress": return f.task && ["DOING", "IN_REVIEW"].includes(f.task.status) ? "In progress" : "On the board";
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
