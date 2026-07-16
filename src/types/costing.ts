// Gitwork Costing & Quote tool — shared DTO types (client-safe; no server imports).
//
// Gitwork sells fixed scope / fixed price / fixed timeline. This tool costs an engagement
// INTERNALLY (blended Islamabad build rate + a UK senior-review overhead + contingency), then
// applies a target margin to derive the client-facing fixed price. Internal cost + margin are
// Super-Admin-only and must never reach a client surface.

/** The pricing levers. Extends the Pulse pricing config with Gitwork's cost/margin model. */
export interface GitworkCostingConfig {
  /** USD→GBP multiplier for converting the (USD) rate card. */
  fxFromUsd: number;
  /** If set, bypasses the rate-card blend and uses this build cost day rate directly. */
  dayRateOverrideGbp?: number;
  /** Which rate-card seniority band to blend for the build cost day rate. */
  buildSeniority: "mid" | "senior";
  /** UK senior review/QA/deploy overhead, as a % of build effort. */
  ukReviewOverheadPercent: number;
  /** Optional explicit UK senior cost day rate for the review overhead (else the build rate). */
  ukReviewDayRateGbp?: number;
  /** Delivery contingency, as a % of (build + review) cost. */
  contingencyPercent: number;
  /** Target gross margin on the client price. price = internalCost / (1 − margin). */
  targetMarginPercent: number;
}

export interface CostingPhaseInput {
  name: string;
  /** Calendar weeks for a ~2-dev team (the estimate's assumed team size). */
  weeks: number;
  outcome?: string;
}

export interface CostingScopeInput {
  phases: CostingPhaseInput[];
  /** Total calendar weeks for a ~2-dev team — low end. */
  weeksLow: number;
  /** Total calendar weeks — high end. */
  weeksHigh: number;
}

/** A costed band for a given team size. Internal figures are Super-Admin-only. */
export interface CostingBand {
  devs: number;
  weeksLow: number;
  weeksHigh: number;
  buildDayRateGbp: number;
  // Internal (never client-facing):
  internalCostLowGbp: number;
  internalCostHighGbp: number;
  marginPercent: number;
  markupPercent: number;
  breakdown: { buildCostGbp: number; ukReviewCostGbp: number; contingencyGbp: number }; // at the mid point
  // Client-facing fixed price:
  clientPriceLowGbp: number;
  clientPriceHighGbp: number;
}

export interface GitworkCostingResult {
  buildDayRateGbp: number;
  usedRateCard: boolean;
  config: GitworkCostingConfig;
  bands: CostingBand[];
}

export interface CostingConfigResponse {
  liveFxFromUsd: number | null;
  fxAsOf: string | null;
  hasRateCard: boolean;
  blendedBuildDayRateGbp: number;
  defaults: GitworkCostingConfig;
}
