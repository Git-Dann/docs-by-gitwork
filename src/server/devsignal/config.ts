import type { DevSignalStageId } from "./stages/types";
import { DEV_SIGNAL_STAGE_IDS } from "./stages/types";

/**
 * Pipeline configuration — the weights, ordering, and rules the scoring model
 * uses. Weights are NEVER hardcoded in business logic: every assessment
 * snapshots the config it ran under (DevSignalAssessment.configSnapshot), so a
 * historical score stays interpretable after the live config changes.
 *
 * Per-client overrides are stored as DevSignalPipelineConfig rows scoped by
 * clientId; the workspace default is the `isDefault` row.
 */

export const PIPELINE_VERSION = "devsignal-pipeline-v1";
export const DEFAULT_CONFIG_NAME = "Default";
export const DEFAULT_CONFIG_VERSION = "v1";

/** How a disabled / skipped / pending stage's weight is treated in scoring. */
export type MissingStageRule = "redistribute" | "zero";

export interface DevSignalStageConfig {
  /** When false, the stage is not run and contributes nothing to the score. */
  enabled: boolean;
  /** Position in the funnel (ascending). */
  order: number;
  /** Predictive weight. Enabled stage weights sum to 100 (score_report = 0). */
  weight: number;
  /**
   * When true, a FAIL/ERROR (or sub-threshold) result caps the whole score and
   * forces human review — the trust-gate concept. Configurable per client.
   */
  blocking: boolean;
  /** Optional 0–100 threshold below which the stage counts as a failure. */
  minScore?: number;
}

export interface DevSignalConfigSnapshot {
  name: string;
  version: string;
  pipelineVersion: string;
  stages: Record<DevSignalStageId, DevSignalStageConfig>;
  missingStageRule: MissingStageRule;
}

/**
 * Default stage weights (spec §"Default scoring model"). The timed challenge +
 * footprint (the hardest signals to fake) carry the most; score_report is
 * aggregation (weight 0). Only identity is blocking by default — "can we
 * confirm the person tested is the person hired" is the one signal that should
 * cap a score when it fails. Everything else is advisory unless a client opts in.
 *
 * `starter_fluency` (added alongside the Foundry Starters library integration) scores how a
 * candidate extends/adapts a real internal Starter spec — a work-sample signal closer to actual
 * delivery work than the pure-function coding_challenge kata, but genuinely new and unproven
 * against real outcome data yet. Weighted to debut meaningfully (matching online_footprint)
 * without displacing coding_challenge as the single highest-weighted stage or touching the one
 * blocking gate (identity_verification). Rebalanced from coding_challenge (30→25),
 * profile_connections (10→5), and online_footprint (20→15) to keep the total at 100.
 */
const DEFAULT_STAGE_CONFIG: Record<DevSignalStageId, DevSignalStageConfig> = {
  application_intake: { enabled: true, order: 1, weight: 5, blocking: false },
  profile_connections: { enabled: true, order: 2, weight: 5, blocking: false },
  video_assessment: { enabled: true, order: 3, weight: 5, blocking: false },
  coding_challenge: { enabled: true, order: 4, weight: 25, blocking: false },
  starter_fluency: { enabled: true, order: 5, weight: 15, blocking: false },
  online_footprint: { enabled: true, order: 6, weight: 15, blocking: false },
  identity_verification: { enabled: true, order: 7, weight: 10, blocking: true },
  leadership_interview: { enabled: true, order: 8, weight: 20, blocking: false },
  score_report: { enabled: true, order: 9, weight: 0, blocking: false },
};

export function buildDefaultConfigSnapshot(): DevSignalConfigSnapshot {
  return {
    name: DEFAULT_CONFIG_NAME,
    version: DEFAULT_CONFIG_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    // Deep clone so callers can't mutate the shared default.
    stages: structuredClone(DEFAULT_STAGE_CONFIG),
    missingStageRule: "redistribute",
  };
}

/** The stored (DB) representation of the default config, for seeding + the API. */
export function buildDefaultConfigRow() {
  const snapshot = buildDefaultConfigSnapshot();
  return {
    name: snapshot.name,
    version: snapshot.version,
    isDefault: true,
    enabledStages: DEV_SIGNAL_STAGE_IDS.filter((id) => snapshot.stages[id].enabled),
    stageOrder: [...DEV_SIGNAL_STAGE_IDS].sort(
      (a, b) => snapshot.stages[a].order - snapshot.stages[b].order,
    ),
    stageWeights: Object.fromEntries(
      DEV_SIGNAL_STAGE_IDS.map((id) => [id, snapshot.stages[id].weight]),
    ),
    blockingRules: Object.fromEntries(
      DEV_SIGNAL_STAGE_IDS.map((id) => [id, snapshot.stages[id].blocking]),
    ),
  };
}

/** Total predictive weight across enabled stages (should be 100 for the default). */
export function totalEnabledWeight(snapshot: DevSignalConfigSnapshot): number {
  return DEV_SIGNAL_STAGE_IDS.reduce(
    (sum, id) => (snapshot.stages[id].enabled ? sum + snapshot.stages[id].weight : sum),
    0,
  );
}

/** The stored-config fields needed to rebuild a snapshot (loose to avoid a Prisma import). */
export interface StoredConfigRow {
  name: string;
  version: string;
  enabledStages: unknown;
  stageOrder: unknown;
  stageWeights: unknown;
  blockingRules?: unknown;
}

/**
 * Rebuild a config snapshot from a stored DevSignalPipelineConfig row. This is
 * the mapping every assessment's score depends on, so it is pure + tested.
 */
export function configRowToSnapshot(row: StoredConfigRow): DevSignalConfigSnapshot {
  const weights = (row.stageWeights ?? {}) as Record<string, number>;
  const blocking = (row.blockingRules ?? {}) as Record<string, boolean>;
  const enabled = new Set((row.enabledStages ?? []) as string[]);
  const order = (row.stageOrder ?? []) as string[];
  const stages = {} as Record<DevSignalStageId, DevSignalStageConfig>;
  for (const id of DEV_SIGNAL_STAGE_IDS) {
    const orderIdx = order.indexOf(id);
    stages[id] = {
      enabled: enabled.has(id),
      order: orderIdx >= 0 ? orderIdx + 1 : 999,
      weight: weights[id] ?? 0,
      blocking: blocking[id] ?? false,
    };
  }
  return {
    name: row.name,
    version: row.version,
    pipelineVersion: PIPELINE_VERSION,
    stages,
    missingStageRule: "redistribute",
  };
}
