// Gitwork Costing & Quote engine — deterministic, no AI. Aligned to the four site packages.
//
// The build cost day rate comes from an editable per-dev rate table (CostingRate[]) that's seeded
// from the workspace Rate Card and saved on Workspace.costingConfig. We blend the rates in the
// chosen seniority band, estimate the build effort for the package, add a UK senior-review overhead
// + contingency to get internal cost, then compare against the client price:
//   - fixed packages (Launch Pad, MVP Sprint): client price is the target price you'd quote.
//   - Greenfield: devs × months × the per-dev-month rate (£5,000 default).
//   - Care Plan: months × the monthly rate (£1,500 default).
// Margin/markup fall out of (client price vs internal cost). Internal figures are Super-Admin only.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUsdToGbpRate } from "@/server/fx";
import { blendedDayRateGbp } from "@/server/pulse-pricing";
import { WORKING_DAYS_PER_MONTH, normalizeToMonthly } from "@/server/rate-card";
import {
  COSTING_PACKAGES,
  type CostingAdvancedConfig,
  type CostingConfigResponse,
  type CostingRate,
  type DevTier,
  type PackageCostingInput,
  type PackageCostingResult,
  type PackageType,
  type SavedCostingConfig,
} from "@/types/costing";

const DAYS_PER_WEEK = 5;
const DEFAULT_DAY_RATE_GBP = 450;

export const DEFAULT_ADVANCED_CONFIG: CostingAdvancedConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
};

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
  return {
    fxFromUsd: clamp(c.fxFromUsd, DEFAULT_ADVANCED_CONFIG.fxFromUsd, 0.0001, 100),
    buildSeniority: c.buildSeniority === "mid" ? "mid" : "senior",
    ukReviewOverheadPercent: clamp(c.ukReviewOverheadPercent, DEFAULT_ADVANCED_CONFIG.ukReviewOverheadPercent, 0, 100),
    contingencyPercent: clamp(c.contingencyPercent, DEFAULT_ADVANCED_CONFIG.contingencyPercent, 0, 100),
    dayRateOverrideGbp: positive(c.dayRateOverrideGbp),
  };
}

// ── Dev rate table ────────────────────────────────────────────────────────────

function tierFromArea(area: string): DevTier {
  if (/junior|grad|trainee/i.test(area)) return "junior";
  if (/senior|lead|principal|staff/i.test(area)) return "senior";
  return "mid";
}

/** Build the editable dev-rate table from the workspace Rate Card (costs → GBP day rates). */
export async function seedRatesFromRateCard(workspaceId: string, fxFromUsd: number): Promise<CostingRate[]> {
  const people = await prisma.rateCardPerson.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, name: true, area: true, sourceRate: true, sourceCurrencyCode: true, billingPeriod: true },
    orderBy: { name: "asc" },
  });
  return people.map((p) => {
    const monthly = normalizeToMonthly(p.sourceRate, p.billingPeriod);
    const code = (p.sourceCurrencyCode || "USD").toUpperCase();
    const monthlyGbp = code === "GBP" ? monthly : monthly * fxFromUsd;
    return {
      id: p.id,
      label: p.name,
      tier: tierFromArea(p.area),
      dayRateGbp: roundToFive(monthlyGbp / WORKING_DAYS_PER_MONTH),
    };
  });
}

/** Blend the rate table into a single build day rate for the chosen seniority band. */
function blendRates(rates: CostingRate[], seniority: "mid" | "senior"): number {
  const usable = rates.filter((r) => typeof r.dayRateGbp === "number" && r.dayRateGbp > 0);
  if (usable.length === 0) return DEFAULT_DAY_RATE_GBP;
  const band = usable.filter((r) => (seniority === "senior" ? r.tier === "senior" : r.tier !== "senior"));
  const pool = band.length > 0 ? band : usable;
  const avg = pool.reduce((s, r) => s + r.dayRateGbp, 0) / pool.length;
  return roundToFive(avg);
}

