/**
 * Running costs — what a client's app costs to operate, per end user.
 *
 * Distinct from `src/types/costing.ts`, which prices GITWORK'S SERVICES to the client
 * (day rates, packages, margin). This models the third-party bill the app itself
 * generates — Supabase, Vercel, Twilio, an LLM provider, app-store fees — so a client
 * weighing up subscription pricing can see what a user actually costs them.
 *
 * ⚠️ **One currency per model, entered by hand.** Most infrastructure bills in USD, and
 * the temptation is to hold each item in its own currency and convert with live FX
 * (`src/server/fx.ts` already does this for the services calculator). Deliberately not
 * done: this page is CLIENT-FACING, and a headline cost-per-user that drifts with the
 * exchange rate every time they reload implies a precision the model does not have. The
 * rate you assumed is a decision to record, not a live feed.
 */

/** How a line item's price behaves as the user count changes. */
export type CostItemKind =
  /** Fixed monthly fee, unaffected by user count (a Vercel Pro seat, a domain). */
  | "FLAT"
  /** Priced per user per month — the only kind whose cost/user is constant. */
  | "PER_USER"
  /** A base fee plus usage beyond an included allowance (bandwidth, SMS, tokens). */
  | "METERED"
  /** Plan bands that step at user thresholds (Pro → Team → Enterprise). */
  | "STEPPED";

export interface CostTier {
  id: string;
  /** Highest user count this band covers. `null` = the unbounded top band. */
  upToUsers: number | null;
  /** The plan's price per month within this band. */
  amountMonthly: number;
  label: string | null;
  orderKey: number;
}

export interface CostItem {
  id: string;
  name: string;
  vendor: string | null;
  kind: CostItemKind;
  /** FLAT: the fee. PER_USER: the per-user fee. METERED: the base fee before usage. */
  amountMonthly: number | null;
  /** Annual price where it differs from 12 x monthly. Null = no annual deal. */
  amountAnnual: number | null;
  /** METERED — what is being metered, for the readout ("GB egress", "SMS"). */
  unitLabel: string | null;
  /** METERED — units included in the base fee before anything is charged. */
  includedUnits: number | null;
  /** METERED — price per unit beyond the allowance. */
  unitPrice: number | null;
  /**
   * METERED — units one user consumes per month. **This is what makes the projection
   * work**: without it a metered item cannot scale, and the engine reports that rather
   * than quietly costing its usage at zero.
   */
  unitsPerUser: number | null;
  tiers: CostTier[];
  notes: string | null;
  orderKey: number;
  /**
   * Whether this line counts toward the committed total.
   *
   * ⚠️ Defaults TRUE, and every line that already exists is true, so introducing this
   * changed no figure anyone had already seen.
   *
   * `false` means **priced, not committed** — an option under consideration. It is
   * still fully costed, which is the point: the question "which AI provider is
   * cheapest for us" is only answerable at the client's real user numbers. But it is
   * excluded from the total, from cost-per-user and from the growth curve, and it
   * renders in its own panel, so a reader can never mistake it for part of the bill.
   */
  included: boolean;
}

/** A thing the model cannot answer, named rather than silently costed as zero. */
export type CostBlindSpotKind =
  | "NO_ITEMS"
  | "METERED_NO_DRIVER"
  | "STEPPED_NO_TIERS"
  | "BEYOND_LAST_TIER"
  | "NO_PRICE"
  /** Every line is an option; nothing is committed, so the total really is zero. */
  | "ALL_EXCLUDED";

export interface CostBlindSpot {
  kind: CostBlindSpotKind;
  /** Which line items are affected, by name. */
  items: string[];
  /** Plain-English sentence for the reader — a client, not an engineer. */
  message: string;
}

export interface CostLine {
  itemId: string;
  name: string;
  vendor: string | null;
  kind: CostItemKind;
  monthly: number;
  annual: number;
  /** One line explaining how this number was reached ("12,000 GB over the 100 included"). */
  detail: string | null;
  /** True when this line is a floor rather than a figure — see BEYOND_LAST_TIER. */
  incomplete: boolean;
}

export interface CostProjection {
  users: number;
  totalMonthly: number;
  totalAnnual: number;
  /** `null` at zero users — a cost per user of nobody is not £0, it is undefined. */
  perUserMonthly: number | null;
  perUserAnnual: number | null;
  /** True when any line is a floor, so the total is a minimum rather than a figure. */
  incomplete: boolean;
}

/**
 * A line that is priced but NOT committed — one of the options being compared.
 *
 * It carries the two figures a choice actually turns on: what it costs per user at
 * the headline count (which is what "most cost efficient" means), and what the
 * committed total becomes if it is adopted.
 */
export interface CostOption {
  line: CostLine;
  /** `null` at zero users, and at zero this whole comparison has no denominator. */
  perUserMonthly: number | null;
  /** The committed monthly total WITH this option added — the decision number. */
  totalMonthlyWith: number;
  /**
   * The item's own note. Carried on the option rather than on `CostLine` because
   * this is where it earns its place: "Haiku at 6 calls/user" is the assumption the
   * comparison rests on, and a comparison without its assumptions is not one.
   */
  notes: string | null;
}

export interface CostModel {
  enabled: boolean;
  currency: string;
  /** The user count the headline banner is calculated at. */
  headlineUsers: number;
  items: CostItem[];
  notes: string | null;
  updatedAt: string | null;
}

export interface CostReadout {
  headline: CostProjection;
  lines: CostLine[];
  /** The 50 → 1M curve, one entry per band. */
  scale: CostProjection[];
  blindSpots: CostBlindSpot[];
  /** Annual saving across the model, where annual pricing was supplied. */
  annualSaving: number;
  /** Priced but not committed — rendered apart from the total, never inside it. */
  options: CostOption[];
}
