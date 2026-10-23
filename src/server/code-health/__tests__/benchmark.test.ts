import { describe, expect, it } from "vitest";
import data from "../benchmarks.json";
import { BENCHMARK_REFERENCES, compareToBenchmarks, debtPerKloc, median, peerPercentile, type BenchmarkReference } from "../benchmark";
import { LANGUAGE_RULES } from "../languages";
import type { CodeHealthReport, CodeLanguage, DebtKind } from "@/types/code-health";

const ZERO_DEBT: Record<DebtKind, number> = {
  complex_function: 0, long_function: 0, long_parameter_list: 0, deep_nesting: 0, large_class: 0, large_file: 0,
};

function report(o: {
  loc?: number; score?: number; complexityPerKloc?: number; complexLocShare?: number; averageComplexity?: number;
  debt?: number; language?: CodeLanguage;
} = {}): CodeHealthReport {
  const loc = o.loc ?? 10_000;
  return {
    repo: "acme/app", branch: "main", commit: null, measuredAt: "2026-10-23T00:00:00.000Z",
    score: o.score ?? 80, band: "good",
    totals: {
      files: 10, loc, testLoc: 0, functions: 100, classes: 0,
      complexityPerKloc: o.complexityPerKloc ?? 150, complexLocShare: o.complexLocShare ?? 0.1, averageComplexity: o.averageComplexity ?? 2,
    },
    languages: loc ? [{ language: o.language ?? "typescript", files: 10, loc }] : [],
    debt: [],
    debtCounts: { ...ZERO_DEBT, complex_function: o.debt ?? 0 },
    coverage: {
      analysedFiles: 10, skippedLarge: 0, skippedMinified: 0, skippedGenerated: 0,
      unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 0, truncated: false,
    },
  };
}

const ref = (name: string, language: CodeLanguage, m: Partial<BenchmarkReference["metrics"]>): BenchmarkReference => ({
  name, repo: `x/${name}`, ref: "v1.0.0", commit: "a".repeat(40), language,
  metrics: {
    score: 80, loc: 5000, files: 50, complexityPerKloc: 150, complexLocShare: 0.1,
    averageComplexity: 2, debtPerKloc: 5, effortDaysPerKloc: 2, ...m,
  },
});

