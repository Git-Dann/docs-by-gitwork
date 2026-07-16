// Gitwork Costing & Quote tool — shared DTO types (client-safe; no server imports).
//
// Aligned to the four packages published on gitwork.co.uk. You pick a package, give it a couple of
// inputs, and get a client price + (Super-Admin-only) internal cost & margin. Fixed-price packages
// (Launch Pad, MVP Sprint) take a target price and show the resulting margin; the recurring packages
// (Greenfield, Care) compute the price from their published unit rate.

export type PackageType = "launch_pad" | "mvp_sprint" | "greenfield" | "care_plan";

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
  {
    id: "launch_pad",
    name: "Launch Pad",
    tagline: "Finish a vibe-coded app",
    fromGbp: 4995,
    basis: "fixed",
    basisLabel: "fixed price",
    typical: "2–4 weeks",
  },
  {
    id: "mvp_sprint",
    name: "MVP Sprint",
    tagline: "Idea to MVP",
    fromGbp: 25000,
    basis: "fixed",
    basisLabel: "fixed price",
    typical: "4–6 weeks",
  },
  {
    id: "greenfield",
    name: "Greenfield Build",
    tagline: "Embedded engineering squad",
    fromGbp: 5000,
    basis: "per_dev_month",
    basisLabel: "per developer, per month",
    typical: "quarterly",
  },
  {
    id: "care_plan",
    name: "Care Plan",
    tagline: "Maintenance & ongoing",
    fromGbp: 1500,
    basis: "per_month",
    basisLabel: "per month, rolling",
    typical: "monthly",
  },
];

/** Advanced cost levers — sensible defaults; only affect the internal cost, not the client price. */
export interface CostingAdvancedConfig {
  fxFromUsd: number;
  buildSeniority: "mid" | "senior";
  ukReviewOverheadPercent: number;
  contingencyPercent: number;
  dayRateOverrideGbp?: number;
}

export type DevTier = "junior" | "mid" | "senior";

/** One editable developer cost rate. Seeded from the Rate Card, editable + saved per workspace. */
export interface CostingRate {
  id: string;
  label: string;
  tier: DevTier;
  dayRateGbp: number;
}

/** The persisted workspace costing config: the advanced levers plus the editable dev rate table. */
export interface SavedCostingConfig extends CostingAdvancedConfig {
  rates: CostingRate[];
}

export interface PackageCostingInput {
  packageType: PackageType;
  /** Current (possibly-unsaved) dev rates from the editor, so the quote reflects edits live. */
  rates?: CostingRate[];
  // Fixed packages (launch_pad, mvp_sprint):
  targetPriceGbp?: number;
  weeks?: number;
  devs?: number;
  // Greenfield (per dev, per month):
  months?: number;
  pricePerDevMonthGbp?: number;
  // Care (per month):
  effortDaysPerMonth?: number;
  pricePerMonthGbp?: number;
  // Advanced (shared):
  config?: Partial<CostingAdvancedConfig>;
}

export interface PackageCostingResult {
  packageType: PackageType;
  clientPriceGbp: number;
  priceBasisLabel: string; // how the price was formed, e.g. "£5,000/dev/mo × 2 × 3 mo"
  // Internal — Super-Admin only:
  internalCostGbp: number;
  marginPercent: number;
  markupPercent: number;
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
  /** Dev rates derived live from the Rate Card — the seed / "reset to Rate Card" target. */
  seededRates: CostingRate[];
}
