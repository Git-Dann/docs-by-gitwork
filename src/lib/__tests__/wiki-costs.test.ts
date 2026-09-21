/**
 * The running-cost engine. A client reads these numbers when deciding what to charge
 * their own users, so the arithmetic is pinned — and so is every place the model
 * declines to answer.
 */
import { describe, expect, it } from "vitest";
import {
  buildCostReadout,
  formatCostMoney,
  projectAt,
  SCALE_BANDS,
  tierFor,
} from "@/lib/wiki-costs";
import type { CostItem } from "@/types/wiki-costs";

function item(partial: Partial<CostItem> & Pick<CostItem, "id" | "name" | "kind">): CostItem {
  return {
    vendor: null,
    amountMonthly: null,
    amountAnnual: null,
    unitLabel: null,
    includedUnits: null,
    unitPrice: null,
    unitsPerUser: null,
    tiers: [],
    notes: null,
    orderKey: 0,
    included: true,
    ...partial,
  };
}

const flat = item({ id: "f", name: "Vercel Pro", kind: "FLAT", amountMonthly: 20 });
const seat = item({ id: "s", name: "Support seat", kind: "PER_USER", amountMonthly: 0.1 });
const metered = item({
  id: "m",
  name: "Egress",
  kind: "METERED",
  amountMonthly: 25,
  unitLabel: "GB",
  includedUnits: 100,
  unitPrice: 0.09,
  unitsPerUser: 0.5,
});
const stepped = item({
  id: "t",
  name: "Supabase",
  kind: "STEPPED",
  tiers: [
    { id: "t1", upToUsers: 10_000, amountMonthly: 25, label: "Pro", orderKey: 0 },
    { id: "t2", upToUsers: null, amountMonthly: 599, label: "Team", orderKey: 1 },
  ],
});

describe("each pricing kind", () => {
  it("FLAT does not move with users", () => {
    expect(projectAt([flat], 50).totalMonthly).toBe(20);
    expect(projectAt([flat], 1_000_000).totalMonthly).toBe(20);
  });

  it("PER_USER scales linearly and holds a constant cost per user", () => {
    expect(projectAt([seat], 1_000).totalMonthly).toBe(100);
    expect(projectAt([seat], 1_000).perUserMonthly).toBe(0.1);
    expect(projectAt([seat], 1_000_000).perUserMonthly).toBe(0.1);
  });

  it("METERED charges only beyond the included allowance", () => {
    // 100 users x 0.5 GB = 50 GB, inside the 100 included → base fee only.
    expect(projectAt([metered], 100).totalMonthly).toBe(25);
    // 1,000 users x 0.5 = 500 GB; 400 billable x 0.09 = 36, plus the 25 base.
    expect(projectAt([metered], 1_000).totalMonthly).toBe(61);
  });

  it("STEPPED jumps at the band boundary, not before it", () => {
    expect(projectAt([stepped], 10_000).totalMonthly).toBe(25);
    expect(projectAt([stepped], 10_001).totalMonthly).toBe(599);
  });

  it("picks the first band whose cap covers the count", () => {
    expect(tierFor(stepped, 5_000)?.label).toBe("Pro");
    expect(tierFor(stepped, 999_999)?.label).toBe("Team");
  });
});

