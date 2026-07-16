// Gitwork Costing & Quote tool — shared DTO types (client-safe; no server imports).
//
// Aligned to the four packages on gitwork.co.uk. You pick a package, set the team by tier, and get a
// client price + (Super-Admin-only) internal cost & margin. The build cost is the sum of each tier's
// people × that tier's rate — so a mixed team (not all senior) is costed accurately. Tier rates are
// editable (per day or per month), seeded from the Rate Card, and saved per workspace.

export type PackageType = "launch_pad" | "mvp_sprint" | "greenfield" | "care_plan";
export type DevTier = "junior" | "mid" | "senior";
export type RatePeriod = "day" | "month";

/** One tier's internal build cost — an amount that's either per day or per month. */
export interface TierRate {
  amount: number;
  period: RatePeriod;
}

/** Editable internal build cost rates by seniority tier (each per day or per month). */
export interface TierRates {
  junior: TierRate;
  mid: TierRate;
  senior: TierRate;
}

/** Team composition by tier. For build packages these are developer counts; for Care they are
 *  engineer-days per month. */
export interface TierCounts {
  junior: number;
  mid: number;
  senior: number;
}

/** How a package's client price is formed. */
export type PriceBasis = "fixed" | "per_dev_month" | "per_month";

export interface PackageMeta {
  id: PackageType;
  name: string;
  tagline: string;
  /** The published "from" price on the site (GBP). */
  fromGbp: number;
  basis: PriceBasis;
  basisLabel: string;
  typical: string;
}

/** The four site packages, with their published "from" prices. Single source for the UI + defaults. */
export const COSTING_PACKAGES: PackageMeta[] = [
  { id: "launch_pad", name: "Launch Pad", tagline: "Finish a vibe-coded app", fromGbp: 4995, basis: "fixed", basisLabel: "fixed price", typical: "2–4 weeks" },
  { id: "mvp_sprint", name: "MVP Sprint", tagline: "Idea to MVP", fromGbp: 25000, basis: "fixed", basisLabel: "fixed price", typical: "4–6 weeks" },
  { id: "greenfield", name: "Greenfield Build", tagline: "Embedded engineering squad", fromGbp: 5000, basis: "per_dev_month", basisLabel: "per developer, per month", typical: "quarterly" },
  { id: "care_plan", name: "Care Plan", tagline: "Maintenance & ongoing", fromGbp: 1500, basis: "per_month", basisLabel: "per month, rolling", typical: "monthly" },
];

/** Advanced cost levers — sensible defaults; only affect the internal cost, not the client price. */
export interface CostingAdvancedConfig {
  fxFromUsd: number;
  ukReviewOverheadPercent: number;
  contingencyPercent: number;
}

/** The persisted workspace costing config: the advanced levers plus the three tier rates. */
export interface SavedCostingConfig extends CostingAdvancedConfig {
  tierRates: TierRates;
}

export interface PackageCostingInput {
  packageType: PackageType;
  /** Current (possibly-unsaved) tier rates from the editor, so the quote reflects edits live. */
  tierRates?: TierRates;
  /** Team by tier — dev counts for build packages, eng-days/month for Care. */
  team?: TierCounts;
  // Fixed packages (launch_pad, mvp_sprint):
  targetPriceGbp?: number;
  weeks?: number;
  // Greenfield (per dev, per month):
  months?: number;
  pricePerDevMonthGbp?: number;
  // Care (per month):
  pricePerMonthGbp?: number;
  // Advanced (shared):
  config?: Partial<CostingAdvancedConfig>;
}

export interface PackageCostingResult {
  packageType: PackageType;
  clientPriceGbp: number;
  priceBasisLabel: string;
  // Internal — Super-Admin only:
  internalCostGbp: number;
  marginPercent: number;
  markupPercent: number;
  /** Effective blended £/day across the chosen team. */
  buildDayRateGbp: number;
  usedRateCard: boolean;
  breakdown: { buildCostGbp: number; ukReviewCostGbp: number; contingencyGbp: number };
}

export interface CostingConfigResponse {
  liveFxFromUsd: number | null;
  fxAsOf: string | null;
  hasRateCard: boolean;
  blendedBuildDayRateGbp: number;
  defaults: CostingAdvancedConfig;
  /** The persisted workspace config, or null if never saved. */
  saved: SavedCostingConfig | null;
  /** Tier rates derived live from the Rate Card — the seed / "reset to Rate Card" target. */
  seededTierRates: TierRates;
}
