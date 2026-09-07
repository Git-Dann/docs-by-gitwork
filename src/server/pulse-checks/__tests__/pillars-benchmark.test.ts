import { describe, it, expect } from "vitest";
import {
  PILLARS,
  computePillarBreakdown,
  unassignedCategories,
  duplicatedCategories,
} from "../pillars";
import { CATEGORIES } from "../categories";
import { computeScoreBreakdown } from "../score-breakdown";
import { percentileOf, medianOf, benchmarkCaveat } from "../benchmark-math";
import type { PulseScanCheckInput } from "@/types/pulse";

const check = (
  category: string,
  status: PulseScanCheckInput["status"],
  extra: Partial<PulseScanCheckInput> = {},
): PulseScanCheckInput => ({
  category: category as PulseScanCheckInput["category"],
  checkKey: `k${Math.random().toString(36).slice(2)}`,
  label: "x",
  status,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// PILLARS
// ─────────────────────────────────────────────────────────────────────────────

describe("pillar definitions are total and consistent", () => {
  it("publishes weights that sum to exactly 100", () => {
    // The weights are shown to clients. If they do not sum to 100 the published
    // figure is a lie about the model, not a rounding detail.
    expect(PILLARS.reduce((s, p) => s + p.weight, 0)).toBe(100);
  });

  it("assigns every registered category to exactly one pillar", () => {
    // This is the guard that makes the rollup maintainable: add a category in
    // categories.ts and forget it here, and this fails rather than the category
    // silently scoring nowhere.
    expect(unassignedCategories(), "categories with no pillar").toEqual([]);
    expect(duplicatedCategories(), "categories in more than one pillar").toEqual([]);
  });

  it("has a distinct key and a question for each pillar", () => {
    expect(new Set(PILLARS.map((p) => p.key)).size).toBe(PILLARS.length);
    for (const p of PILLARS) expect(p.question.length).toBeGreaterThan(10);
  });
});

describe("pillar scoring mirrors the health score's rules", () => {
  it("scores WARN as half and FAIL as nothing", () => {
    const allPass = computePillarBreakdown([check(CATEGORIES.SECURITY, "PASS")]);
    const allWarn = computePillarBreakdown([check(CATEGORIES.SECURITY, "WARN")]);
    const allFail = computePillarBreakdown([check(CATEGORIES.SECURITY, "FAIL")]);

    expect(allPass.pillars.find((p) => p.key === "security")!.score).toBe(100);
    expect(allWarn.pillars.find((p) => p.key === "security")!.score).toBe(50);
    expect(allFail.pillars.find((p) => p.key === "security")!.score).toBe(0);
  });

  it("excludes SKIPPED but weights LOW-confidence outcomes symmetrically", () => {
    const out = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.SECURITY, "SKIPPED"),
      check(CATEGORIES.SECURITY, "FAIL", { confidence: "LOW" }),
    ]);
    const security = out.pillars.find((p) => p.key === "security")!;
    // The weak FAIL is included at its lower evidence/confidence weight; it is
    // no longer silently dropped, but it also cannot outweigh stronger evidence.
    expect(security.score).toBe(79);
    expect(security.excluded).toBe(1);
  });

  it("still counts a LOW-confidence PASS", () => {
    // Confidence changes weight, not whether a favourable outcome gets special treatment.
    const out = computePillarBreakdown([check(CATEGORIES.SECURITY, "PASS", { confidence: "LOW" })]);
    expect(out.pillars.find((p) => p.key === "security")!.score).toBe(100);
  });

  it("agrees with the headline score when one pillar carries everything", () => {
    // If the two ever disagree about the same checks, one of them is wrong — and
    // a client will find the discrepancy before we do.
    const checks = [
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.SECURITY, "WARN"),
      check(CATEGORIES.SECRETS_KEYS, "FAIL"),
    ];
    const breakdown = computeScoreBreakdown(checks);
    const pillars = computePillarBreakdown(checks);
    expect(pillars.overall).toBe(breakdown.rawScore);
  });
});