describe("what the engine refuses to guess", () => {
  it("⚠️ reports cost per user as null at zero users, never 0", () => {
    // 0 would render as "free". The cost per user of nobody is undefined.
    const p = projectAt([flat], 0);
    expect(p.perUserMonthly).toBeNull();
    expect(p.perUserAnnual).toBeNull();
    expect(p.totalMonthly).toBe(20);
  });

  it("⚠️ does not cost a driverless metered item's usage at zero", () => {
    // The failure this prevents: without a per-user figure the usage is UNKNOWN. Costing
    // it at £0 makes a projection at 1M users look cheap and entirely plausible.
    const noDriver = item({
      id: "x",
      name: "SMS",
      kind: "METERED",
      amountMonthly: 10,
      unitPrice: 0.04,
      unitsPerUser: null,
    });
    const out = buildCostReadout([noDriver], 1_000_000);
    expect(out.headline.totalMonthly).toBe(10);
    expect(out.headline.incomplete).toBe(true);
    expect(out.blindSpots.map((b) => b.kind)).toContain("METERED_NO_DRIVER");
    expect(out.blindSpots.find((b) => b.kind === "METERED_NO_DRIVER")!.items).toEqual(["SMS"]);
  });

  it("⚠️ treats a capped top band as a floor above the cap, not as the price", () => {
    // Carrying the top price forward would quietly claim a discount nobody offered.
    const capped = item({
      id: "c",
      name: "Capped plan",
      kind: "STEPPED",
      tiers: [{ id: "c1", upToUsers: 100_000, amountMonthly: 500, label: "Max", orderKey: 0 }],
    });
    const within = buildCostReadout([capped], 50_000);
    expect(within.headline.incomplete).toBe(false);

    const beyond = buildCostReadout([capped], 1_000_000);
    expect(beyond.headline.totalMonthly).toBe(500); // a floor
    expect(beyond.headline.incomplete).toBe(true);
    expect(beyond.blindSpots.map((b) => b.kind)).toContain("BEYOND_LAST_TIER");
  });

  it("names a stepped item with no bands rather than costing it silently", () => {
    const empty = item({ id: "e", name: "Unset plan", kind: "STEPPED" });
    const out = buildCostReadout([empty], 1_000);
    expect(out.headline.totalMonthly).toBe(0);
    expect(out.blindSpots.map((b) => b.kind)).toContain("STEPPED_NO_TIERS");
  });

  it("says so when there is nothing in the model at all", () => {
    expect(buildCostReadout([], 1_000).blindSpots.map((b) => b.kind)).toEqual(["NO_ITEMS"]);
  });
});

describe("the readout", () => {
  const model = [flat, seat, metered, stepped];

  it("falls per user as fixed costs amortise, then steps at a plan boundary", () => {
    const out = buildCostReadout(model, 1_000);
    const at = (u: number) => out.scale.find((s) => s.users === u)!;
    // Fixed fees dominate at 50 and are spread thin by 10,000.
    expect(at(50).perUserMonthly!).toBeGreaterThan(at(10_000).perUserMonthly!);
    // Then Supabase steps 25 → 599 just past 10,000, so the next band is dearer per user.
    expect(at(50_000).perUserMonthly!).toBeGreaterThan(at(10_000).perUserMonthly!);
  });

  it("walks every scale band", () => {
    expect(buildCostReadout(model, 1_000).scale.map((s) => s.users)).toEqual([...SCALE_BANDS]);
  });

  it("reports an annual saving only where an annual price beats twelve monthly", () => {
    const withDeal = item({
      id: "d",
      name: "Annual deal",
      kind: "FLAT",
      amountMonthly: 100,
      amountAnnual: 1_000,
    });
    expect(buildCostReadout([withDeal], 10).annualSaving).toBe(200);
    // No annual price → annual is just 12 x monthly, so there is no saving to claim.
    expect(buildCostReadout([flat], 10).annualSaving).toBe(0);
  });

  it("scales an annual PER_USER price with the head count", () => {
    // The trap: an annual per-user price is still PER USER. Treating it as a total would
    // under-report by a factor of the entire user base.
    const annualSeat = item({
      id: "as",
      name: "Seat",
      kind: "PER_USER",
      amountMonthly: 1,
      amountAnnual: 10,
    });
    expect(buildCostReadout([annualSeat], 100).headline.totalAnnual).toBe(1_000);
  });
});

