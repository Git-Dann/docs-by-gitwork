import type { DevSignalStageStatus } from "@prisma/client";
import type { DevSignalConfigSnapshot } from "./config";
import type { DevSignalStageId, DevSignalSubScore, DevSignalFlag } from "./stages/types";
import { DEV_SIGNAL_STAGE_IDS } from "./stages/types";

/**
 * DevSignal scoring — turns the stage results + the config snapshot into one
 * explainable 0–100 score. Every point traces back to a stage, its sub-scores,
 * its weight, and this formula version (hard rules 9–12).
 *
 * Rules:
 *  - Only ENABLED stages with weight > 0 contribute (score_report is weight 0).
 *  - A stage's raw score (0–100) is the sum of its sub-scores normalised to
 *    their max, or — when it has no sub-scores — derived from its status.
 *  - SKIPPED / PENDING / PENDING_HUMAN stages are handled per the config's
 *    `missingStageRule`: "redistribute" drops them from the denominator,
 *    "zero" counts them as 0 at full weight.
 *  - A blocking stage that FAILs/ERRORs (or scores below its minScore) caps the
 *    whole score and forces human review — the trust-gate.
 *  - PENDING_HUMAN anywhere, or any `block`-severity flag, forces human review.
 *
 * This module is pure (no IO) so it is fully unit-testable.
 */

export const FORMULA_VERSION = "devsignal-score-v1";

/** A blocking failure caps the final score to this ceiling. */
export const BLOCKING_FAIL_CAP = 40;

/** Status → raw 0–100 score when a stage emitted no sub-scores. */
const STATUS_FALLBACK_SCORE: Partial<Record<DevSignalStageStatus, number>> = {
  PASS: 100,
  WARN: 60,
  FAIL: 0,
  ERROR: 0,
};

export interface ScoringStageInput {
  stageId: DevSignalStageId;
  status: DevSignalStageStatus;
  subScores?: DevSignalSubScore[] | null;
  flags?: DevSignalFlag[] | null;
}

export interface ScoreStageBreakdown {
  stageId: DevSignalStageId;
  status: DevSignalStageStatus;
  included: boolean;
  reason: string;
  rawStageScore: number;
  weight: number;
  effectiveWeight: number;
  /** Points this stage contributed to the final 0–100 score. */
  contribution: number;
}

export interface DevSignalScoreBreakdown {
  formulaVersion: string;
  configVersion: string;
  pipelineVersion: string;
  finalScore: number;
  /** Weighted score before any blocking cap. */
  weightedScore: number;
  cappedByStageId: DevSignalStageId | null;
  cap: number | null;
  stages: ScoreStageBreakdown[];
  blockingFailures: DevSignalStageId[];
  humanReviewRequired: boolean;
}

