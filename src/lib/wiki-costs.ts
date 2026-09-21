/**
 * The running-cost engine — pure, no Prisma, no DOM, so it is unit-testable and the
 * arithmetic a client reads can be proved.
 *
 * Two properties matter more than the maths, and both are the same rule this codebase
 * keeps paying for (CLAUDE.md §35): **a figure we cannot compute must never arrive as a
 * confident zero.**
 *
 *   - A metered item with no per-user usage figure cannot scale. Costing its usage at £0
 *     would make a projection at 1,000,000 users look cheap and plausible. It is reported
 *     as a blind spot instead.
 *   - A stepped item whose top band is capped tells us nothing above that cap. Reusing the
 *     top price silently claims a discount nobody has offered, so the line is marked a
 *     floor and the total becomes "at least".
 *
 * ⚠️ Cost per user at zero users is `null`, never 0 — a per-user cost of nobody is
 * undefined, and 0 reads as "free".
 */
import type {
  CostBlindSpot,
  CostOption,
  CostItem,
  CostLine,
  CostProjection,
  CostReadout,
} from "@/types/wiki-costs";

/**
 * The bands the scale table walks. Roughly log-spaced because cost-per-user changes
 * fastest at the low end, where fixed fees dominate, and a linear axis would spend
 * every row on the flat part of the curve.
 *
 * ⚠️ It STARTS AT ZERO on purpose. A client before launch still pays every fixed fee,
 * and that floor is the most useful number they can be given — what the app costs to
 * run with nobody on it. Cost per user is undefined there (see `projectAt`), which is
 * the one cell in the table that reads as an em-dash rather than a figure.
 */
