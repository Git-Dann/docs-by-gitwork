import { describe, expect, it } from "vitest";
import {
  computeCalibration,
  deriveCriterion,
  pearson,
  type CalibrationSample,
} from "@/lib/devsignal/calibration";

describe("deriveCriterion", () => {
  it("maps client rating 1–5 onto 0–100", () => {
    expect(deriveCriterion({ clientRating: 1 })).toBe(0);
    expect(deriveCriterion({ clientRating: 3 })).toBe(50);
    expect(deriveCriterion({ clientRating: 5 })).toBe(100);
  });

  it("prioritises rating over other signals", () => {
    expect(deriveCriterion({ clientRating: 5, churned: true })).toBe(100);
  });

  it("falls back to churn / retention / tenure", () => {
    expect(deriveCriterion({ churned: true })).toBe(15);
    expect(deriveCriterion({ retained: true })).toBe(80);
    expect(deriveCriterion({ tenureDays: 365 })).toBe(100);
    expect(deriveCriterion({ tenureDays: 182 })).toBe(50);
  });

  it("returns null with no signal", () => {
    expect(deriveCriterion({})).toBeNull();
  });
});

describe("pearson", () => {
  it("returns 1 for a perfect positive relationship", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
  });

  it("returns -1 for a perfect negative relationship", () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
  });

  it("returns null below the minimum sample size", () => {
    expect(pearson([1, 2], [2, 4])).toBeNull();
  });

  it("returns null when a series has zero variance", () => {
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
});

describe("computeCalibration", () => {
  const stages = ["coding_challenge", "leadership_interview"];

  function sample(final: number, cc: number, li: number, criterion: number): CalibrationSample {
    return { finalScore: final, stageScores: { coding_challenge: cc, leadership_interview: li }, criterion };
  }

  it("is insufficient below the provisional threshold", () => {
    const report = computeCalibration([sample(80, 80, 80, 90)], stages);
    expect(report.status).toBe("insufficient");
    expect(report.suggestedWeights).toBeNull();
    expect(report.caveats.some((c) => c.includes("Range restriction"))).toBe(true);
  });

  it("computes validity + suggested weights once there is enough data", () => {
    // 12 samples: coding_challenge tracks the criterion strongly; interview is flat noise.
    const rows: CalibrationSample[] = [];
    for (let i = 0; i < 12; i++) {
      const c = 10 + i * 7; // rising
      rows.push(sample(c, c, 50, c)); // criterion == coding score → r≈1 for coding
    }
    const report = computeCalibration(rows, stages);
    expect(report.status).toBe("provisional");
    expect(report.n).toBe(12);
    expect(report.overallValidity).toBeGreaterThan(0.9);
    const coding = report.stages.find((s) => s.stageId === "coding_challenge")!;
    expect(coding.r).toBeGreaterThan(0.9);
    expect(coding.benchmark).toBe(0.33);
    // Coding validity dominates → it should get most of the suggested weight.
    expect(report.suggestedWeights!.coding_challenge).toBeGreaterThan(report.suggestedWeights!.leadership_interview);
    const sum = Object.values(report.suggestedWeights!).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("marks calibrated at 30+ outcomes", () => {
    const rows = Array.from({ length: 30 }, (_, i) => sample(40 + i, 40 + i, 60, 40 + i));
    expect(computeCalibration(rows, stages).status).toBe("calibrated");
  });
});