describe("formatCostMoney — the figure a client reads", () => {
  it("shows four decimals for a sub-penny per-user cost, not £0.00", () => {
    // ⚠️ THE rule this formatter exists for. At a million users a £600/mo bill is
    // £0.0006 a head; printing "£0.00" would tell a client the app is free to run.
    expect(formatCostMoney(0.0006, "GBP", true)).toBe("£0.0006");
    expect(formatCostMoney(0.04, "GBP", true)).toBe("£0.0400");
  });

  it("keeps totals at two decimals", () => {
    expect(formatCostMoney(0.0006, "GBP")).toBe("£0.00");
    expect(formatCostMoney(2186, "GBP")).toBe("£2,186.00");
  });

  it("uses two decimals for a per-user figure at or above 10p", () => {
    expect(formatCostMoney(0.44, "GBP", true)).toBe("£0.44");
  });

  it("renders an em-dash for null, never a zero", () => {
    // null means "undefined at this user count" (a per-user cost of nobody), and 0
    // would read as free — the §35 rule in its smallest form.
    expect(formatCostMoney(null, "GBP", true)).toBe("—");
  });

  it("exactly zero is a real zero, not a sub-penny rounding case", () => {
    expect(formatCostMoney(0, "GBP", true)).toBe("£0.00");
  });

  it("falls back to the raw code rather than throwing on an unknown currency", () => {
    // A bad ISO code in the model must not blank the whole page.
    expect(formatCostMoney(12, "XXZZ", false)).toBe("XXZZ 12.00");
  });
});

describe("zero users — a client before launch", () => {
  /** Two fixed fees and a per-seat line, so the seat line must contribute nothing. */
  const preLaunch: CostItem[] = [
    item({ id: "host", name: "Hosting", kind: "FLAT", amountMonthly: 48, amountAnnual: 480 }),
    item({ id: "db", name: "Database", kind: "FLAT", amountMonthly: 25 }),
    item({ id: "seats", name: "Seats", kind: "PER_USER", amountMonthly: 0.4 }),
  ];

  it("totals the fixed fees — they are paid whether or not anyone signs up", () => {
    // THE point of the zero state. A client pre-launch has a real monthly cost and it
    // is the number they most need; reporting nothing here would be the §35 mistake.
    expect(projectAt(preLaunch, 0).totalMonthly).toBe(73);
  });

  it("contributes nothing for per-seat lines at zero head count", () => {
    expect(projectAt([preLaunch[2]], 0).totalMonthly).toBe(0);
  });

  it("leaves cost per user undefined, never zero", () => {
    // £0.00 would read as "free to run", which is the opposite of true here.
    const p = projectAt(preLaunch, 0);
    expect(p.perUserMonthly).toBeNull();
    expect(p.perUserAnnual).toBeNull();
  });

  it("never reports a negative total — the cost is positive, the margin is not ours", () => {
    // Foundry holds no revenue figure, so a minus sign here would be a P&L we cannot
    // back. Every band must be >= 0 however the model is built.
    for (const row of buildCostReadout(preLaunch, 0).scale) {
      expect(row.totalMonthly).toBeGreaterThanOrEqual(0);
      expect(row.totalAnnual).toBeGreaterThanOrEqual(0);
    }
  });

  it("starts the scale table at zero, so the fixed-cost floor is a visible row", () => {
    expect(SCALE_BANDS[0]).toBe(0);
    expect(buildCostReadout(preLaunch, 0).scale[0]).toMatchObject({
      users: 0,
      totalMonthly: 73,
      perUserMonthly: null,
    });
  });

  it("still prices a stepped plan at its smallest band with no users", () => {
    // `tierFor` takes the first band whose cap covers the count, and every bounded band
    // covers 0 — so a pre-launch client is on the cheapest plan, not off the ladder.
    const stepped = item({
      id: "s",
      name: "Plan",
      kind: "STEPPED",
      tiers: [
        { id: "t1", upToUsers: 1000, amountMonthly: 25, label: "Pro", orderKey: 0 },
        { id: "t2", upToUsers: null, amountMonthly: 120, label: "Team", orderKey: 1 },
      ],
    });
    expect(projectAt([stepped], 0).totalMonthly).toBe(25);
  });
});

