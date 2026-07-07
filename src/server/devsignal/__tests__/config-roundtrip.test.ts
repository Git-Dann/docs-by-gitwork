import { describe, it, expect } from "vitest";
import { buildDefaultConfigRow, configRowToSnapshot, totalEnabledWeight } from "../config";

describe("configRowToSnapshot", () => {
  it("round-trips a stored row back into a usable snapshot", () => {
    const row = buildDefaultConfigRow();
    const snap = configRowToSnapshot(row);
    expect(totalEnabledWeight(snap)).toBe(100);
    expect(snap.stages.coding_challenge.weight).toBe(30);
    expect(snap.stages.identity_verification.blocking).toBe(true);
    expect(snap.stages.application_intake.order).toBe(1);
    expect(snap.stages.score_report.weight).toBe(0);
  });

  it("defaults unknown / missing fields safely", () => {
    const snap = configRowToSnapshot({
      name: "Sparse",
      version: "v9",
      enabledStages: ["coding_challenge"],
      stageOrder: ["coding_challenge"],
      stageWeights: { coding_challenge: 100 },
    });
    expect(snap.stages.coding_challenge.enabled).toBe(true);
    expect(snap.stages.coding_challenge.weight).toBe(100);
    // Unlisted stage → disabled, weight 0, non-blocking, order pushed last.
    expect(snap.stages.video_assessment.enabled).toBe(false);
    expect(snap.stages.video_assessment.weight).toBe(0);
    expect(snap.stages.video_assessment.order).toBe(999);
  });
});