describe("peerPercentile", () => {
  const peers = [10, 20, 30, 40];

  it("is 100 for the best and 0 for the worst, whichever direction is better", () => {
    expect(peerPercentile(5, peers, true)).toBe(100);
    expect(peerPercentile(50, peers, true)).toBe(0);
    expect(peerPercentile(50, peers, false)).toBe(100);
    expect(peerPercentile(5, peers, false)).toBe(0);
  });

  it("inverts for lower-is-better: the same value reads oppositely", () => {
    expect(peerPercentile(15, peers, true)).toBe(75); // beats 20, 30, 40
    expect(peerPercentile(15, peers, false)).toBe(25); // beats 10
  });

  it("counts ties as half", () => {
    expect(peerPercentile(20, peers, true)).toBe(63); // beats 30, 40; level with 20 → 2.5/4
    expect(peerPercentile(20, [20, 20, 20], true)).toBe(50);
  });

  it("handles a single reference", () => {
    expect(peerPercentile(1, [2], true)).toBe(100);
    expect(peerPercentile(3, [2], true)).toBe(0);
    expect(peerPercentile(2, [2], true)).toBe(50);
  });

  it("is null with no peers rather than a made-up position", () => {
    expect(peerPercentile(1, [], true)).toBeNull();
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("compareToBenchmarks", () => {
  const refs = [
    ref("a", "go", { complexityPerKloc: 100, score: 90 }),
    ref("b", "go", { complexityPerKloc: 200, score: 70 }),
    ref("c", "python", { complexityPerKloc: 300, score: 60 }),
  ];

  it("returns null for a report that measured no production code", () => {
    expect(compareToBenchmarks(report({ loc: 0 }), { references: refs })).toBeNull();
  });

  it("reads lower-is-better metrics the right way round", () => {
    const c = compareToBenchmarks(report({ complexityPerKloc: 150, score: 95 }), { references: refs })!;
    expect(c.metrics.complexityPerKloc.percentile).toBe(67);
    expect(c.metrics.complexityPerKloc.betterThan).toBe(2);
    expect(c.metrics.complexityPerKloc.reading).toBe("Less complex per line than 2 of 3 reference frameworks.");
    // Score is higher-is-better: 95 beats all three.
    expect(c.metrics.score.percentile).toBe(100);
    expect(c.metrics.score.reading).toBe("Scores higher than all 3 reference frameworks.");
  });

  it("reports the distribution", () => {
    const c = compareToBenchmarks(report(), { references: refs })!;
    expect(c.metrics.complexityPerKloc.references).toMatchObject({ count: 3, min: 100, median: 200, max: 300 });
  });

  it("gives a same-language median only with at least two same-language references", () => {
    const go = compareToBenchmarks(report({ language: "go" }), { references: refs })!;
    expect(go.metrics.complexityPerKloc.references.sameLanguageMedian).toBe(150);
    expect(go.metrics.complexityPerKloc.references.sameLanguageCount).toBe(2);
    const py = compareToBenchmarks(report({ language: "python" }), { references: refs })!;
    expect(py.metrics.complexityPerKloc.references.sameLanguageMedian).toBeNull();
    expect(py.metrics.complexityPerKloc.references.sameLanguageCount).toBe(1);
  });

  it("lets the caller name the language", () => {
    const c = compareToBenchmarks(report({ language: "python" }), { references: refs, language: "go" })!;
    expect(c.language).toBe("go");
    expect(c.metrics.score.references.sameLanguageMedian).toBe(80);
  });

  it("says when the report is worse than every reference, and when it ties", () => {
    const worst = compareToBenchmarks(report({ complexityPerKloc: 999 }), { references: refs })!;
    expect(worst.metrics.complexityPerKloc.reading).toBe("Less complex per line than none of the 3 reference frameworks.");
    const tie = compareToBenchmarks(report({ complexityPerKloc: 200 }), { references: refs })!;
    expect(tie.metrics.complexityPerKloc.reading).toBe("Less complex per line than 1 of 3 reference frameworks, level with 1.");
  });

  it("derives debt per KLOC from the full debt counts", () => {
    expect(debtPerKloc(report({ loc: 4000, debt: 10 }))).toBe(2.5);
    const c = compareToBenchmarks(report({ loc: 4000, debt: 10 }), { references: refs })!;
    expect(c.metrics.debtPerKloc.value).toBe(2.5);
    expect(c.metrics.debtPerKloc.percentile).toBe(100); // every ref is at 5
  });

  it("uses the committed references by default", () => {
    const c = compareToBenchmarks(report())!;
    expect(c.referenceCount).toBe(BENCHMARK_REFERENCES.length);
  });
});

describe("benchmarks.json", () => {
  const supported = new Set(Object.keys(LANGUAGE_RULES));

  it("holds enough references to mean something", () => {
    expect(data.references.length).toBeGreaterThanOrEqual(10);
    expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.measureVersion).toBeTruthy();
  });

  // A reference that is not pinned to an exact commit cannot be reproduced, and a reading
  // against it cannot be checked. This keeps every one pinned.
  it.each(data.references.map((r) => [r.name, r] as const))("%s is pinned, sized and in a supported language", (_n, r) => {
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.ref).toBeTruthy();
    expect(r.ref).not.toBe("(default branch)");
    expect(r.metrics.loc).toBeGreaterThan(1000);
    expect(supported.has(r.language)).toBe(true);
    for (const k of ["score", "complexityPerKloc", "complexLocShare", "averageComplexity", "debtPerKloc"] as const) {
      expect(Number.isFinite(r.metrics[k])).toBe(true);
    }
  });
});
