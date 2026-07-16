// Gitwork Costing & Quote engine — deterministic, no AI. Aligned to the four site packages.
//
// The build cost is the sum, over the chosen team, of each tier's people × that tier's rate — so a
// mixed team (not all senior) is costed accurately. Tier rates (Senior / Mid / Junior, each per day
// or per month) are seeded from the Rate Card and saved on Workspace.costingConfig. We estimate the
// build effort for the package, add a UK senior-review overhead + contingency to get internal cost,
// then compare against the client price:
//   - fixed packages (Launch Pad, MVP Sprint): client price is the target price you'd quote.
//   - Greenfield: total devs × months × the per-dev-month rate (£5,000 default).
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
  type TierCounts,
  type TierRate,
  type TierRates,
} from "@/types/costing";

const DAYS_PER_WEEK = 5;

export const DEFAULT_ADVANCED_CONFIG: CostingAdvancedConfig = {
  fxFromUsd: 0.79,
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

// Per-package default team + effort when inputs are blank.
const PACKAGE_DEFAULTS: Record<PackageType, { weeks: number; months: number; team: TierCounts }> = {
  launch_pad: { weeks: 3, months: 1, team: { junior: 0, mid: 1, senior: 0 } },
  mvp_sprint: { weeks: 5, months: 1, team: { junior: 0, mid: 2, senior: 1 } },
  greenfield: { weeks: 4, months: 3, team: { junior: 0, mid: 1, senior: 0 } },
  care_plan: { weeks: 1, months: 3, team: { junior: 0, mid: 2, senior: 0 } }, // team = eng-days/month
};

const clamp = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

const roundToFive = (n: number) => Math.round(n / 5) * 5;

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

export function resolveAdvancedConfig(raw: unknown): CostingAdvancedConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CostingAdvancedConfig>;
  return {
    fxFromUsd: clamp(c.fxFromUsd, DEFAULT_ADVANCED_CONFIG.fxFromUsd, 0.0001, 100),
    ukReviewOverheadPercent: clamp(c.ukReviewOverheadPercent, DEFAULT_ADVANCED_CONFIG.ukReviewOverheadPercent, 0, 100),
    contingencyPercent: clamp(c.contingencyPercent, DEFAULT_ADVANCED_CONFIG.contingencyPercent, 0, 100),
  };
}

function resolveTierRate(raw: unknown, fallback: TierRate): TierRate {
  if (typeof raw === "number") return { amount: clamp(raw, fallback.amount, 0, 10000000), period: "day" };
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TierRate>;
  return { amount: clamp(r.amount, fallback.amount, 0, 10000000), period: r.period === "month" ? "month" : "day" };
}

export function resolveTierRates(raw: unknown): TierRates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TierRates>;
  return {
    junior: resolveTierRate(r.junior, DEFAULT_TIER_RATES.junior),
    mid: resolveTierRate(r.mid, DEFAULT_TIER_RATES.mid),
    senior: resolveTierRate(r.senior, DEFAULT_TIER_RATES.senior),
  };
}

function resolveTeam(raw: unknown, fallback: TierCounts): TierCounts {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<TierCounts>;
  return {
    junior: clamp(t.junior, fallback.junior, 0, 999),
    mid: clamp(t.mid, fallback.mid, 0, 999),
    senior: clamp(t.senior, fallback.senior, 0, 999),
  };
}

const TIERS: DevTier[] = ["junior", "mid", "senior"];
const sumTeam = (t: TierCounts) => t.junior + t.mid + t.senior;
/** £ per unit-of-time for the whole team (£/day if counts are devs; £/month-effort if counts are days). */
const teamDayCost = (t: TierCounts, rates: TierRates) => TIERS.reduce((s, tier) => s + t[tier] * tierRateToDay(rates[tier]), 0);

// ── Tier rates seeding ──────────────────────────────────────────────────────

function tierFromArea(area: string): DevTier {
  if (/junior|grad|trainee/i.test(area)) return "junior";
  if (/senior|lead|principal|staff/i.test(area)) return "senior";
  return "mid";
}

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

/** Pure: cost a package given the tier rates + resolved advanced config. */
export function computePackageCosting(input: PackageCostingInput, tierRates: TierRates, cfg: CostingAdvancedConfig): PackageCostingResult {
  const meta = COSTING_PACKAGES.find((p) => p.id === input.packageType) ?? COSTING_PACKAGES[0];
  const d = PACKAGE_DEFAULTS[meta.id];

  const weeks = clamp(input.weeks, d.weeks, 0, 520);
  const months = clamp(input.months, d.months, 1, 60);
  const team = resolveTeam(input.team, d.team);
  const perUnit = teamDayCost(team, tierRates); // £/day (devs) or £/month-of-effort (Care days)
  const headcount = sumTeam(team);

  let buildDevDays: number;
  let buildCost: number;
  let clientPrice: number;
  let priceBasisLabel: string;
  switch (meta.id) {
    case "greenfield": {
      const rate = positive(input.pricePerDevMonthGbp) ?? meta.fromGbp;
      buildDevDays = headcount * months * WORKING_DAYS_PER_MONTH;
      buildCost = perUnit * months * WORKING_DAYS_PER_MONTH;
      clientPrice = headcount * months * rate;
      priceBasisLabel = `${gbp(rate)}/dev/mo × ${headcount} × ${months} mo`;
      break;
    }
    case "care_plan": {
      const rate = positive(input.pricePerMonthGbp) ?? meta.fromGbp;
      buildDevDays = headcount * months; // headcount here = eng-days/month
      buildCost = perUnit * months; // perUnit = £/month of effort
      clientPrice = months * rate;
      priceBasisLabel = `${gbp(rate)}/mo × ${months} mo`;
      break;
    }
    default: {
      buildDevDays = headcount * weeks * DAYS_PER_WEEK;
      buildCost = perUnit * weeks * DAYS_PER_WEEK;
      clientPrice = positive(input.targetPriceGbp) ?? meta.fromGbp;
      priceBasisLabel = `fixed price (from ${gbp(meta.fromGbp)})`;
      break;
    }
  }

  const ukReviewCost = buildCost * (cfg.ukReviewOverheadPercent / 100);
  const subtotal = buildCost + ukReviewCost;
  const contingency = subtotal * (cfg.contingencyPercent / 100);
  const internalCost = subtotal + contingency;

  const marginPercent = clientPrice > 0 ? Math.round((1 - internalCost / clientPrice) * 100) : 0;
  const markupPercent = internalCost > 0 ? Math.round((clientPrice / internalCost - 1) * 100) : 0;
  const buildDayRateGbp = buildDevDays > 0 ? Math.round(buildCost / buildDevDays) : 0;

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

/** Resolve config + tier rates, and cost the package in one call. */
export async function computeGitworkCosting(workspaceId: string, input: PackageCostingInput): Promise<PackageCostingResult> {
  const cfg = resolveAdvancedConfig(input.config);
  const tierRates = input.tierRates
    ? resolveTierRates(input.tierRates)
    : ((await getSavedCostingConfig(workspaceId))?.tierRates ?? (await seedTierRatesFromRateCard(workspaceId, cfg.fxFromUsd)));
  const rateCardCount = await prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } });
  const result = computePackageCosting(input, tierRates, cfg);
  result.usedRateCard = rateCardCount > 0;
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
    blendedBuildDayRateGbp: tierRateToDay(seededTierRates.mid),
    defaults: { ...DEFAULT_ADVANCED_CONFIG, fxFromUsd },
    saved,
    seededTierRates,
  };
}
