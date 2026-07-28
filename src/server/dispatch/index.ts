/**
 * Public surface of the Dispatch module — the Slack-resident coordinator.
 *
 * Import from here (`@/server/dispatch`) rather than reaching into the submodules, which stay
 * separate so each is small and independently testable: `resolve` and the pure parts of
 * `evidence`/`answer` carry unit tests and must never grow a DB or network dependency.
 */

export { answerQuestion } from "./respond";
export type { AnswerQuestionArgs } from "./respond";

export { resolveDispatchConfig } from "./config";

export { composeDeterministicAnswer, runAnswer } from "./answer";
export type { AnswerResult } from "./answer";

export { deriveBlindSpots, gatherEvidence } from "./evidence";
export type { GatherArgs } from "./evidence";

export {
  mentionedSlackUserIds,
  normalise,
  resolveSubject,
  stripBotMention,
} from "./resolve";
export type { ClientCandidate, PersonCandidate, ResolvedSubject } from "./resolve";

export { DISPATCH_DEFAULTS } from "./types";
export type {
  DispatchAnswer,
  DispatchConfig,
  DispatchEvidence,
  DispatchResult,
  DispatchStatus,
  DispatchSubject,
  DispatchSubjectKind,
  EvidenceBlindSpot,
  EvidenceTask,
} from "./types";
