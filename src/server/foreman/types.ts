/**
 * Foreman — shared types + defaults.
 *
 * Foreman is a daily (09:00) delivery-risk watchdog. It's a pure read/aggregate pass — it never
 * mutates client data. Each run walks every active client's tasks, feature blocks, milestones and
 * developer workload and emits findings for what's overdue or about to be late, always carrying the
 * evidence that triggered the flag and a concrete suggested fix. It also audits its own blind spots
 * (missing due dates / timelines) so it calls out where it *can't* be confident rather than guessing
 * — that's the anti-false-flag discipline. Deterministic throughout; the AI narrative is opt-in.
 */

export type Severity = "critical" | "warn" | "info";

/** How a finding moved since the previous run — the "constantly auditing" signal. */
export type Trend = "new" | "worsening" | "improving" | "steady";

export type FindingCategory = "project" | "developer" | "blindspot";

export type ProjectFindingKind =
  | "OVERDUE_TASKS" // open tasks past their due date
  | "BLOCK_SLIPPING" // a dated feature block is past its end date and unfinished
  | "MILESTONE_MISSED" // a milestone date has passed with work outstanding
  | "MILESTONE_IMMINENT" // a milestone lands within the due-soon horizon with work outstanding
  | "DUE_SOON_CLUSTER" // a burst of tasks all falling due within the horizon
  | "UNASSIGNED_WORK"; // time-critical tasks with no owner

export type DeveloperFindingKind =
  | "DEV_OVERDUE" // a developer is carrying overdue tasks
  | "DEV_STALLED" // a developer's in-progress task hasn't moved in a while
  | "DEV_OVERLOADED"; // a developer is spread across many clients at once

export type BlindSpotKind =
  | "NO_TIMELINE" // active work but no dated feature block → slippage can't be measured
  | "NO_DUE_DATES" // a large share of open tasks have no due date → timing can't be judged
  | "BLOCK_NO_DATES"; // feature blocks exist but carry no dates → excluded from the timeline

export type FindingKind = ProjectFindingKind | DeveloperFindingKind | BlindSpotKind;

/** One flagged item in a run's frozen report. `key` is stable across runs for trend diffing. */
export interface ForemanFinding {
  /** Stable identity for trend diffing: `${kind}:${subjectId}`. */
  key: string;
  category: FindingCategory;
  kind: FindingKind;
  severity: Severity;
  /** The thing at risk — a client id, a developer's userId, a block/milestone id, etc. */
  subjectId: string;
  /** Human label for the subject (client name, developer name). */
  subjectLabel: string;
  /** Optional in-app deep link (e.g. the client's task board). */
  href?: string;
  /** One-line statement of what's wrong. */
  headline: string;
  /** The concrete evidence behind the flag — what a human can verify. */
  evidence: string[];
  /** The number the flag is keyed on (overdue count, slip days, …) — powers trend deltas. */
  metric: number;
  /** Deterministic, actionable suggestion — the "ways it might improve". */
  recommendation: string;
  /** Movement vs the previous run. */
  trend: Trend;
  /** The previous run's metric for the same key, when it existed (for "3 → 5"). */
  previousMetric: number | null;
}

export interface ForemanConfig {
  /** Master switch — cron + on-share hook no-op when off. */
  enabled: boolean;
  /** Horizon (days from today) for "about to be late" / imminent flags. */
  dueSoonDays: number;
  /** Overdue count at/above which a flag escalates warn → critical. */
  criticalOverdue: number;
  /** An in-progress task older than this (days, no movement) counts as stalled. */
  staleDoingDays: number;
  /** Run the opt-in AI narrative pass (costs a small amount). Off by default. */
  consolidate: boolean;
}

export const FOREMAN_DEFAULTS: ForemanConfig = {
  enabled: true,
  dueSoonDays: 3,
  criticalOverdue: 5,
  staleDoingDays: 5,
  consolidate: false,
};

export interface ForemanStats {
  clientsScanned: number;
  developersScanned: number;
  critical: number;
  warn: number;
  info: number;
  projectFindings: number;
  developerFindings: number;
  blindSpots: number;
  /** Findings that weren't present in the previous run. */
  newSinceLast: number;
  worseningSinceLast: number;
  improvingSinceLast: number;
  /** True when the AI narrative pass was not invoked (disabled or nothing worth summarising). */
  aiSkipped: boolean;
}

export interface ForemanNarrative {
  /** 2–3 sentence editorial read on the state of delivery. */
  summary: string;
  /** Top prioritised actions, most important first. */
  priorities: string[];
}

export interface ForemanRunResult {
  runId: string;
  mode: "scan" | "dry_run";
  status: "succeeded" | "failed";
  stats: ForemanStats;
  findings: ForemanFinding[];
  narrative: ForemanNarrative | null;
  aiModel: string | null;
  /** Whether a digest notification was dispatched (only when risk findings exist + not dry-run). */
  notified: boolean;
  error?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

/** Stable sort: severity desc, then project → developer → blindspot, then bigger metric first. */
export function sortFindings(findings: ForemanFinding[]): ForemanFinding[] {
  const catRank: Record<FindingCategory, number> = { project: 0, developer: 1, blindspot: 2 };
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      catRank[a.category] - catRank[b.category] ||
      b.metric - a.metric ||
      a.subjectLabel.localeCompare(b.subjectLabel),
  );
}
