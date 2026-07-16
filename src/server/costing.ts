// Gitwork Costing & Quote engine — deterministic, no AI. Aligned to the four site packages.
//
// The Rate Card `sourceRate` is treated as the internal COST rate. We blend a build day rate from it
// (reusing blendedDayRateGbp), estimate the build effort for the chosen package, add a UK
// senior-review overhead + contingency to get internal cost, then compare against the client price:
//   - fixed packages (Launch Pad, MVP Sprint): client price is the target price you'd quote.
//   - Greenfield: devs × months × the per-dev-month rate (£5,000 default).
//   - Care Plan: months × the monthly rate (£1,500 default).
// Margin/markup fall out of (client price vs internal cost). Internal figures are Super-Admin only.

import { prisma } from "@/lib/prisma";
import { getUsdToGbpRate } from "@/server/fx";
import { blendedDayRateGbp } from "@/server/pulse-pricing";
import { WORKING_DAYS_PER_MONTH } from "@/server/rate-card";
import {
  COSTING_PACKAGES,
  type CostingAdvancedConfig,
  type CostingConfigResponse,
  type PackageCostingInput,
  type PackageCostingResult,
  type PackageType,
} from "@/types/costing";

const DAYS_PER_WEEK = 5;

export const DEFAULT_ADVANCED_CONFIG: CostingAdvancedConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
};

// Per-package effort defaults (for the internal cost basis) when the user leaves inputs blank.
const PACKAGE_DEFAULTS: Record<PackageType, { weeks: number; devs: number; months: number; effortDaysPerMonth: number }> = {
  launch_pad: { weeks: 3, devs: 1, months: 1, effortDaysPerMonth: 5 },
  mvp_sprint: { weeks: 5, devs: 3, months: 1, effortDaysPerMonth: 5 },
  greenfield: { weeks: 4, devs: 1, months: 3, effortDaysPerMonth: 20 },
  care_plan: { weeks: 1, devs: 1, months: 3, effortDaysPerMonth: 2 },
};

const clamp = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

export function resolveAdvancedConfig(raw: unknown): CostingAdvancedConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CostingAdvancedConfig>;
  return {
    fxFromUsd: clamp(c.fxFromUsd, DEFAULT_ADVANCED_CONFIG.fxFromUsd, 0.0001, 100),
    buildSeniority: c.buildSeniority === "mid" ? "mid" : "senior",
    ukReviewOverheadPercent: clamp(c.ukReviewOverheadPercent, DEFAULT_ADVANCED_CONFIG.ukReviewOverheadPercent, 0, 100),
    contingencyPercent: clamp(c.contingencyPercent, DEFAULT_ADVANCED_CONFIG.contingencyPercent, 0, 100),
    dayRateOverrideGbp: positive(c.dayRateOverrideGbp),
  };
}

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

/** Pure: cost a package given the internal build day rate + resolved advanced config. */
export function computePackageCosting(
  input: PackageCostingInput,
  buildDayRateGbp: number,
  cfg: CostingAdvancedConfig,
): PackageCostingResult {
  const meta = COSTING_PACKAGES.find((p) => p.id === input.packageType) ?? COSTING_PACKAGES[0];
  const d = PACKAGE_DEFAULTS[meta.id];

  const weeks = clamp(input.weeks, d.weeks, 0, 520);
  const devs = clamp(input.devs, d.devs, 1, 20);
  const months = clamp(input.months, d.months, 1, 60);
  const effortDaysPerMonth = clamp(input.effortDaysPerMonth, d.effortDaysPerMonth, 0, 31);

  // Build effort in dev-days, by package shape.
  let buildDevDays: number;
  let clientPrice: number;
  let priceBasisLabel: string;
  switch (meta.id) {
    case "greenfield": {
      const rate = positive(input.pricePerDevMonthGbp) ?? meta.fromGbp;
      buildDevDays = devs * months * WORKING_DAYS_PER_MONTH;
      clientPrice = devs * months * rate;
      priceBasisLabel = `${gbp(rate)}/dev/mo × ${devs} × ${months} mo`;
      break;
    }
    case "care_plan": {
      const rate = positive(input.pricePerMonthGbp) ?? meta.fromGbp;
      buildDevDays = months * effortDaysPerMonth;
      clientPrice = months * rate;
      priceBasisLabel = `${gbp(rate)}/mo × ${months} mo`;
      break;
    }
    default: {
      // fixed packages: launch_pad, mvp_sprint
      buildDevDays = weeks * DAYS_PER_WEEK * devs;
      clientPrice = positive(input.targetPriceGbp) ?? meta.fromGbp;
      priceBasisLabel = `fixed price (from ${gbp(meta.fromGbp)})`;
      break;
    }
  }

  const buildCost = buildDevDays * buildDayRateGbp;
  const ukReviewCost = buildCost * (cfg.ukReviewOverheadPercent / 100);
  const subtotal = buildCost + ukReviewCost;
  const contingency = subtotal * (cfg.contingencyPercent / 100);
  const internalCost = subtotal + contingency;

  const marginPercent = clientPrice > 0 ? Math.round((1 - internalCost / clientPrice) * 100) : 0;
  const markupPercent = internalCost > 0 ? Math.round((clientPrice / internalCost - 1) * 100) : 0;

  return {
    packageType: meta.id,
    clientPriceGbp: Math.round(clientPrice),
    priceBasisLabel,
    internalCostGbp: Math.round(internalCost),
    marginPercent,
    markupPercent,
    buildDayRateGbp,
    usedRateCard: false, // set by the workspace wrapper
    breakdown: {
      buildCostGbp: Math.round(buildCost),
      ukReviewCostGbp: Math.round(ukReviewCost),
      contingencyGbp: Math.round(contingency),
    },
  };
}

/** Resolve config, blend the build day rate from the rate card, and cost the package in one call. */
export async function computeGitworkCosting(workspaceId: string, input: PackageCostingInput): Promise<PackageCostingResult> {
  const cfg = resolveAdvancedConfig(input.config);
  const buildDayRateGbp = await blendedDayRateGbp(workspaceId, {
    fxFromUsd: cfg.fxFromUsd,
    dayRateOverrideGbp: cfg.dayRateOverrideGbp,
    seniority: cfg.buildSeniority,
  });
  const rateCardCount = await prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } });
  const result = computePackageCosting(input, buildDayRateGbp, cfg);
  result.usedRateCard = rateCardCount > 0 && !cfg.dayRateOverrideGbp;
  return result;
}

/** Prefill data for the tool: live FX, whether a rate card exists, and a sample blended rate. */
export async function getCostingConfigInfo(workspaceId: string): Promise<CostingConfigResponse> {
  const [fx, rateCardCount, blended] = await Promise.all([
    getUsdToGbpRate(),
    prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } }),
    blendedDayRateGbp(workspaceId, { fxFromUsd: DEFAULT_ADVANCED_CONFIG.fxFromUsd, seniority: "senior" }),
  ]);
  return {
    liveFxFromUsd: fx?.rate ?? null,
    fxAsOf: fx?.asOf ?? null,
    hasRateCard: rateCardCount > 0,
    blendedBuildDayRateGbp: blended,
    defaults: { ...DEFAULT_ADVANCED_CONFIG, fxFromUsd: fx?.rate ?? DEFAULT_ADVANCED_CONFIG.fxFromUsd },
  };
}
