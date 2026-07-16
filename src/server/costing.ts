// Gitwork Costing & Quote engine — deterministic, no AI.
//
// Builds on the Pulse pricing engine (blendedDayRateGbp + computePricingBands) but adds Gitwork's
// cost→margin→price model. The Rate Card's `sourceRate` is treated as the internal COST rate, so
// computePricingBands' price (dev-effort × build day rate) IS the build cost. On top of that we add
// a UK senior-review overhead, a contingency, then a target margin to derive the client fixed price.
//
// Everything here is workspace-scoped. The pure functions (resolveCostingConfig, computeCostingBands)
// are unit-testable with no I/O.

import { prisma } from "@/lib/prisma";
import { getUsdToGbpRate } from "@/server/fx";
import { blendedDayRateGbp, computePricingBands } from "@/server/pulse-pricing";
import type { EngagementEstimate } from "@/types/pulse";
import type {
  CostingBand,
  CostingConfigResponse,
  CostingScopeInput,
  GitworkCostingConfig,
  GitworkCostingResult,
} from "@/types/costing";

export const DEFAULT_COSTING_CONFIG: GitworkCostingConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
  targetMarginPercent: 50,
};

const clamp = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export function resolveCostingConfig(raw: unknown): GitworkCostingConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<GitworkCostingConfig>;
  return {
    fxFromUsd: clamp(c.fxFromUsd, DEFAULT_COSTING_CONFIG.fxFromUsd, 0.0001, 100),
    dayRateOverrideGbp:
      typeof c.dayRateOverrideGbp === "number" && c.dayRateOverrideGbp > 0 ? c.dayRateOverrideGbp : undefined,
    buildSeniority: c.buildSeniority === "mid" ? "mid" : "senior",
    ukReviewOverheadPercent: clamp(c.ukReviewOverheadPercent, DEFAULT_COSTING_CONFIG.ukReviewOverheadPercent, 0, 100),
    ukReviewDayRateGbp:
      typeof c.ukReviewDayRateGbp === "number" && c.ukReviewDayRateGbp > 0 ? c.ukReviewDayRateGbp : undefined,
    contingencyPercent: clamp(c.contingencyPercent, DEFAULT_COSTING_CONFIG.contingencyPercent, 0, 100),
    targetMarginPercent: clamp(c.targetMarginPercent, DEFAULT_COSTING_CONFIG.targetMarginPercent, 0, 95),
  };
}

function estimateFromScope(scope: CostingScopeInput): EngagementEstimate {
  const low = Math.max(1, scope.weeksLow || 0);
  const high = Math.max(low, scope.weeksHigh || low);
  return {
    summary: "",
    weeksLow: low,
    weeksHigh: high,
    priceLow: 0,
    priceHigh: 0,
    confidence: "MEDIUM",
    phases: scope.phases.map((p) => ({ name: p.name, weeks: p.weeks, outcome: p.outcome ?? "" })),
  };
}

/**
 * Pure: turn build-cost bands (dev effort × build day rate) into internal cost + client price.
 * `buildDayRateGbp` is the internal COST day rate (from the rate card or an override).
 */
export function computeCostingBands(
  scope: CostingScopeInput,
  buildDayRateGbp: number,
  config: GitworkCostingConfig,
): CostingBand[] {
  const estimate = estimateFromScope(scope);
  const buildBands = computePricingBands(estimate, buildDayRateGbp);
  const margin = config.targetMarginPercent / 100;

  const cost = (buildCost: number) => {
    const totalDevDays = buildDayRateGbp > 0 ? buildCost / buildDayRateGbp : 0;
    const reviewDays = totalDevDays * (config.ukReviewOverheadPercent / 100);
    const ukReviewCost = reviewDays * (config.ukReviewDayRateGbp ?? buildDayRateGbp);
    const subtotal = buildCost + ukReviewCost;
    const contingency = subtotal * (config.contingencyPercent / 100);
    const internalCost = subtotal + contingency;
    const clientPrice = margin < 1 ? internalCost / (1 - margin) : internalCost;
    return { ukReviewCost, contingency, internalCost, clientPrice };
  };

  return buildBands.map((b) => {
    const lo = cost(b.priceLowGbp);
    const hi = cost(b.priceHighGbp);
    const midBuild = (b.priceLowGbp + b.priceHighGbp) / 2;
    const mid = cost(midBuild);
    const midPrice = roundTo(mid.clientPrice, 250);
    const markup = mid.internalCost > 0 ? (midPrice / mid.internalCost - 1) * 100 : 0;
    const effectiveMargin = midPrice > 0 ? (1 - mid.internalCost / midPrice) * 100 : 0;
    return {
      devs: b.devs,
      weeksLow: b.weeksLow,
      weeksHigh: b.weeksHigh,
      buildDayRateGbp,
      internalCostLowGbp: Math.round(lo.internalCost),
      internalCostHighGbp: Math.round(hi.internalCost),
      marginPercent: Math.round(effectiveMargin),
      markupPercent: Math.round(markup),
      breakdown: {
        buildCostGbp: Math.round(midBuild),
        ukReviewCostGbp: Math.round(mid.ukReviewCost),
        contingencyGbp: Math.round(mid.contingency),
      },
      clientPriceLowGbp: roundTo(lo.clientPrice, 250),
      clientPriceHighGbp: roundTo(hi.clientPrice, 250),
    };
  });
}

/** Resolve config, blend the build day rate from the rate card, and cost the scope in one call. */
export async function computeGitworkCosting(
  workspaceId: string,
  configRaw: unknown,
  scope: CostingScopeInput,
): Promise<GitworkCostingResult> {
  const config = resolveCostingConfig(configRaw);
  const buildDayRateGbp = await blendedDayRateGbp(workspaceId, {
    fxFromUsd: config.fxFromUsd,
    dayRateOverrideGbp: config.dayRateOverrideGbp,
    seniority: config.buildSeniority,
  });
  const rateCardCount = await prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } });
  return {
    buildDayRateGbp,
    usedRateCard: rateCardCount > 0 && !config.dayRateOverrideGbp,
    config,
    bands: computeCostingBands(scope, buildDayRateGbp, config),
  };
}

/** Prefill data for the tool: live FX, whether a rate card exists, and a sample blended rate. */
export async function getCostingConfigInfo(workspaceId: string): Promise<CostingConfigResponse> {
  const [fx, rateCardCount, blended] = await Promise.all([
    getUsdToGbpRate(),
    prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } }),
    blendedDayRateGbp(workspaceId, { fxFromUsd: DEFAULT_COSTING_CONFIG.fxFromUsd, seniority: "senior" }),
  ]);
  return {
    liveFxFromUsd: fx?.rate ?? null,
    fxAsOf: fx?.asOf ?? null,
    hasRateCard: rateCardCount > 0,
    blendedBuildDayRateGbp: blended,
    defaults: { ...DEFAULT_COSTING_CONFIG, fxFromUsd: fx?.rate ?? DEFAULT_COSTING_CONFIG.fxFromUsd },
  };
}
