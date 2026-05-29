import type { CodeClearTier, IdentityConfidence } from "@prisma/client";

/**
 * CodeClear scoring — single source of truth for how a developer's 0–100
 * "calibre" is computed.
 *
 * Mirrors the philosophy of `calculateHealthScore` in pulse-scan.ts:
 *   - Sub-scores are weighted (not a flat mean)
 *   - Critical signals can cap the final number (here: identity confidence;
 *     in Pulse: SSL / privacy policy / terms)
 *   - Open-ended red flags from the latest GitHub analysis subtract a small
 *     penalty so signals from the scan flow into the headline number
 *
 * Used by: candidate serializers (src/server/codeclear.ts), the drawer UI
 * preview (CalibreBreakdown), and the analysis pipeline when it writes a
 * draft score.
 */

/** Sub-score weights as percentage points. MUST sum to 100. */
export const CALIBRE_WEIGHTS = {
  technicalDepth: 30,
  codeQuality: 30,
  deliveryReadiness: 25,
  aiFluency: 15,
} as const;

/** Identity-confidence caps. PENDING/LOW cap the score to prevent unverified
 *  devs from showing up as Tier 1. Mirrors Pulse's SSL/privacy hard caps. */
export const IDENTITY_CAPS: Record<IdentityConfidence, number> = {
  HIGH: 100,
  MEDIUM: 100,
  LOW: 65,
  PENDING: 50,
};

export const RED_FLAG_PENALTY_PER_FLAG = 3;
export const RED_FLAG_PENALTY_MAX = 15;

export const TIER_THRESHOLDS = {
  TIER_1: 80,
  TIER_2: 60,
} as const;

export interface CalibreInput {
  technicalDepth: number | null | undefined;
  codeQuality: number | null | undefined;
  aiFluency: number | null | undefined;
  deliveryReadiness: number | null | undefined;
  identityConfidence: IdentityConfidence | null | undefined;
  /** Open red flags from the latest GitHub analysis run. */
  redFlagsCount?: number;
}

export interface CalibreBreakdown {
  /** Final 0–100 calibre score after weighting + penalties + caps. */
  score: number;
  /** Pre-cap, pre-penalty weighted average. Useful for transparency. */
  weightedAverage: number;
  /** Penalty subtracted from weightedAverage (always ≥ 0). */
  redFlagPenalty: number;
  /** Cap that was applied (e.g. 50 for PENDING identity). 100 = no cap. */
  identityCap: number;
  /** True when the score was lowered by the identity cap. */
  identityCapApplied: boolean;
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Compute the calibre score from sub-scores + identity + red flag count.
 * Returns the score AND a breakdown so the UI can show "this is why".
 */
export function calculateCalibre(input: CalibreInput): CalibreBreakdown {
  const td = clamp(Number(input.technicalDepth ?? 0));
  const cq = clamp(Number(input.codeQuality ?? 0));
  const dr = clamp(Number(input.deliveryReadiness ?? 0));
  const ai = clamp(Number(input.aiFluency ?? 0));

  // Weighted average. Weights sum to 100 so divide by 100 directly.
  const weightedAverage =
    (td * CALIBRE_WEIGHTS.technicalDepth +
      cq * CALIBRE_WEIGHTS.codeQuality +
      dr * CALIBRE_WEIGHTS.deliveryReadiness +
      ai * CALIBRE_WEIGHTS.aiFluency) /
    100;

  const redFlagPenalty = Math.min(
    RED_FLAG_PENALTY_MAX,
    Math.max(0, input.redFlagsCount ?? 0) * RED_FLAG_PENALTY_PER_FLAG,
  );

  const identityCap = IDENTITY_CAPS[input.identityConfidence ?? "PENDING"];
  const beforeCap = Math.max(0, weightedAverage - redFlagPenalty);
  const score = Math.round(Math.min(beforeCap, identityCap));

  return {
    score,
    weightedAverage: Math.round(weightedAverage),
    redFlagPenalty,
    identityCap,
    identityCapApplied: beforeCap > identityCap,
  };
}

/**
 * Convenience helper for places that just want the final number (the
 * serializer, list endpoints, etc.). Use calculateCalibre when you want the
 * breakdown for the UI.
 */
export function computeOverallCalibre(input: CalibreInput): number {
  return calculateCalibre(input).score;
}

/** Map a 0–100 score to a tier. T1 = 80+, T2 = 60–79, T3 = below 60. */
export function deriveTier(score: number | null | undefined): CodeClearTier {
  if (typeof score !== "number" || !Number.isFinite(score)) return "TIER_3";
  if (score >= TIER_THRESHOLDS.TIER_1) return "TIER_1";
  if (score >= TIER_THRESHOLDS.TIER_2) return "TIER_2";
  return "TIER_3";
}

/**
 * Returns the tier the UI should display. Honours an admin override when set,
 * otherwise falls back to the derived value.
 */
export function effectiveTier(
  derived: CodeClearTier | null | undefined,
  override: CodeClearTier | null | undefined,
): CodeClearTier {
  return override ?? derived ?? "TIER_3";
}
