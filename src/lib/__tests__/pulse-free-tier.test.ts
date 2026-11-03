import { describe, expect, it } from "vitest";
import { buildPickerModel, normaliseFreeKeys, serialiseFreeKeys, splitByFreeSet } from "@/lib/pulse-free-tier";
import { triage } from "@/server/pulse-lite/public-scan";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import type { PulseScanCheckInput } from "@/types/pulse";

const f = (checkKey: string, category: string) => ({ checkKey, category });
const FINDINGS = [f("a", "Security"), f("b", "SEO"), f("c", "Security"), f("d", "Legal & Compliance")];

describe("splitByFreeSet", () => {
  it("null means no limit: everything shown, nothing locked, not 'limited'", () => {
    const r = splitByFreeSet(FINDINGS, null);
    expect(r.shown).toHaveLength(4);
    expect(r.lockedCount).toBe(0);
    expect(r.limited).toBe(false);
  });

  it("shows only chosen checks, keeps order, and counts the rest by category", () => {
    const r = splitByFreeSet(FINDINGS, new Set(["c", "a"]));
    expect(r.shown.map((x) => x.checkKey)).toEqual(["a", "c"]);
    expect(r.lockedCount).toBe(2);
    expect(r.lockedByCategory).toEqual([
      { category: "Legal & Compliance", count: 1 },
      { category: "SEO", count: 1 },
    ]);
    expect(r.limited).toBe(true);
  });

  it("an EMPTY set is a limit that shows nothing — not 'no limit'", () => {
    const r = splitByFreeSet(FINDINGS, new Set());
    expect(r.shown).toHaveLength(0);
    expect(r.lockedCount).toBe(4);
    expect(r.limited).toBe(true);
  });

  it("names locked findings by area only — never by key or label", () => {
    const r = splitByFreeSet(FINDINGS, new Set(["a"]));
    expect(JSON.stringify(r.lockedByCategory)).not.toMatch(/"(b|c|d)"/);
    expect(r.lockedByCategory).toContainEqual({ category: "Security", count: 1 });
    expect(Object.keys(r.lockedByCategory[0]).sort()).toEqual(["category", "count"]);
  });
});

describe("stored value", () => {
  const known = new Set(["a", "b"]);

  it("round-trips", () => {
    expect(normaliseFreeKeys(serialiseFreeKeys(["a", "b", "a"]), known)).toEqual(["a", "b"]);
    expect(serialiseFreeKeys(null)).toBeNull();
  });

  it("an OLD bare array (the retired picker's value) reads as NO limit", () => {
    // The column held a curated ~10-check array for years. Honouring it would re-impose a
    // stale selection the moment this shipped.
    expect(normaliseFreeKeys(["a", "b"], known)).toBeNull();
  });

  it("anything unrecognised opens the tier rather than closing it", () => {
    for (const bad of [undefined, null, "x", 5, {}, { keys: "a" }]) expect(normaliseFreeKeys(bad, known)).toBeNull();
  });

  it("drops retired keys but keeps the limit", () => {
    expect(normaliseFreeKeys({ keys: ["a", "gone"] }, known)).toEqual(["a"]);
    expect(normaliseFreeKeys({ keys: ["gone"] }, known)).toEqual([]);
  });
});

describe("triage applies the limit in one place", () => {
  const check = (checkKey: string, category: string, status: "FAIL" | "PASS", severity: "HIGH" | "LOW" = "HIGH") =>
    ({ checkKey, category, label: checkKey, status, severity, detail: `${checkKey} evidence`, weight: 1 }) as unknown as PulseScanCheckInput;
  const checks = [check("x_one", "Security", "FAIL"), check("x_two", "Legal & Compliance", "FAIL"), check("x_ok", "SEO", "PASS")];

  it("the SCORE is identical with and without a limit", () => {
    // Only the list is limited; computeScoreBreakdown never sees the free set.
    const before = computeScoreBreakdown(checks).finalScore;
    triage(checks, new Set(["x_one"]));
    expect(computeScoreBreakdown(checks).finalScore).toBe(before);
  });

  it("locked findings are counted but their text is absent from what is returned", () => {
    const all = triage(checks, null);
    const limited = triage(checks, new Set([all.actionable[0].checkKey]));
    expect(limited.actionable).toHaveLength(1);
    expect(limited.lockedCount).toBe(all.actionable.length - 1);
    const locked = all.actionable.slice(1).map((x) => x.detail);
    for (const text of locked) expect(JSON.stringify(limited)).not.toContain(text);
  });
});

describe("picker model", () => {
  const checks = [
    { key: "ssl_valid", category: "Security", label: "SSL certificate valid" },
    { key: "csp_header", category: "Security", label: "Content-Security-Policy header" },
    { key: "privacy_policy", category: "Legal & Compliance", label: "Privacy policy" },
  ];
  const dom = (c: string) => (c === "Security" ? "Security & Trust" : "Legal");
  const order = ["Security & Trust", "Legal"];
  const model = (query: string, selected: string[] = [], onlySelected = false) =>
    buildPickerModel(checks, dom, order, { query, selected: new Set(selected), onlySelected });

  it("groups domain → category in domain order with selected/total counts", () => {
    const m = model("", ["ssl_valid"]);
    expect(m.map((d) => d.domain)).toEqual(["Security & Trust", "Legal"]);
    expect(m[0]).toMatchObject({ total: 2, selected: 1 });
    expect(m[0].categories[0]).toMatchObject({ category: "Security", selected: 1 });
  });

  it("search matches label, key or category, all words, any order", () => {
    expect(model("ssl").flatMap((d) => d.categories.flatMap((c) => c.checks.map((k) => k.key)))).toEqual(["ssl_valid"]);
    expect(model("policy legal")[0].domain).toBe("Legal");
    expect(model("header security").flatMap((d) => d.categories.flatMap((c) => c.checks))).toHaveLength(1);
    expect(model("nonsense")).toEqual([]);
  });

  it("'selected only' is the review view", () => {
    const m = model("", ["privacy_policy"], true);
    expect(m).toHaveLength(1);
    expect(m[0].total).toBe(1);
  });
});