describe("weight redistribution — a pillar we could not assess is not a zero", () => {
  it("drops a pillar with nothing applicable and names it", () => {
    const out = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.SEO, "SKIPPED"),
    ]);
    const experience = out.pillars.find((p) => p.key === "experience")!;
    expect(experience.score).toBeNull();
    expect(out.dropped).toContain("experience");
    // Silence here would be indistinguishable from "assessed and fine".
    expect(experience.droppedReason).toMatch(/redistributed/i);
  });

  it("does not penalise the overall score for a dropped pillar", () => {
    // An iOS app with no SEO checks must not score worse than a web app with
    // perfect SEO — the points move, they do not vanish.
    const mobileish = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.CODE_QUALITY, "PASS"),
      check(CATEGORIES.SEO, "SKIPPED"),
    ]);
    const webish = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.CODE_QUALITY, "PASS"),
      check(CATEGORIES.SEO, "PASS"),
    ]);
    expect(mobileish.overall).toBe(100);
    expect(webish.overall).toBe(100);
  });

  it("redistributes weight so applied pillars sum to ~100", () => {
    const out = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.CODE_QUALITY, "PASS"),
    ]);
    const applied = out.pillars.filter((p) => p.score !== null);
    const total = applied.reduce((s, p) => s + p.effectiveWeight, 0);
    expect(Math.round(total)).toBe(100);
    // Security is 30 and code is 15, so security should take two thirds.
    expect(applied.find((p) => p.key === "security")!.effectiveWeight).toBeCloseTo(66.7, 0);
  });

  it("returns a null overall when nothing at all was scoreable", () => {
    const out = computePillarBreakdown([check(CATEGORIES.SECURITY, "SKIPPED")]);
    expect(out.overall).toBeNull();
    expect(out.dropped.length).toBe(PILLARS.length);
  });

  it("weights security above experience for the same check counts", () => {
    // The whole point of publishing weights: a failing security check must move
    // the number more than a failing SEO check.
    const badSecurity = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "FAIL"),
      check(CATEGORIES.SEO, "PASS"),
    ]);
    const badSeo = computePillarBreakdown([
      check(CATEGORIES.SECURITY, "PASS"),
      check(CATEGORIES.SEO, "FAIL"),
    ]);
    expect(badSecurity.overall!).toBeLessThan(badSeo.overall!);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK
// ─────────────────────────────────────────────────────────────────────────────

describe("percentile maths", () => {
  it("reads as 'at least as good as this share of the corpus'", () => {
    expect(percentileOf(50, [10, 20, 30, 40, 50])).toBe(100);
    expect(percentileOf(30, [10, 20, 30, 40, 50])).toBe(60);
    expect(percentileOf(5, [10, 20, 30, 40, 50])).toBe(0);
  });

  it("puts a score equal to the whole corpus at the top, not the bottom", () => {
    // The ≤ convention, stated as a test because the opposite is a plausible
    // reading and would invert the headline sentence.
    expect(percentileOf(70, [70, 70, 70])).toBe(100);
  });

  it("returns 0 rather than dividing by zero on an empty corpus", () => {
    expect(percentileOf(50, [])).toBe(0);
    expect(medianOf([])).toBe(0);
  });

  it("computes a median for odd and even corpora", () => {
    expect(medianOf([10, 20, 30])).toBe(20);
    expect(medianOf([10, 20, 30, 40])).toBe(25);
  });
});

describe("the caveat travels with the figure", () => {
  it("names the corpus size and what it was", () => {
    const c = benchmarkCaveat(120, "WEB_APP", false);
    expect(c).toContain("120");
    expect(c).toMatch(/web app/i);
    // It must not let the reader mistake our scan history for an industry survey.
    expect(c).toMatch(/not an industry survey/i);
  });

  it("says so when the platform segment was widened", () => {
    expect(benchmarkCaveat(50, "all", true)).toMatch(/not yet enough scans of this platform/i);
    expect(benchmarkCaveat(50, "all", false)).not.toMatch(/not yet enough scans of this platform/i);
  });

  it("names the workspace corpus, not an industry one", () => {
    // The claim being made is "compared to the others we have looked at". Letting
    // it read as an industry benchmark would be a straightforwardly false claim
    // on a client report.
    expect(benchmarkCaveat(40, "all", false)).toMatch(/scanned in this workspace/i);
  });
});
