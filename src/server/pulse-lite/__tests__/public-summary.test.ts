import { describe, expect, it } from "vitest";
import { summarise } from "../public-scan";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// The public embed widget is aimed at vibe-coded sites, which are overwhelmingly
// client-rendered — so it is the surface where "we could not read the page" is the
// NORMAL outcome, not an edge case. These tests pin that an unresolved control is
// counted and named, never quietly dropped into no bucket at all.
// ─────────────────────────────────────────────────────────────────────────────

function check(
  status: PulseScanCheckInput["status"],
  category: PulseScanCheckInput["category"] = "SEO",
): PulseScanCheckInput {
  return { category, checkKey: `${category}_${status}_${Math.random()}`, label: "l", status };
}

describe("summarise", () => {
  it("counts an unresolved control instead of dropping it", () => {
    const out = summarise([
      check("PASS"),
      check("FAIL"),
      check("INCONCLUSIVE"),
      check("INCONCLUSIVE"),
      check("ERROR"),
    ]);
    expect(out.pass).toBe(1);
    expect(out.fail).toBe(1);
    expect(out.inconclusive).toBe(3);
  });

  it("never lets an unresolved control count as a pass", () => {
    const out = summarise([check("INCONCLUSIVE"), check("NOT_TESTED"), check("EVIDENCE_REQUIRED")]);
    expect(out.pass).toBe(0);
    expect(out.warn).toBe(0);
    expect(out.fail).toBe(0);
    expect(out.inconclusive).toBe(3);
  });

  it("excludes inapplicable controls entirely — there is nothing to report", () => {
    const out = summarise([check("SKIPPED"), check("NOT_APPLICABLE")]);
    expect(out.categories).toEqual([]);
    expect(out.pass + out.warn + out.fail + out.inconclusive).toBe(0);
  });

  it("does not create an all-zero category row", () => {
    // The old code excluded only SKIPPED, so a NOT_APPLICABLE check produced a category
    // that reported 0 pass / 0 warn / 0 fail — which the tile then rendered as 100%.
    for (const cat of summarise([check("SKIPPED"), check("PASS"), check("INCONCLUSIVE")]).categories) {
      expect(cat.pass + cat.warn + cat.fail + cat.inconclusive).toBeGreaterThan(0);
    }
  });

  it("keeps a category that only ever went inconclusive, so it can be shown as unassessed", () => {
    const out = summarise([check("INCONCLUSIVE", "Accessibility")]);
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]).toMatchObject({
      category: "Accessibility", pass: 0, warn: 0, fail: 0, inconclusive: 1,
    });
  });

  it("keeps the per-category counts consistent with the totals", () => {
    const checks = [
      check("PASS", "SEO"), check("WARN", "SEO"), check("INCONCLUSIVE", "SEO"),
      check("FAIL", "Security"), check("INCONCLUSIVE", "Security"),
    ];
    const out = summarise(checks);
    const sum = (key: "pass" | "warn" | "fail" | "inconclusive") =>
      out.categories.reduce((total, cat) => total + cat[key], 0);
    expect(sum("pass")).toBe(out.pass);
    expect(sum("warn")).toBe(out.warn);
    expect(sum("fail")).toBe(out.fail);
    expect(sum("inconclusive")).toBe(out.inconclusive);
  });
});