describe("options — priced, not committed", () => {
  const committed = item({
    id: "host",
    name: "Hosting",
    kind: "FLAT",
    amountMonthly: 100,
    amountAnnual: 1000,
  });
  /** Two AI providers on identical assumptions, so only the unit price differs. */
  const cheap = item({
    id: "haiku",
    name: "Haiku",
    kind: "METERED",
    amountMonthly: 0,
    unitPrice: 0.001,
    unitsPerUser: 40,
    unitLabel: "k tokens",
    notes: "40k tokens per user",
    included: false,
  });
  const dear = item({
    id: "sonnet",
    name: "Sonnet",
    kind: "METERED",
    amountMonthly: 0,
    unitPrice: 0.01,
    unitsPerUser: 40,
    unitLabel: "k tokens",
    included: false,
  });
  const all = [committed, cheap, dear];

  it("keeps an option out of the total — the whole point", () => {
    // 1,000 users: committed 100; Haiku would add 40, Sonnet 400. Neither counts.
    expect(projectAt(all, 1_000).totalMonthly).toBe(100);
  });

  it("keeps an option out of cost per user", () => {
    expect(projectAt(all, 1_000).perUserMonthly).toBe(0.1);
  });

  it("keeps an option out of every band of the growth curve", () => {
    // ⚠️ The curve is what a client reads to plan. One option leaking in here is
    // harder to spot than in the total, because there is no single figure to check.
    const withOptions = buildCostReadout(all, 1_000).scale;
    const withoutOptions = buildCostReadout([committed], 1_000).scale;
    expect(withOptions.map((r) => r.totalMonthly)).toEqual(
      withoutOptions.map((r) => r.totalMonthly),
    );
  });

  it("keeps an option out of the committed line list", () => {
    expect(buildCostReadout(all, 1_000).lines.map((l) => l.itemId)).toEqual(["host"]);
  });

  it("still prices each option at the headline count, so they are comparable", () => {
    const opts = buildCostReadout(all, 1_000).options;
    expect(opts.map((o) => o.line.name)).toEqual(["Haiku", "Sonnet"]);
    expect(opts[0].line.monthly).toBe(40);
    expect(opts[1].line.monthly).toBe(400);
  });

  it("gives each option the two figures a choice turns on", () => {
    const [haiku] = buildCostReadout(all, 1_000).options;
    expect(haiku.perUserMonthly).toBe(0.04);
    // "adopting this takes you from £100 to £140" — the decision number.
    expect(haiku.totalMonthlyWith).toBe(140);
  });

  it("carries the option's note, because a comparison needs its assumptions", () => {
    expect(buildCostReadout(all, 1_000).options[0].notes).toBe("40k tokens per user");
  });

  it("an item with no `included` field counts, so nothing already stored changed", () => {
    // Belt and braces: the column defaults true AND the filter tests `!== false`.
    const legacy = { ...committed } as Partial<CostItem>;
    delete legacy.included;
    expect(projectAt([legacy as CostItem], 1_000).totalMonthly).toBe(100);
  });

  it("says so when EVERY line is an option, rather than reading as free", () => {
    const r = buildCostReadout([cheap, dear], 1_000);
    expect(r.headline.totalMonthly).toBe(0);
    expect(r.blindSpots.map((b) => b.kind)).toContain("ALL_EXCLUDED");
  });

  it("reports no options when there are none, so the panel stays away", () => {
    expect(buildCostReadout([committed], 1_000).options).toEqual([]);
    expect(buildCostReadout([committed], 1_000).blindSpots.map((b) => b.kind)).not.toContain(
      "ALL_EXCLUDED",
    );
  });
});

describe("metered wording", () => {
  const noAllowance = item({
    id: "ai",
    name: "AI",
    kind: "METERED",
    amountMonthly: 0,
    unitPrice: 0.001,
    unitsPerUser: 40,
    unitLabel: "k tokens",
  });

  it("does not say 'over the 0 included' when there is no allowance", () => {
    // The normal case for usage-priced AI, and a client reads this line.
    const [line] = buildCostReadout([noAllowance], 1_000).lines;
    expect(line.detail).toBe("40,000 k tokens");
    expect(line.detail).not.toContain("included");
  });

  it("still names the allowance when there is one", () => {
    const withAllowance = item({ ...noAllowance, id: "e", includedUnits: 50_000 });
    expect(buildCostReadout([withAllowance], 1_000).lines[0].detail).toContain(
      "within the 50,000 included",
    );
  });
});
