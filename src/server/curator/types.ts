/**
 * Curator — shared types + defaults.
 *
 * The Curator is a weekly background maintenance pass over two libraries:
 *   • Starters   — deterministic ACTIVE→STALE→ARCHIVED lifecycle by inactivity (auto-applied)
 *   • Pulse checks — usage aggregation + dead/always-pass/noisy classification (proposals only)
 *
 * Deterministic passes are free (pure DB work). The LLM consolidation pass is opt-in, batched,
 * light-tier, cached, and skipped entirely when there's nothing to review. See run.ts.
 */

export interface CuratorConfig {
  enabled: boolean;
  /** Days of inactivity before ACTIVE → STALE. */
  staleAfterDays: number;
  /** Days of inactivity before → ARCHIVED. */
  archiveAfterDays: number;
  /** Run the opt-in LLM consolidation pass. Off by default (costs tokens). */
  consolidate: boolean;
  /** Minimum days between runs (the cron is weekly and also gates on this). */
  intervalDays: number;
}

export const CURATOR_DEFAULTS: CuratorConfig = {
  enabled: true,
  staleAfterDays: 30,
  archiveAfterDays: 90,
  consolidate: false,
  intervalDays: 7,
};

export type StarterLifecycleState = "ACTIVE" | "STALE" | "ARCHIVED";

export type TransitionKind = "starter_stale" | "starter_archive";

/** A reversible record of one deterministic change the curator applied. */
export interface CuratorTransition {
  kind: TransitionKind;
  /** Starter id. */
  target: string;
  targetLabel?: string;
  from: StarterLifecycleState;
  to: StarterLifecycleState;
}

export type CheckSignal = "dead" | "always_pass" | "noisy";

export type ProposalKind =
  | "STARTER_ARCHIVE"
  | "STARTER_CONSOLIDATE"
  | "CHECK_DISABLE"
  | "CHECK_SEVERITY"
  | "CHECK_RELABEL";

export type ProposalStatus = "open" | "applied" | "dismissed";

/** An LLM suggestion awaiting Super-Admin approval. Never auto-applied. */
export interface CuratorProposal {
  id: string;
  kind: ProposalKind;
  /** Starter id, checkKey, or (for consolidate) a human list of what to merge. */
  target: string;
  targetLabel?: string;
  rationale: string;
  /** Kind-specific extras, e.g. { severity: "WARN" }, { label: "…" }, { mergeInto: "…" }. */
  payload?: Record<string, unknown>;
  status: ProposalStatus;
}

export interface CuratorStats {
  startersScanned: number;
  startersStaled: number;
  startersArchived: number;
  starterCandidates: number;
  checksAggregated: number;
  deadChecks: number;
  alwaysPassChecks: number;
  noisyChecks: number;
  proposalsCreated: number;
  /** True when the LLM pass was not invoked (disabled or no candidates) — cost £0. */
  aiSkipped: boolean;
}

export interface CuratorRunResult {
  runId: string;
  mode: "prune" | "consolidate" | "dry_run";
  status: "succeeded" | "failed";
  stats: CuratorStats;
  transitions: CuratorTransition[];
  proposals: CuratorProposal[];
  aiModel: string | null;
  error?: string;
}
