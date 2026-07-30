/**
 * Dispatch — shared types + defaults.
 *
 * Dispatch is the Slack-resident coordinator: @-mention it in a channel and it answers
 * "where are we with X?" / "what has Y done?" from Foundry's own system of record.
 *
 * The design rule that matters, inherited from Foreman: **it answers only from evidence it
 * actually gathered, and it says out loud what it could not confirm.** A coordinator that
 * smooths over a gap ("looks like that's done") is worse than no coordinator at all, because
 * a human then stops checking. So the pipeline is deliberately:
 *
 *     question → deterministic subject resolution → deterministic evidence pack → ONE
 *     light-tier LLM call that may only phrase what is in the pack
 *
 * The LLM never queries, never infers, and never decides what is true. It is a writer, not a
 * researcher. Everything it is allowed to say is already in `DispatchEvidence`, and every gap
 * in that pack arrives pre-labelled as a blind spot it must surface rather than paper over.
 */

export type DispatchSubjectKind = "client" | "person" | "workspace" | "none";

export type DispatchSubject =
  | { kind: "client"; id: string; label: string; slug: string }
  | { kind: "person"; id: string; label: string; email: string }
  | { kind: "workspace"; label: string };

/** Why Dispatch answered the way it did — surfaced in the panel, not swallowed. */
export type DispatchStatus =
  | "answered"
  | "no_subject" // couldn't tell which client/person the question was about
  | "rate_limited"
  | "no_ai" // no API key configured
  | "error";

export interface DispatchConfig {
  /** Master switch — the Events endpoint acks but does nothing when off. */
  enabled: boolean;
  /** How far back "recently done / recent activity" reaches, in days. */
  recentDays: number;
  /** Cap on each evidence list, so one noisy client can't blow the prompt budget. */
  maxEvidenceItems: number;
  /** Per-channel question budget per rolling hour. A chatty agent is an unbounded cost. */
  perChannelPerHour: number;
  /**
   * Whether Dispatch will answer in a Slack Connect (externally shared) channel.
   * Default FALSE and deliberately so: those channels contain the client, and Foundry's
   * internal delivery state — overdue counts, developer workload, unassigned work — is not
   * client-facing. Turning this on is a disclosure decision, not a convenience toggle.
   */
  allowExternalChannels: boolean;
}

export const DISPATCH_DEFAULTS: DispatchConfig = {
  enabled: true,
  recentDays: 7,
  maxEvidenceItems: 12,
  perChannelPerHour: 20,
  allowExternalChannels: false,
};

// ─── Evidence ───────────────────────────────────────────────────────────────
//
// Everything below is gathered deterministically from Prisma. No AI touches it.

export interface EvidenceTask {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  blockName: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignees: string[];
  blockedReason: string | null;
}

export interface EvidenceBlock {
  id: string;
  name: string;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  totalTasks: number;
  doneTasks: number;
}

export interface EvidenceMilestone {
  id: string;
  name: string;
  clientName: string | null;
  date: string;
  openTasksInClient: number;
}

export interface EvidenceMeeting {
  id: string;
  title: string;
  startedAt: string | null;
  status: string;
  summary: string | null;
  decisions: string[];
  openActionItems: string[];
}

export interface EvidenceDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  sharedAt: string | null;
  firstViewedAt: string | null;
  acceptedAt: string | null;
}

export interface EvidenceClient {
  id: string;
  name: string;
  slug: string;
  status: string;
  onboardingStatus: string | null;
  onboardingSubmittedAt: string | null;
}

/**
 * A blind spot is a thing Dispatch checked for and did not find — NOT an absence it inferred
 * meaning from. Each one is rendered to the model as something it must be honest about if the
 * question depends on it.
 */
export interface EvidenceBlindSpot {
  kind:
    | "NO_DUE_DATES" // open tasks carry no due date → "on time?" is unanswerable
    | "NO_TIMELINE" // no dated feature block → slippage can't be measured
    | "NO_TASKS" // nothing tracked for this subject at all
    | "NO_COMPLETION_STAMPS" // tasks marked DONE with no completedAt → "when" is unknown
    | "NO_RECENT_ACTIVITY" // nothing moved in the window → silence isn't progress
    | "NOT_IN_FOUNDRY" // the subject exists in Slack but has no Foundry record
    | "SLACK_NOT_READ"; // Dispatch does not read channel history (v1 scope)
  detail: string;
}

/** The complete, bounded input to the answer step. Nothing outside this may be stated. */
export interface DispatchEvidence {
  subject: DispatchSubject;
  asOf: string;
  client: EvidenceClient | null;
  overdue: EvidenceTask[];
  doing: EvidenceTask[];
  dueSoon: EvidenceTask[];
  recentlyDone: EvidenceTask[];
  blocked: EvidenceTask[];
  blocks: EvidenceBlock[];
  milestones: EvidenceMilestone[];
  meetings: EvidenceMeeting[];
  documents: EvidenceDocument[];
  /** Foreman findings already raised against this subject — reuse, don't re-derive. */
  foremanFindings: { headline: string; severity: string; evidence: string[]; recommendation: string }[];
  blindSpots: EvidenceBlindSpot[];
  counts: {
    openTasks: number;
    overdue: number;
    dueSoon: number;
    doing: number;
    doneInWindow: number;
    blocked: number;
  };
  /** True when a list was truncated by `maxEvidenceItems` — the model must not imply completeness. */
  truncated: boolean;
}

// ─── Answer ─────────────────────────────────────────────────────────────────

export interface DispatchAnswer {
  /** One line: the honest state. */
  headline: string;
  /** Supporting specifics, each traceable to the evidence pack. */
  bullets: string[];
  /** Claims Dispatch explicitly declines to make, and why. The whole point. */
  unverified: string[];
}

export interface DispatchResult {
  status: DispatchStatus;
  subject: DispatchSubject | null;
  answer: DispatchAnswer | null;
  evidence: DispatchEvidence | null;
  aiModel: string | null;
  cached: boolean;
  /** Operator-facing reason when status !== "answered". */
  message: string | null;
}
