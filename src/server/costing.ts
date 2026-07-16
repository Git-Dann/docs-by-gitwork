// Gitwork Costing & Quote engine — deterministic, no AI. Aligned to the four site packages.
//
// The build cost day rate comes from three editable tier rates (Senior / Mid / Junior) that are
// seeded from the workspace Rate Card and saved on Workspace.costingConfig. The chosen build
// seniority picks the tier rate; we estimate the build effort for the package, add a UK
// senior-review overhead + contingency to get internal cost, then compare against the client price:
//   - fixed packages (Launch Pad, MVP Sprint): client price is the target price you'd quote.
//   - Greenfield: devs × months × the per-dev-month rate (£5,000 default).
//   - Care Plan: months × the monthly rate (£1,500 default).
// Margin/markup fall out of (client price vs internal cost). Internal figures are Super-Admin only.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUsdToGbpRate } from "@/server/fx";
import { WORKING_DAYS_PER_MONTH, normalizeToMonthly } from "@/server/rate-card";
import {
  COSTING_PACKAGES,
  type CostingAdvancedConfig,
  type CostingConfigResponse,
  type DevTier,
  type PackageCostingInput,
  type PackageCostingResult,
  type PackageType,
  type SavedCostingConfig,
  type TierRate,
  type TierRates,
} from "@/types/costing";

const DAYS_PER_WEEK = 5;

export const DEFAULT_ADVANCED_CONFIG: CostingAdvancedConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
};

export const DEFAULT_TIER_RATES: TierRates = {
  junior: { amount: 45, period: "day" },
  mid: { amount: 50, period: "day" },
  senior: { amount: 65, period: "day" },
};

/** Normalize a tier rate to a £/day figure (month rates ÷ working days per month). */
export function tierRateToDay(r: TierRate): number {
  return r.period === "month" ? r.amount / WORKING_DAYS_PER_MONTH : r.amount;
}

const PACKAGE_DEFAULTS: Record<PackageType, { weeks: number; devs: number; months: number; effortDaysPerMonth: number }> = {
  launch_pad: { weeks: 3, devs: 1, months: 1, effortDaysPerMonth: 5 },
  mvp_sprint: { weeks: 5, devs: 3, months: 1, effortDaysPerMonth: 5 },
  greenfield: { weeks: 4, devs: 1, months: 3, effortDaysPerMonth: 20 },
  care_plan: { weeks: 1, devs: 1, months: 3, effortDaysPerMonth: 2 },
};

const clamp = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

const roundToFive = (n: number) => Math.round(n / 5) * 5;

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

export function resolveAdvancedConfig(raw: unknown): CostingAdvancedConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CostingAdvancedConfig>;
  const tier: DevTier = c.buildSeniority === "junior" ? "junior" : c.buildSeniority === "mid" ? "mid" : "senior";
  return {
    fxFromUsd: clamp(c.fxFromUsd, DEFAULT_ADVANCED_CONFIG.fxFromUsd, 0.0001, 100),
    buildSeniority: tier,
    ukReviewOverheadPercent: clamp(c.ukReviewOverheadPercent, DEFAULT_ADVANCED_CONFIG.ukReviewOverheadPercent, 0, 100),
    contingencyPercent: clamp(c.contingencyPercent, DEFAULT_ADVANCED_CONFIG.contingencyPercent, 0, 100),
    dayRateOverrideGbp: positive(c.dayRateOverrideGbp),
  };
}

function resolveTierRate(raw: unknown, fallback: TierRate): TierRate {
  // Backward-compat: an older shape stored a bare number (£/day).
  if (typeof raw === "number") return { amount: clamp(raw, fallback.amount, 0, 10000000), period: "day" };
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TierRate>;
  return {
    amount: clamp(r.amount, fallback.amount, 0, 10000000),
    period: r.period === "month" ? "month" : "day",
  };
}

export function resolveTierRates(raw: unknown): TierRates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TierRates>;
  return {
    junior: resolveTierRate(r.junior, DEFAULT_TIER_RATES.junior),
    mid: resolveTierRate(r.mid, DEFAULT_TIER_RATES.mid),
    senior: resolveTierRate(r.senior, DEFAULT_TIER_RATES.senior),
  };
}

// ── Tier rates ──────────────────────────────────────────────────────────────

function tierFromArea(area: string): DevTier {
  if (/junior|grad|trainee/i.test(area)) return "junior";
  if (/senior|lead|principal|staff/i.test(area)) return "senior";
  return "mid";
}