export const SCALE_BANDS = [
  0, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money in the model's own currency — the ONLY money formatter for costs, used by the
 * section, the scale table and the wiki dashboard card alike.
 *
 * ⚠️ Per-user figures need more than 2dp or they collapse to £0.00 at scale: at a
 * million users a £600/mo bill really is £0.0006 a head, and rounding that to zero is
 * the most misleading thing this feature could print. Totals stay at 2dp.
 *
 * It lives here rather than in the component because the dashboard card needs it too —
 * the first cut re-implemented it there as `${currency} ${n.toFixed(2)}` and the card
 * read "GBP 0.44" beside a page reading "£0.44".
 */
export function formatCostMoney(
  value: number | null,
  currency: string,
  perUser = false,
): string {
  if (value === null) return "—";
  const digits = perUser && value > 0 && value < 0.1 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // An unknown ISO code must not blank the page — show the code beside the number.
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** Annual price for a monthly figure, unless a real annual deal was entered. */
function annualFor(monthly: number, amountAnnual: number | null, multiplier: number): number {
  if (amountAnnual != null) return round2(amountAnnual * multiplier);
  return round2(monthly * 12);
}

/**
 * The band a user count falls in. Bands are matched in `orderKey` order and the first
 * whose cap covers the count wins; an `upToUsers: null` band is unbounded and always
 * matches. Returns `null` when the count is past every bounded band — the caller must
 * treat that as "unknown", not as "the top band".
 */
export function tierFor(item: CostItem, users: number) {
  const ordered = [...item.tiers].sort((a, b) => a.orderKey - b.orderKey);
  for (const t of ordered) {
    if (t.upToUsers == null || users <= t.upToUsers) return t;
  }
  return null;
}

function lineFor(item: CostItem, users: number): CostLine {
  const base = {
    itemId: item.id,
    name: item.name,
    vendor: item.vendor,
    kind: item.kind,
  };

  switch (item.kind) {
    case "FLAT": {
      const monthly = round2(item.amountMonthly ?? 0);
      return {
        ...base,
        monthly,
        annual: annualFor(monthly, item.amountAnnual, 1),
        detail: "Fixed — does not change with user count",
        incomplete: false,
      };
    }

    case "PER_USER": {
      const rate = item.amountMonthly ?? 0;
      const monthly = round2(rate * users);
      return {
        ...base,
        monthly,
        // An annual per-user price is per user, so it scales with the head count too.
        annual: annualFor(monthly, item.amountAnnual == null ? null : item.amountAnnual * users, 1),
        detail: `${fmtNum(rate)} per user × ${fmtNum(users)}`,
        incomplete: false,
      };
    }

    case "METERED": {
      const baseFee = item.amountMonthly ?? 0;
      // ⚠️ No driver → usage is UNKNOWN, not zero. The base fee is still real, so it is
      // charged; the line is marked incomplete and a blind spot names it.
      if (item.unitsPerUser == null || item.unitPrice == null) {
        return {
          ...base,
          monthly: round2(baseFee),
          annual: annualFor(round2(baseFee), item.amountAnnual, 1),
          detail: "Base fee only — usage per user not set, so usage is not included",
          incomplete: true,
        };
      }
      const units = item.unitsPerUser * users;
      const billable = Math.max(0, units - (item.includedUnits ?? 0));
      const monthly = round2(baseFee + billable * item.unitPrice);
      const unit = item.unitLabel ?? "units";
      return {
        ...base,
        monthly,
        annual: annualFor(monthly, item.amountAnnual, 1),
        // ⚠️ "over the 0 included" is not English. A line with no allowance is the
        // normal case for usage-priced AI, so it gets its own wording rather than a
        // sentence built around an allowance that does not exist.
        detail:
          !item.includedUnits
            ? `${fmtNum(units)} ${unit}`
            : billable === 0
              ? `${fmtNum(units)} ${unit} — within the ${fmtNum(item.includedUnits)} included`
              : `${fmtNum(billable)} ${unit} over the ${fmtNum(item.includedUnits)} included`,
        incomplete: false,
      };
    }

    case "STEPPED": {
      if (item.tiers.length === 0) {
        return { ...base, monthly: 0, annual: 0, detail: "No plan bands set", incomplete: true };
      }
      const tier = tierFor(item, users);
      if (!tier) {
        // Past every bounded band. Use the highest known price as a FLOOR and say so —
        // carrying the top price forward silently would price 1M users at the 100k rate.
        const ordered = [...item.tiers].sort((a, b) => a.orderKey - b.orderKey);
        const top = ordered[ordered.length - 1];
        const monthly = round2(top.amountMonthly);
        return {
          ...base,
          monthly,
          annual: annualFor(monthly, null, 1),
          detail: `At least the ${top.label ?? "top"} band — no price set above ${fmtNum(top.upToUsers ?? 0)} users`,
          incomplete: true,
        };
      }
      const monthly = round2(tier.amountMonthly);
      return {
        ...base,
        monthly,
        annual: annualFor(monthly, item.amountAnnual, 1),
        detail: tier.label
          ? `${tier.label} band`
          : tier.upToUsers == null
            ? "Top band"
            : `Up to ${fmtNum(tier.upToUsers)} users`,
        incomplete: false,
      };
    }
  }
}

function fmtNum(n: number): string {
  return n >= 1000 ? n.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : String(round2(n));
}

/**
 * Total the model at one user count.
 *
 * ⚠️ The included/excluded split happens HERE, at the lowest level, rather than in
 * each caller. `projectAt` is called directly by the wiki dashboard card as well as
 * by `buildCostReadout`, and a caller that forgot to filter would quietly report an
 * option the client has not chosen as part of their bill — which is the one thing
 * this feature must never do.
 */
export function projectAt(items: CostItem[], users: number): CostProjection {
  const lines = committedItems(items).map((i) => lineFor(i, users));
  const totalMonthly = round2(lines.reduce((s, l) => s + l.monthly, 0));
  const totalAnnual = round2(lines.reduce((s, l) => s + l.annual, 0));
  return {
    users,
    totalMonthly,
    totalAnnual,
    // ⚠️ null, not 0 — see the header.
    perUserMonthly: users > 0 ? round2(totalMonthly / users) : null,
    perUserAnnual: users > 0 ? round2(totalAnnual / users) : null,
    incomplete: lines.some((l) => l.incomplete),
  };
}

/** The lines that count toward the bill. An item predating this field counts. */
export function committedItems(items: CostItem[]): CostItem[] {
  return items.filter((i) => i.included !== false);
}

/** The lines being priced as options — costed, never counted. */
export function optionItems(items: CostItem[]): CostItem[] {
  return items.filter((i) => i.included === false);
}

function blindSpots(items: CostItem[]): CostBlindSpot[] {
  const out: CostBlindSpot[] = [];
  if (items.length === 0) {
    out.push({ kind: "NO_ITEMS", items: [], message: "No costs have been added yet." });
    return out;
  }

  // ⚠️ Every line an option means the committed total is genuinely £0 — true, but it
  // would read as "free to run" beside a table full of priced services. Say which it
  // is. Reported first because it reframes every figure above it.
  if (committedItems(items).length === 0) {
    out.push({
      kind: "ALL_EXCLUDED",
      items: [],
      message:
        "Nothing here is committed yet — every line is being priced as an option, so " +
        "the total above is zero rather than cheap.",
    });
  }

  const noDriver = items
    .filter((i) => i.kind === "METERED" && (i.unitsPerUser == null || i.unitPrice == null))
    .map((i) => i.name);
  if (noDriver.length) {
    out.push({
      kind: "METERED_NO_DRIVER",
      items: noDriver,
      message:
        "Usage per user has not been set for these, so only their base fee is counted. " +
        "The real cost at higher user numbers will be higher than shown.",
    });
  }

  const noTiers = items.filter((i) => i.kind === "STEPPED" && i.tiers.length === 0).map((i) => i.name);
  if (noTiers.length) {
    out.push({
      kind: "STEPPED_NO_TIERS",
      items: noTiers,
      message: "These are set to use plan bands, but no bands have been entered, so they count as nothing.",
    });
  }

  // Capped at the top with no unbounded band — unknown above that point.
  const capped = items
    .filter((i) => i.kind === "STEPPED" && i.tiers.length > 0 && i.tiers.every((t) => t.upToUsers != null))
    .map((i) => i.name);
  if (capped.length) {
    out.push({
      kind: "BEYOND_LAST_TIER",
      items: capped,
      message:
        "These have no price set beyond their largest plan band. Above it the figure shown " +
        "is a minimum, not a quote.",
    });
  }

  const noPrice = items
    .filter((i) => i.kind !== "STEPPED" && (i.amountMonthly ?? 0) === 0 && (i.unitPrice ?? 0) === 0)
    .map((i) => i.name);
  if (noPrice.length) {
    out.push({
      kind: "NO_PRICE",
      items: noPrice,
      message: "No price has been entered for these, so they add nothing to the total.",
    });
  }

  return out;
}

/** Everything the page renders, from the stored model. */
export function buildCostReadout(items: CostItem[], headlineUsers: number): CostReadout {
  const committed = committedItems(items);
  const headline = projectAt(items, headlineUsers);
  const lines = committed.map((i) => lineFor(i, headlineUsers));

  /**
   * Each option priced at the SAME user count as the committed total, which is what
   * makes them comparable with each other and with the bill. `totalMonthlyWith` is
   * the number a decision actually turns on — "adopting this takes you from X to Y".
   */
  const options: CostOption[] = optionItems(items).map((item) => {
    const line = lineFor(item, headlineUsers);
    return {
      line,
      perUserMonthly: headlineUsers > 0 ? round2(line.monthly / headlineUsers) : null,
      totalMonthlyWith: round2(headline.totalMonthly + line.monthly),
      notes: item.notes,
    };
  });
  const monthlyTimesTwelve = round2(headline.totalMonthly * 12);
  return {
    headline,
    lines,
    scale: SCALE_BANDS.map((u) => projectAt(items, u)),
    blindSpots: blindSpots(items),
    options,
    // Positive when paying annually is cheaper than twelve monthly payments.
    annualSaving: round2(Math.max(0, monthlyTimesTwelve - headline.totalAnnual)),
  };
}
