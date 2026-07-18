import { describe, it, expect } from "vitest";
import {
  buildDefaultConfigRow,
  buildDefaultConfigSnapshot,
  PIPELINE_VERSION,
  totalEnabledWeight,
} from "../config";
import { DEV_SIGNAL_STAGE_IDS } from "../stages/types";

describe("default pipeline config", () => {
  it("snapshot carries every stage + the pipeline version", () => {
    const snap = buildDefaultConfigSnapshot();
    expect(snap.pipelineVersion).toBe(PIPELINE_VERSION);
    for (const id of DEV_SIGNAL_STAGE_IDS) {
      expect(snap.stages[id]).toBeDefined();
    }
  });

  it("enabled predictive weights sum to 100 and score_report is 0", () => {
    const snap = buildDefaultConfigSnapshot();
    expect(totalEnabledWeight(snap)).toBe(100);
    expect(snap.stages.score_report.weight).toBe(0);
  });

  it("only identity is blocking by default", () => {
    const snap = buildDefaultConfigSnapshot();
    const blocking = DEV_SIGNAL_STAGE_IDS.filter((id) => snap.stages[id].blocking);
    expect(blocking).toEqual(["identity_verification"]);
  });

  it("returned snapshot is a fresh clone (no shared mutation)", () => {
    const a = buildDefaultConfigSnapshot();
    a.stages.coding_challenge.weight = 999;
    const b = buildDefaultConfigSnapshot();
    expect(b.stages.coding_challenge.weight).toBe(25);
  });

  it("db config row mirrors the snapshot", () => {
    const row = buildDefaultConfigRow();
    expect(row.isDefault).toBe(true);
    expect((row.stageWeights as Record<string, number>).coding_challenge).toBe(25);
    expect(row.stageOrder[0]).toBe("application_intake");
    expect(row.enabledStages).toContain("score_report");
  });
});
