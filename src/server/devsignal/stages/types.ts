import type { DevSignalStageStatus } from "@prisma/client";
import type { DevSignalConfigSnapshot } from "../config";

/**
 * DevSignal — the 9-stage developer vetting pipeline. Each stage emits one
 * structured StageResult. Stage 9 (score_report) is aggregation only and
 * carries no predictive weight.
 *
 * Statuses use the Prisma `DevSignalStageStatus` enum casing (UPPERCASE) as the
 * single runtime representation, so there is no lossy mapping layer between the
 * domain and the database.
 */

export const DEV_SIGNAL_STAGE_IDS = [
  "application_intake",
  "profile_connections",
  "video_assessment",
  "coding_challenge",
  "starter_fluency",
  "online_footprint",
  "identity_verification",
  "leadership_interview",
  "score_report",
] as const;

export type DevSignalStageId = (typeof DEV_SIGNAL_STAGE_IDS)[number];

export function isDevSignalStageId(value: string): value is DevSignalStageId {
  return (DEV_SIGNAL_STAGE_IDS as readonly string[]).includes(value);
}

/** Human-readable stage names — used for StageResult.stageName + UI labels. */
export const DEV_SIGNAL_STAGE_NAMES: Record<DevSignalStageId, string> = {
  application_intake: "Application intake",
  profile_connections: "Profile & channel connections",
  video_assessment: "Video assessment",
  coding_challenge: "Timed coding challenge",
  starter_fluency: "Starter fluency",
  online_footprint: "Online footprint analysis",
  identity_verification: "Identity verification",
  leadership_interview: "Leadership interview",
  score_report: "Score & report",
};

export interface DevSignalSubScore {
  key: string;
  label: string;
  /** 0..maxScore. */
  score: number;
  maxScore: number;
  rationale?: string;
}

export interface DevSignalEvidence {
  type: string;
  label: string;
  value?: string;
  url?: string;
  sourceRef?: string;
}

export type DevSignalFlagSeverity = "info" | "warn" | "block";

export interface DevSignalFlag {
  severity: DevSignalFlagSeverity;
  code: string;
  message: string;
}

/** What a stage runner returns. Persisted verbatim into a DevSignalStageResult. */
export interface DevSignalStageResultInput {
  stageId: DevSignalStageId;
  stageName: string;
  stageVersion: string;
  status: DevSignalStageStatus;
  weight: number;
  subScores: DevSignalSubScore[];
  rawSignals: unknown;
  evidence: DevSignalEvidence[];
  flags: DevSignalFlag[];
  durationMs?: number;
}

export interface DevSignalStageContext {
  workspaceId: string;
  clientId?: string | null;
  candidateId: string;
  assessmentId: string;
  configSnapshot: DevSignalConfigSnapshot;
  actorId?: string | null;
}

export interface DevSignalStageRunner {
  stageId: DevSignalStageId;
  stageName: string;
  stageVersion: string;
  run(context: DevSignalStageContext): Promise<DevSignalStageResultInput>;
}