// ── Saved config (Workspace.costingConfig) ─────────────────────────────────────

function isRate(v: unknown): v is CostingRate {
  const r = v as CostingRate;
  return (
    !!r &&
    typeof r.id === "string" &&
    typeof r.label === "string" &&
    (r.tier === "junior" || r.tier === "mid" || r.tier === "senior") &&
    typeof r.dayRateGbp === "number"
  );
}

export async function getSavedCostingConfig(workspaceId: string): Promise<SavedCostingConfig | null> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { costingConfig: true } });
  const raw = ws?.costingConfig;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<SavedCostingConfig>;
  const rates = Array.isArray(obj.rates) ? obj.rates.filter(isRate) : [];
  return { ...resolveAdvancedConfig(obj), rates };
}

export async function saveCostingConfig(
  workspaceId: string,
  config: Partial<CostingAdvancedConfig> & { rates?: CostingRate[] },
): Promise<SavedCostingConfig> {
  const clean: SavedCostingConfig = {
    ...resolveAdvancedConfig(config),
    rates: (config.rates ?? []).filter(isRate).slice(0, 200).map((r) => ({
      id: r.id,
      label: r.label.slice(0, 120),
      tier: r.tier,
      dayRateGbp: clamp(r.dayRateGbp, 0, 0, 100000),
    })),
  };
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
 * 1. explicit day-rate override, 2. the dev rate table (passed edits, else saved config),
 * 3. the live Rate Card blend (pre-save fallback).
 */
async function resolveBuildDayRate(
  workspaceId: string,
  cfg: CostingAdvancedConfig,
  passedRates: CostingRate[] | undefined,
): Promise<{ rate: number; source: "override" | "rates" | "live" }> {
  if (cfg.dayRateOverrideGbp) return { rate: cfg.dayRateOverrideGbp, source: "override" };
  const rates = passedRates && passedRates.length > 0 ? passedRates : (await getSavedCostingConfig(workspaceId))?.rates;
  if (rates && rates.length > 0) return { rate: blendRates(rates, cfg.buildSeniority), source: "rates" };
  const live = await blendedDayRateGbp(workspaceId, { fxFromUsd: cfg.fxFromUsd, seniority: cfg.buildSeniority });
  return { rate: live, source: "live" };
}

/** Resolve config + build day rate, and cost the package in one call. */
export async function computeGitworkCosting(workspaceId: string, input: PackageCostingInput): Promise<PackageCostingResult> {
  const cfg = resolveAdvancedConfig(input.config);
  const { rate, source } = await resolveBuildDayRate(workspaceId, cfg, input.rates);
  const result = computePackageCosting(input, rate, cfg);
  result.usedRateCard = source !== "override";
  return result;
}

/** Prefill data for the tool: live FX, saved config, and the Rate-Card-seeded dev rates. */
export async function getCostingConfigInfo(workspaceId: string): Promise<CostingConfigResponse> {
  const fx = await getUsdToGbpRate();
  const fxFromUsd = fx?.rate ?? DEFAULT_ADVANCED_CONFIG.fxFromUsd;
  const [rateCardCount, blended, saved, seededRates] = await Promise.all([
    prisma.rateCardPerson.count({ where: { workspaceId, archivedAt: null } }),
    blendedDayRateGbp(workspaceId, { fxFromUsd, seniority: "senior" }),
    getSavedCostingConfig(workspaceId),
    seedRatesFromRateCard(workspaceId, fxFromUsd),
  ]);
  return {
    liveFxFromUsd: fx?.rate ?? null,
    fxAsOf: fx?.asOf ?? null,
    hasRateCard: rateCardCount > 0,
    blendedBuildDayRateGbp: blended,
    defaults: { ...DEFAULT_ADVANCED_CONFIG, fxFromUsd },
    saved,
    seededRates,
  };
}
