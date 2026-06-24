// Deterministic engagement pricing — turns the AI effort estimate into realistic,
// rate-card-grounded GBP price/timeline bands for 1/2/3-dev teams. No AI.
//
// Model: effort is a fixed quantity of DEV-WEEKS (derived from the estimate, which
// is sized for "a small senior team ≈ 2"). Team size then sets the CALENDAR weeks
// and cost — sublinearly, because adding people adds coordination overhead:
//   calendarWeeks = devWeeks / (devs × efficiency(devs))
//   cost          = devWeeks × 5 days × blendedDayRate   (a low–high band)
// So more devs ⇒ fewer calendar weeks but (slightly) higher cost. Defensible and
// seeds the proposal.

import { prisma } from "@/lib/prisma";
import { normalizeToMonthly, WORKING_DAYS_PER_MONTH } from "@/server/rate-card";
import type { EngagementEstimate, PricingBand, PulsePricingConfig } from "@/types/pulse";

const DEFAULT_FX_FROM_USD = 0.79;
const DEFAULT_DAY_RATE_GBP = 450; // fallback when the rate card is empty
const ASSUMED_ESTIMATE_TEAM = 2; // the AI estimate assumes ≈2 senior devs
const DAYS_PER_WEEK = 5;
// Per-dev throughput drops as the team grows (coordination overhead).
const EFFICIENCY: Record<number, number> = { 1: 1.0, 2: 0.85, 3: 0.75 };

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function resolvePricingConfig(raw: unknown): PulsePricingConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<PulsePricingConfig>;
  return {
    fxFromUsd: typeof c.fxFromUsd === "number" && c.fxFromUsd > 0 ? c.fxFromUsd : DEFAULT_FX_FROM_USD,
    dayRateOverrideGbp: typeof c.dayRateOverrideGbp === "number" && c.dayRateOverrideGbp > 0 ? c.dayRateOverrideGbp : undefined,
    seniority: c.seniority === "mid" ? "mid" : "senior",
  };
}

/** Blended GBP day rate for a small team, from the workspace rate card. */
export async function blendedDayRateGbp(workspaceId: string, config: PulsePricingConfig): Promise<number> {
  if (config.dayRateOverrideGbp) return config.dayRateOverrideGbp;

  const people = await prisma.rateCardPerson.findMany({
    where: { workspaceId, archivedAt: null },
    select: { sourceRate: true, sourceCurrencyCode: true, billingPeriod: true, area: true },
  });
  if (people.length === 0) return DEFAULT_DAY_RATE_GBP;

  // Optionally narrow to a seniority band (area carries "Senior • …" / "Mid • …").
  const band = people.filter((p) =>
    config.seniority === "senior" ? /senior|lead|principal/i.test(p.area) : true,
  );
  const pool = band.length > 0 ? band : people;

  const monthlyGbp = pool.map((p) => {
    const monthly = normalizeToMonthly(p.sourceRate, p.billingPeriod);
    // Convert to GBP. Rate card is USD today; apply FX for USD, pass GBP through.
    const code = (p.sourceCurrencyCode || "USD").toUpperCase();
    return code === "GBP" ? monthly : monthly * config.fxFromUsd;
  });

  const dayRate = median(monthlyGbp) / WORKING_DAYS_PER_MONTH;
  return Math.round(dayRate / 5) * 5; // tidy to nearest £5
}

/** Compute 1/2/3-dev pricing+timeline bands from the AI effort estimate. */
export function computePricingBands(estimate: EngagementEstimate, dayRateGbp: number): PricingBand[] {
  // Estimate weeks are calendar weeks for ≈2 devs → convert to dev-weeks of effort.
  const devWeeksLow = Math.max(1, estimate.weeksLow) * ASSUMED_ESTIMATE_TEAM;
  const devWeeksHigh = Math.max(estimate.weeksHigh, estimate.weeksLow) * ASSUMED_ESTIMATE_TEAM;

  return [1, 2, 3].map((devs) => {
    const eff = EFFICIENCY[devs] ?? 1;
    const calLow = Math.max(1, Math.round(devWeeksLow / (devs * eff)));
    const calHigh = Math.max(calLow, Math.round(devWeeksHigh / (devs * eff)));
    // Cost is driven by total dev-weeks of effort (≈constant across team sizes,
    // rising slightly because lower per-dev efficiency means more total dev-time).
    const effortMultiplier = 1 / eff; // 1.0 / 1.18 / 1.33
    const priceLow = Math.round((devWeeksLow * DAYS_PER_WEEK * dayRateGbp * effortMultiplier) / 100) * 100;
    const priceHigh = Math.round((devWeeksHigh * DAYS_PER_WEEK * dayRateGbp * effortMultiplier) / 100) * 100;
    return {
      devs,
      weeksLow: calLow,
      weeksHigh: calHigh,
      priceLowGbp: priceLow,
      priceHighGbp: priceHigh,
      blendedDayRateGbp: dayRateGbp,
      rationale: `${devs} dev${devs > 1 ? "s" : ""} · ~${calLow}–${calHigh} wks` + (devs > 1 ? " · coordination overhead applied" : ""),
    };
  });
}

/** Convenience: resolve config, blend the day rate, and compute bands in one call. */
export async function computePricingBandsForWorkspace(
  workspaceId: string,
  pricingConfigRaw: unknown,
  estimate: EngagementEstimate,
): Promise<PricingBand[]> {
  const config = resolvePricingConfig(pricingConfigRaw);
  const dayRate = await blendedDayRateGbp(workspaceId, config);
  return computePricingBands(estimate, dayRate);
}