/** Normalise a stage's sub-scores to a 0–100 figure. */
export function rawScoreFromSubScores(subScores: DevSignalSubScore[]): number {
  const maxTotal = subScores.reduce((s, x) => s + Math.max(0, x.maxScore), 0);
  if (maxTotal <= 0) return 0;
  const total = subScores.reduce(
    (s, x) => s + Math.min(Math.max(0, x.score), Math.max(0, x.maxScore)),
    0,
  );
  return clamp((total / maxTotal) * 100);
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function rawStageScore(stage: ScoringStageInput): number {
  if (stage.subScores && stage.subScores.length > 0) {
    return rawScoreFromSubScores(stage.subScores);
  }
  return STATUS_FALLBACK_SCORE[stage.status] ?? 0;
}

/** True when the status means "we don't have a usable result for this stage". */
function isMissing(status: DevSignalStageStatus): boolean {
  return status === "SKIPPED" || status === "PENDING" || status === "PENDING_HUMAN" || status === "RUNNING";
}

export function computeScore(
  config: DevSignalConfigSnapshot,
  stageInputs: ScoringStageInput[],
): DevSignalScoreBreakdown {
  const byStage = new Map(stageInputs.map((s) => [s.stageId, s]));
  const rows: ScoreStageBreakdown[] = [];
  const blockingFailures: DevSignalStageId[] = [];
  let humanReviewRequired = false;

  // First pass: figure out each stage's raw score + whether it's included, and
  // total the effective weight so we can normalise.
  let effectiveWeightTotal = 0;
  const prelim = DEV_SIGNAL_STAGE_IDS.map((stageId) => {
    const cfg = config.stages[stageId];
    const input = byStage.get(stageId);
    const weight = cfg?.weight ?? 0;

    if (!cfg?.enabled) {
      return { stageId, included: false, reason: "stage disabled in config", status: "SKIPPED" as DevSignalStageStatus, rawStageScore: 0, weight, effectiveWeight: 0 };
    }
    if (weight <= 0) {
      return { stageId, included: false, reason: "weight 0 (aggregation only)", status: input?.status ?? "PENDING", rawStageScore: 0, weight, effectiveWeight: 0 };
    }
    if (!input) {
      // No result yet → treat as missing.
      humanReviewRequired = true;
      const effectiveWeight = config.missingStageRule === "zero" ? weight : 0;
      return { stageId, included: config.missingStageRule === "zero", reason: "no result yet", status: "PENDING" as DevSignalStageStatus, rawStageScore: 0, weight, effectiveWeight };
    }

    // Unresolved stages (pending/running/pending-human) and block-severity
    // flags force human review. A deliberate SKIPPED does not.
    if (input.status === "PENDING" || input.status === "RUNNING" || input.status === "PENDING_HUMAN") {
      humanReviewRequired = true;
    }
    if (input.flags?.some((f) => f.severity === "block")) humanReviewRequired = true;

    const score = rawStageScore(input);
    const belowThreshold = typeof cfg.minScore === "number" && score < cfg.minScore;
    const failed = input.status === "FAIL" || input.status === "ERROR" || belowThreshold;

    if (cfg.blocking && failed) {
      blockingFailures.push(stageId);
      humanReviewRequired = true;
    }

    if (isMissing(input.status)) {
      const effectiveWeight = config.missingStageRule === "zero" ? weight : 0;
      return { stageId, included: config.missingStageRule === "zero", reason: `status ${input.status} — ${config.missingStageRule}`, status: input.status, rawStageScore: score, weight, effectiveWeight };
    }

    return { stageId, included: true, reason: "scored", status: input.status, rawStageScore: score, weight, effectiveWeight: weight };
  });

  effectiveWeightTotal = prelim.reduce((s, p) => s + p.effectiveWeight, 0);

  // Second pass: compute contributions against the effective-weight denominator.
  let weightedScore = 0;
  for (const p of prelim) {
    const contribution =
      effectiveWeightTotal > 0 && p.effectiveWeight > 0
        ? (p.rawStageScore * p.effectiveWeight) / effectiveWeightTotal
        : 0;
    weightedScore += contribution;
    rows.push({
      stageId: p.stageId,
      status: p.status,
      included: p.included,
      reason: p.reason,
      rawStageScore: Math.round(p.rawStageScore),
      weight: p.weight,
      effectiveWeight: p.effectiveWeight,
      contribution: Math.round(contribution * 100) / 100,
    });
  }

  weightedScore = clamp(weightedScore);

  // Apply the blocking cap (lowest-capping stage wins).
  let cap: number | null = null;
  let cappedByStageId: DevSignalStageId | null = null;
  if (blockingFailures.length > 0) {
    cap = BLOCKING_FAIL_CAP;
    cappedByStageId = blockingFailures[0];
  }

  const finalScore = cap !== null ? Math.min(Math.round(weightedScore), cap) : Math.round(weightedScore);

  return {
    formulaVersion: FORMULA_VERSION,
    configVersion: config.version,
    pipelineVersion: config.pipelineVersion,
    finalScore,
    weightedScore: Math.round(weightedScore),
    cappedByStageId,
    cap,
    stages: rows,
    blockingFailures,
    humanReviewRequired,
  };
}
