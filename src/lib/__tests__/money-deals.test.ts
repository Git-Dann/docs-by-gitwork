import { describe, expect, it } from "vitest";
import { amountInText, dealCostLines, dealProblems, dealTotal, parseDealDraft, type DealInput } from "@/lib/money-deals";
import { docTerms } from "@/lib/money";

const TODAY = new Date("2026-11-20T12:00:00Z");
const deal = (over: Partial<DealInput> = {}): DealInput => ({
  clientId: "c1",
  title: "Phase 2",
  wonOn: "2026-11-01",
  currency: "GBP",
  lines: [
    { label: "Senior developer", kind: "monthly", amount: 6000, months: 6 },
    { label: "Discovery", kind: "once", amount: 4500, months: null },
    { label: "Support", kind: "ongoing", amount: 800, months: null },
  ],
  source: { kind: "manual" },
  ...over,
});

describe("dealProblems", () => {
  it("accepts a complete deal", () => {
    expect(dealProblems(deal(), TODAY)).toEqual([]);
  });

  it("names what's missing, in sentences", () => {
    const p = dealProblems(deal({ clientId: "", title: " ", wonOn: "2027-01-01", currency: "JPY", lines: [{ label: "", kind: "monthly", amount: 0, months: null }] }), TODAY);
    expect(p).toEqual([
      "Choose the client.",
      "Give the deal a name.",
      "The date it was agreed can't be in the future.",
      "Choose GBP, USD or EUR.",
      "Line 1 needs a name.",
      "Line 1 needs an amount above zero.",
      "Line 1 needs a number of months (1 to 120).",
    ]);
  });
});

describe("dealCostLines", () => {
  it("writes lines the Money rules read back as the same schedule", () => {
    const terms = docTerms(dealCostLines(deal()), { currency: "GBP" });
    expect(terms.lines).toEqual([
      { kind: "monthly", amount: 6000, months: 6 },
      { kind: "once", amount: 4500 },
      { kind: "ongoing", amount: 800 },
    ]);
    expect(terms.total).toBe(dealTotal(deal().lines));
  });
});

describe("amountInText", () => {
  it("finds an amount however it's written, and not inside a bigger number", () => {
    expect(amountInText(12500, "Total £12,500 + VAT")).toBe(true);
    expect(amountInText(12500, "Fee 12500.00")).toBe(true);
    expect(amountInText(12500, "Budget of 12.5k")).toBe(true);
    expect(amountInText(2500, "Total £12,500")).toBe(false);
    expect(amountInText(125, "Total £12,500")).toBe(false);
  });
});

describe("parseDealDraft", () => {
  const text = "Order form. Senior developer £6,000 per month for 6 months. Discovery workshop £4,500.";

  it("cleans the reading and marks amounts that aren't in the file", () => {
    const d = parseDealDraft(
      {
        title: "Order form",
        clientName: "Acme",
        currency: "gbp",
        wonOn: "not a date",
        lines: [
          { label: "Senior developer", kind: "monthly", amount: 6000, months: 6 },
          { label: "Discovery", kind: "once", amount: "£4,500" },
          { label: "Invented", kind: "once", amount: 9999 },
          { label: "Zero", kind: "once", amount: 0 },
          "junk",
        ],
      },
      text,
    );
    expect(d.currency).toBe("GBP");
    expect(d.wonOn).toBeNull();
    expect(d.lines.map((l) => [l.label, l.amount, l.foundInFile])).toEqual([
      ["Senior developer", 6000, true],
      ["Discovery", 4500, true],
      ["Invented", 9999, false],
    ]);
    expect(d.notes.at(-1)).toMatch(/1 amount isn't written in the file/);
  });

  it("returns an empty draft for anything that isn't an object", () => {
    expect(parseDealDraft(null, text).lines).toEqual([]);
    expect(parseDealDraft([1, 2], text).title).toBe("");
  });
});
