import { describe, it, expect } from "vitest";
import { buildDefaultConfigSnapshot } from "../config";
import { planStages, runStages, summarizeAssessment } from "../orchestrator";
import { createMockRegistry, DevSignalStageRegistry } from "../stages/registry";
import type { DevSignalStageContext } from "../stages/types";

const context: DevSignalStageContext = {
  workspaceId: "ws_1",
  clientId: null,
  candidateId: "cand_1",
  assessmentId: "as_1",
  configSnapshot: buildDefaultConfigSnapshot(),
  actorId: null,
};

describe("planStages", () => {
  it("returns enabled stages in order and excludes score_report", () => {
    const plan = planStages(buildDefaultConfigSnapshot());
    expect(plan).toEqual([
      "application_intake",
      "profile_connections",
      "video_assessment",
      "coding_challenge",
      "online_footprint",
      "identity_verification",
      "leadership_interview",
    ]);
  });

  it("drops disabled stages", () => {
    const config = buildDefaultConfigSnapshot();
    config.stages.video_assessment.enabled = false;
    expect(planStages(config)).not.toContain("video_assessment");
  });
});

describe("runStages", () => {
  it("runs every planned stage via the registry", async () => {
    const config = buildDefaultConfigSnapshot();
    const results = await runStages({
      registry: createMockRegistry(),
      context,
      stageIds: planStages(config),
    });
    expect(results).toHaveLength(7);
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("captures a throwing runner as an ERROR result instead of aborting", async () => {
    const registry = createMockRegistry();
    registry.register({
      stageId: "coding_challenge",
      stageName: "Timed coding challenge",
      stageVersion: "boom-v1",
      async run() {
        throw new Error("sandbox exploded");
      },
    });
    const results = await runStages({
      registry,
      context,
      stageIds: ["application_intake", "coding_challenge", "leadership_interview"],
    });
    expect(results).toHaveLength(3);
    const coding = results.find((r) => r.stageId === "coding_challenge");
    expect(coding?.status).toBe("ERROR");
    expect(coding?.flags[0]?.code).toBe("stage_error");
  });

  it("skips stages with no registered runner", async () => {
    const registry = new DevSignalStageRegistry(); // empty
    const results = await runStages({ registry, context, stageIds: ["application_intake"] });
    expect(results).toHaveLength(0);
  });
});

describe("summarizeAssessment", () => {
  it("aggregates mock stage results into a top score + best-match label", async () => {
    const config = buildDefaultConfigSnapshot();
    const results = await runStages({
      registry: createMockRegistry(),
      context,
      stageIds: planStages(config),
    });
    const summary = summarizeAssessment(config, results);
    expect(summary.breakdown.finalScore).toBe(100);
    expect(summary.label).toBe("BEST_MATCH");
  });
});
