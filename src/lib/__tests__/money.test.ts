import { describe, expect, it } from "vitest";
import { docTerms, earnedIn, lastEarningMonth, summariseMoney, toBase, type DocLine, type FxRates } from "@/lib/money";

const NOW = new Date("2026-11-20T12:00:00Z");
const GBP: FxRates = { base: "GBP", rates: { USD: 0.8 }, asOf: "2026-11-20" };

const role = (unitCost: number, months: number): DocLine => ({
  itemName: "proposal-role:dev",
  quantity: months,
  unitCost,
  subtotal: unitCost * months,
  costKind: "ONE_OFF",
});
const once = (subtotal: number): DocLine => ({ itemName: "Discovery workshop", quantity: 1, unitCost: subtotal, subtotal, costKind: "ONE_OFF" });

describe("docTerms", () => {
  it("reads role lines as a monthly schedule and other lines as one-offs, after the discount", () => {
    const t = docTerms([role(4000, 3), once(2000)], { currency: "GBP", discount: 10 });
    expect(t.lines).toEqual([
      { kind: "monthly", amount: 3600, months: 3 },
      { kind: "once", amount: 1800 },
    ]);
    expect(t.total).toBe(3600 * 3 + 1800);
  });

  it("treats a recurring line as ongoing and counts a year of it in the total", () => {
    const t = docTerms([{ itemName: "Support", quantity: 1, unitCost: 500, subtotal: 500, costKind: "RECURRING" }], null);
    expect(t.lines).toEqual([{ kind: "ongoing", amount: 500 }]);
    expect(t.total).toBe(6000);
  });

  it("defaults to GBP with no discount when the costing block is missing or junk", () => {
    const t = docTerms([once(100)], { currency: "pounds", discount: "lots" });
    expect(t.currency).toBe("GBP");
    expect(t.total).toBe(100);
  });
});

describe("earnedIn / lastEarningMonth", () => {
  const t = docTerms([role(1000, 3), once(500)], null);

  it("earns the one-off in the month won and the role for its months only", () => {
    expect(earnedIn(t, "2026-09", "2026-08")).toBe(0);
    expect(earnedIn(t, "2026-09", "2026-09")).toBe(1500);
    expect(earnedIn(t, "2026-09", "2026-11")).toBe(1000);
    expect(earnedIn(t, "2026-09", "2026-12")).toBe(0);
    expect(lastEarningMonth(t, "2026-09")).toBe("2026-11");
  });

  it("has no last month for an ongoing fee", () => {
    const ongoing = docTerms([{ itemName: "x", quantity: 1, unitCost: 1, subtotal: 1, costKind: "RECURRING" }], null);
    expect(lastEarningMonth(ongoing, "2026-01")).toBeNull();
  });
});

describe("toBase", () => {
  it("converts with a rate and refuses to guess without one", () => {
    expect(toBase(100, "USD", GBP)).toBe(80);
    expect(toBase(100, "GBP", GBP)).toBe(100);
    expect(toBase(100, "JPY", GBP)).toBeNull();
  });
});

describe("summariseMoney", () => {
  const clients = [
    { id: "a", name: "Alpha", slug: "alpha", team: { amount: 3000, currency: "USD", unpricedDevs: 1 }, retainerDays: 4, retainerDaysUsed: 2 },
    { id: "b", name: "Beta", slug: "beta", team: null, retainerDays: null, retainerDaysUsed: null },
  ];

  const m = summariseMoney({
    now: NOW,
    fx: GBP,
    clients,
    won: [
      // Won in Sept: 3 months of £1,000, so it earns Sept, Oct and Nov.
      { id: "d1", title: "Alpha build", clientId: "a", wonAt: "2026-09-10T00:00:00Z", terms: docTerms([role(1000, 3)], null) },
      // Won this month in dollars: $2,000/mo for 4 months → £1,600/mo.
      { id: "d2", title: "Alpha phase 2", clientId: "a", wonAt: "2026-11-02T00:00:00Z", terms: docTerms([role(2000, 4)], { currency: "USD" }) },
      // Won in yen: no rate, so it's left out of totals and reported.
      { id: "d3", title: "Beta", clientId: "b", wonAt: "2026-11-05T00:00:00Z", terms: docTerms([once(50000)], { currency: "JPY" }) },
      // Won two years ago: earns nothing now and isn't in the last 12 months.
      { id: "d0", title: "Old", clientId: "b", wonAt: "2024-10-01T00:00:00Z", terms: docTerms([role(1000, 2)], null) },
    ],
    pipeline: [{ id: "p1", title: "Gamma", clientId: null, sharedAt: "2026-11-01T00:00:00Z", viewed: true, terms: docTerms([once(9000)], null) }],
  });

  it("adds up this month from every schedule running now", () => {
    expect(m.thisMonth).toBe(1000 + 1600);
  });

  it("compares with last month, when only the first deal was earning", () => {
    expect(m.monthChange).toBeCloseTo((2600 - 1000) / 1000);
  });

  it("counts what's still to bill after this month", () => {
    expect(m.toCome).toBe(1600 * 3);
  });

  it("sums the last 12 months' wins it could convert, and reports what it couldn't", () => {
    expect(m.wonLast12).toBe(3000 + 6400);
    expect(m.dealsLast12).toBe(2);
    expect(m.unconverted).toEqual({ JPY: 50000 });
  });

  it("draws 12 months back and 6 forward, future months marked as signed-so-far", () => {
    expect(m.months).toHaveLength(18);
    const nov = m.months.find((b) => b.month === "2026-11");
    expect(nov?.amount).toBe(2600);
    expect(nov?.future).toBe(false);
    expect(m.months.find((b) => b.month === "2026-12")?.future).toBe(true);
    expect(m.months.find((b) => b.month === "2027-02")?.amount).toBe(1600);
    expect(m.months.find((b) => b.month === "2027-03")?.amount).toBe(0);
  });

  it("puts the client earning most first, with when its contract runs to", () => {
    expect(m.clients[0].id).toBe("a");
    expect(m.clients[0].contractedTo).toBe("2027-02");
    expect(m.clients[0].teamCost).toBe(2400);
    expect(m.clients[0].margin).toBe(m.clients[0].thisMonth - 2400);
    expect(m.clients[0].retainer).toEqual({ used: 2, allowance: 4 });
    expect(m.unpricedDevs).toBe(1);
  });

  it("takes every client's team cost off this month for the margin", () => {
    const cost = m.clients.reduce((sum, c) => sum + (c.teamCost ?? 0), 0);
    expect(m.teamCost).toBe(cost);
    expect(m.margin).toBe(Math.round((m.thisMonth - cost) * 100) / 100);
    expect(m.marginShare).toBeCloseTo((m.margin ?? 0) / m.thisMonth);
  });

  it("values the pipeline", () => {
    expect(m.pipeline).toBe(9000);
    expect(m.pipelineDeals).toBe(1);
  });
});
