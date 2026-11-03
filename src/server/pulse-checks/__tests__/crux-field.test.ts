import { describe, expect, it } from "vitest";
import { evaluateCruxField, type CruxExperience } from "../crux-field";

// Shape of a real PSI v5 response's loadingExperience (values illustrative).
const URL_EXP: CruxExperience = {
  overall_category: "AVERAGE",
  metrics: {
    LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100, category: "FAST" },
    INTERACTION_TO_NEXT_PAINT: { percentile: 312, category: "AVERAGE" },
    CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31, category: "SLOW" },
    FIRST_CONTENTFUL_PAINT_MS: { percentile: 1700, category: "FAST" },
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 1900, category: "SLOW" },
  },
};
const byKey = (rows: ReturnType<typeof evaluateCruxField>) => Object.fromEntries(rows.map((r) => [r.checkKey, r]));

describe("evaluateCruxField", () => {
  it("judges each metric at p75 against Google's thresholds", () => {
    const r = byKey(evaluateCruxField(URL_EXP, undefined));
    expect(r.crux_lcp.status).toBe("PASS");
    expect(r.crux_inp.status).toBe("WARN");
    // CLS arrives ×100: 31 means 0.31, which is poor.
    expect(r.crux_cls.status).toBe("FAIL");
    expect(r.crux_cls.detail).toContain("0.31");
    expect(r.crux_fcp.status).toBe("PASS");
    expect(r.crux_ttfb.status).toBe("FAIL");
    expect(r.crux_inp.detail).toContain("this page");
    expect(r.crux_inp.confidence).toBe("HIGH");
  });

  it("boundaries are inclusive of good", () => {
    const r = byKey(evaluateCruxField({ metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 200 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 10 } } }, undefined));
    expect(r.crux_inp.status).toBe("PASS");
    expect(r.crux_cls.status).toBe("PASS");
  });

  it("falls back to the whole site, and says so", () => {
    const r = byKey(evaluateCruxField(undefined, { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 640 } } }));
    expect(r.crux_inp.status).toBe("FAIL");
    expect(r.crux_inp.detail).toContain("whole site");
    expect(r.crux_inp.confidence).toBe("MEDIUM");
    // PSI's own origin_fallback flag means the URL block is really origin data.
    const f = byKey(evaluateCruxField({ origin_fallback: true, metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 150 } } }, undefined));
    expect(f.crux_inp.detail).toContain("whole site");
  });

  it("a site with no Chrome field data gets no row, never a guess", () => {
    expect(evaluateCruxField(undefined, undefined)).toEqual([]);
    expect(evaluateCruxField({ overall_category: undefined, metrics: {} }, { metrics: {} })).toEqual([]);
  });

  it("agrees with Google's own category on a real PSI response (google/site-kit-wp fixture)", () => {
    // pagespeed--mobile.json from Google's Site Kit plugin: percentile + Google's category.
    const real: Record<string, [number, string]> = {
      CUMULATIVE_LAYOUT_SHIFT_SCORE: [30, "SLOW"],
      INTERACTION_TO_NEXT_PAINT: [295, "AVERAGE"],
      EXPERIMENTAL_TIME_TO_FIRST_BYTE: [842, "AVERAGE"],
      FIRST_CONTENTFUL_PAINT_MS: [2032, "AVERAGE"],
      LARGEST_CONTENTFUL_PAINT_MS: [2600, "AVERAGE"],
    };
    const metrics = Object.fromEntries(Object.entries(real).map(([k, [percentile, category]]) => [k, { percentile, category }]));
    const r = byKey(evaluateCruxField({ overall_category: "AVERAGE", metrics }, undefined));
    const expected = { FAST: "PASS", AVERAGE: "WARN", SLOW: "FAIL" } as const;
    const keyFor: Record<string, string> = {
      CUMULATIVE_LAYOUT_SHIFT_SCORE: "crux_cls", INTERACTION_TO_NEXT_PAINT: "crux_inp", EXPERIMENTAL_TIME_TO_FIRST_BYTE: "crux_ttfb",
      FIRST_CONTENTFUL_PAINT_MS: "crux_fcp", LARGEST_CONTENTFUL_PAINT_MS: "crux_lcp",
    };
    for (const [metric, [, category]] of Object.entries(real)) {
      expect(r[keyFor[metric]].status, metric).toBe(expected[category as keyof typeof expected]);
    }
  });

  it("reads the renamed TTFB metric too", () => {
    expect(byKey(evaluateCruxField({ metrics: { TIME_TO_FIRST_BYTE: { percentile: 400 } } }, undefined)).crux_ttfb.status).toBe("PASS");
  });
});
