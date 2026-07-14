import type { ClientFacingSummary } from "@/server/devsignal/best-match";
import type { DevSignalScoreBreakdown } from "@/server/devsignal/scoring";
import type {
  DevSignalEvidence,
  DevSignalFlag,
  DevSignalStageId,
  DevSignalSubScore,
} from "@/server/devsignal/stages/types";

export type DevSignalAssessmentStatus =
  | "DRAFT"
  | "RUNNING"
  | "PENDING_HUMAN"
  | "COMPLETED"
  | "FAILED"
  | "ARCHIVED";

export type DevSignalDecision =
  | "NONE"
  | "APPROVED_FOR_STAGING"
  | "REJECTED"
  | "NEEDS_MORE_INFO"
  | "APPROVED_FOR_CODE";

export type DevSignalStageStatus =
  | "PENDING"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "WARN"
  | "SKIPPED"
  | "PENDING_HUMAN"
  | "ERROR";

export interface DevSignalStageResultDTO {
  id: string;
  stageId: DevSignalStageId | string;
  stageName: string;
  stageVersion: string;
  status: DevSignalStageStatus;
  weight: number;
  subScores: DevSignalSubScore[];
  rawSignals: unknown;
  evidence: DevSignalEvidence[];
  flags: DevSignalFlag[];
  durationMs: number | null;
  humanOverride: boolean;
  overrideReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DevSignalOutcomeLinkDTO {
  id: string;
  placementId: string | null;
  source: string | null;
  notes: string | null;
  linkedAt: string | null;
  retained: boolean | null;
  tenureDays: number | null;
  clientRating: number | null;
  churned: boolean | null;
}

export interface DevSignalAssessmentDTO {
  id: string;
  workspaceId: string;
  clientId: string | null;
  candidateId: string;
  candidateName: string;
  candidateGithubHandle: string | null;
  pipelineVersion: string;
  configVersion: string;
  status: DevSignalAssessmentStatus;
  decision: DevSignalDecision;
  decisionReason: string | null;
  finalScore: number | null;
  scoreBreakdown: DevSignalScoreBreakdown | null;
  bestMatchSummary: ClientFacingSummary | null;
  flags: DevSignalFlag[];
  /** Only included for admin detail views — never on client-facing endpoints. */
  publicToken?: string | null;
  tokenExpiresAt?: string | null;
  promotedToCode: boolean;
  promotedToCodeAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stageResults?: DevSignalStageResultDTO[];
  outcomeLinks?: DevSignalOutcomeLinkDTO[];
  /** GDPR consent record (admin detail only). Null until the candidate accepts. */
  consent?: DevSignalConsentDTO | null;
  /** Candidate data-rights requests (admin detail only). */
  dataRequests?: DevSignalDataRequestDTO[];
}

export interface DevSignalConsentDTO {
  noticeVersion: string;
  processing: boolean;
  humanReview: boolean;
  transcriptRetention?: boolean;
  agreedAt: string;
}

export type DevSignalDataRequestType = "EXPLANATION" | "APPEAL" | "ERASURE";
export type DevSignalDataRequestStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface DevSignalDataRequestDTO {
  id: string;
  type: DevSignalDataRequestType;
  status: DevSignalDataRequestStatus;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DevSignalPipelineConfigDTO {
  id: string;
  clientId: string | null;
  name: string;
  version: string;
  isDefault: boolean;
  enabledStages: string[];
  stageOrder: string[];
  stageWeights: Record<string, number>;
  blockingRules: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

// ─── public candidate flow (/vet/[token]) — safe, no scores ──────────────────

export interface PublicChallengeDTO {
  id: string;
  title: string;
  language: "javascript" | "typescript";
  difficulty: "junior" | "mid" | "senior" | "staff";
  promptMarkdown: string;
  functionName: string;
  starterCode: string;
  timeLimitSec: number;
  testCount: number;
  /** Full suite (runs in-browser). `hidden` = not detailed in the UI as an example. */
  tests: Array<{ name: string; args: unknown[]; expected: unknown; hidden: boolean }>;
}

/** Admin view of a bank challenge (id === slug; full tests incl. hidden flags). */
export interface DevSignalChallengeDTO {
  id: string;
  title: string;
  language: "javascript" | "typescript";
  difficulty: "junior" | "mid" | "senior" | "staff";
  roles: string[];
  stacks: string[];
  competencies: string[];
  promptMarkdown: string;
  functionName: string;
  starterCode: string;
  timeLimitSec: number;
  tests: Array<{ name: string; args: unknown[]; expected: unknown; hidden?: boolean }>;
}

export interface PublicVetCandidate {
  name: string;
  email: string | null;
  githubHandle: string | null;
  location: string | null;
  timezone: string | null;
  primaryStack: string | null;
  yearsExperience: number | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  availability: string | null;
}

export interface PublicVetSession {
  token: string;
  status: DevSignalAssessmentStatus;
  /** True once the candidate has completed + submitted the flow. */
  submitted: boolean;
  candidate: PublicVetCandidate;
  /** True once the candidate has accepted the processing notice (required first). */
  consentGiven: boolean;
  githubConnected: boolean;
  challenge: PublicChallengeDTO | null;
  challengeSubmitted: boolean;
  videoQuestion: string;
  videoSubmitted: boolean;
  identitySubmitted: boolean;
  expired: boolean;
}

export interface DevSignalAnalyticsDTO {
  total: number;
  byStatus: Record<string, number>;
  byDecision: Record<string, number>;
  promotedToCode: number;
  averageFinalScore: number | null;
  outcomeLinks: number;
  modelStatus: {
    status: "insufficient" | "provisional" | "calibrated";
    n: number;
    overallValidity: number | null;
  };
}