/** Seed the three tier rates by averaging each tier's cost day rate from the Rate Card. */
export async function seedTierRatesFromRateCard(workspaceId: string, fxFromUsd: number): Promise<TierRates> {
  const people = await prisma.rateCardPerson.findMany({
    where: { workspaceId, archivedAt: null },
    select: { area: true, sourceRate: true, sourceCurrencyCode: true, billingPeriod: true },
  });
  const buckets: Record<DevTier, number[]> = { junior: [], mid: [], senior: [] };
  for (const p of people) {
    const monthly = normalizeToMonthly(p.sourceRate, p.billingPeriod);
    const code = (p.sourceCurrencyCode || "USD").toUpperCase();
    const monthlyGbp = code === "GBP" ? monthly : monthly * fxFromUsd;
    buckets[tierFromArea(p.area)].push(monthlyGbp / WORKING_DAYS_PER_MONTH);
  }
  const day = (arr: number[], fallback: TierRate): TierRate =>
    arr.length ? { amount: roundToFive(arr.reduce((s, n) => s + n, 0) / arr.length), period: "day" } : { ...fallback };
  return {
    junior: day(buckets.junior, DEFAULT_TIER_RATES.junior),
    mid: day(buckets.mid, DEFAULT_TIER_RATES.mid),
    senior: day(buckets.senior, DEFAULT_TIER_RATES.senior),
  };
}

// ── Saved config (Workspace.costingConfig) ─────────────────────────────────────

export async function getSavedCostingConfig(workspaceId: string): Promise<SavedCostingConfig | null> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { costingConfig: true } });
  const raw = ws?.costingConfig;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { tierRates?: unknown };
  return { ...resolveAdvancedConfig(obj), tierRates: resolveTierRates(obj.tierRates) };
}

export async function saveCostingConfig(
  workspaceId: string,
  config: Partial<CostingAdvancedConfig> & { tierRates?: unknown },
): Promise<SavedCostingConfig> {
  const clean: SavedCostingConfig = { ...resolveAdvancedConfig(config), tierRates: resolveTierRates(config.tierRates) };
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { costingConfig: clean as unknown as Prisma.InputJsonValue },
  });
  return clean;
}

// ── Costing ────────────────────────────────────────────────────────────────────

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

/**
 * Resolve the build day rate for a workspace, in priority order:
 * 1. explicit day-rate override, 2. the chosen tier's rate (passed edits, else saved, else seeded).
 */
async function resolveBuildDayRate(
  workspaceId: string,
  cfg: CostingAdvancedConfig,
  passedTierRates: TierRates | undefined,
): Promise<{ rate: number; source: "override" | "tiers" }> {
  if (cfg.dayRateOverrideGbp) return { rate: cfg.dayRateOverrideGbp, source: "override" };
  const tiers =
    passedTierRates ?? (await getSavedCostingConfig(workspaceId))?.tierRates ?? (await seedTierRatesFromRateCard(workspaceId, cfg.fxFromUsd));
  return { rate: tierRateToDay(tiers[cfg.buildSeniority]), source: "tiers" };
}

/** Resolve config + build day rate, and cost the package in one call. */
export async function computeGitworkCosting(workspaceId: string, input: PackageCostingInput): Promise<PackageCostingResult> {
  const cfg = resolveAdvancedConfig(input.config);
  const tiers = input.tierRates ? resolveTierRates(input.tierRates) : undefined;
  const { rate, source } = await resolveBuildDayRate(workspaceId, cfg, tiers);
  const result = computePackageCosting(input, rate, cfg);
  result.usedRateCard = source !== "override";
  return result;
}

/** Prefill data for the tool: live FX, saved config, and the Rate-Card-seeded tier rates. */
export async function getCostingConfigInfo(workspaceId: string): Promise<CostingConfigResponse> {
  const fx = await getUsdToGbpRate();
  const fxFromUsd = fx?.rate ?? DEFAULT_ADVANCED_CONFIG.fxFromUsd;
  const [rateCardCount, saved, seededTierRates] = await Promise.all([
    prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } }),
    getSavedCostingConfig(workspaceId),
    seedTierRatesFromRateCard(workspaceId, fxFromUsd),
  ]);
  return {
    liveFxFromUsd: fx?.rate ?? null,
    fxAsOf: fx?.asOf ?? null,
    hasRateCard: rateCardCount > 0,
    blendedBuildDayRateGbp: tierRateToDay(seededTierRates.senior),
    defaults: { ...DEFAULT_ADVANCED_CONFIG, fxFromUsd },
    saved,
    seededTierRates,
  };
}
