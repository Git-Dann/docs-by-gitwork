import { describe, it, expect } from "vitest";
import { buildDefaultConfigSnapshot, totalEnabledWeight } from "../config";
import { computeScore, rawScoreFromSubScores, type ScoringStageInput } from "../scoring";
import { DEV_SIGNAL_STAGE_IDS } from "../stages/types";
import type { DevSignalStageStatus } from "@prisma/client";

/** Build a full set of stage inputs at a single status (score_report omitted). */
function allStages(status: DevSignalStageStatus): ScoringStageInput[] {
  return DEV_SIGNAL_STAGE_IDS.filter((id) => id !== "score_report").map((id) => ({
    stageId: id,
    status,
  }));
}

describe("rawScoreFromSubScores", () => {
  it("normalises to 0–100 against max", () => {
    expect(rawScoreFromSubScores([{ key: "a", label: "A", score: 8, maxScore: 10 }])).toBe(80);
    expect(
      rawScoreFromSubScores([
        { key: "a", label: "A", score: 8, maxScore: 10 },
        { key: "b", label: "B", score: 0, maxScore: 10 },
      ]),
    ).toBe(40);
  });
  it("handles empty / zero-max safely", () => {
    expect(rawScoreFromSubScores([])).toBe(0);
    expect(rawScoreFromSubScores([{ key: "a", label: "A", score: 5, maxScore: 0 }])).toBe(0);
  });
  it("clamps out-of-range sub-scores", () => {
    expect(rawScoreFromSubScores([{ key: "a", label: "A", score: 999, maxScore: 10 }])).toBe(100);
  });
});

describe("computeScore — default config", () => {
  const config = buildDefaultConfigSnapshot();

  it("default enabled weights total 100", () => {
    expect(totalEnabledWeight(config)).toBe(100);
  });

  it("all stages PASS → 100, no human review", () => {
    const b = computeScore(config, allStages("PASS"));
    expect(b.finalScore).toBe(100);
    expect(b.humanReviewRequired).toBe(false);
    expect(b.cappedByStageId).toBeNull();
    expect(b.formulaVersion).toBe("devsignal-score-v1");
    expect(b.configVersion).toBe(config.version);
  });

  it("all stages FAIL → 0, identity (blocking) caps + forces review", () => {
    const b = computeScore(config, allStages("FAIL"));
    expect(b.finalScore).toBe(0);
    expect(b.blockingFailures).toContain("identity_verification");
    expect(b.humanReviewRequired).toBe(true);
  });

  it("weights are respected — only coding_challenge fails", () => {
    const inputs = allStages("PASS").map((s) =>
      s.stageId === "coding_challenge" ? { ...s, status: "FAIL" as DevSignalStageStatus } : s,
    );
    const b = computeScore(config, inputs);
    // coding_challenge = 25 weight at raw 0 → 100 - 25 = 75
    expect(b.finalScore).toBe(75);
    expect(b.humanReviewRequired).toBe(false);
  });
});

describe("computeScore — missing stages", () => {
  it("redistribute drops a pending stage from the denominator", () => {
    const config = buildDefaultConfigSnapshot(); // missingStageRule = redistribute
    const inputs = allStages("PASS").map((s) =>
      s.stageId === "coding_challenge" ? { ...s, status: "PENDING" as DevSignalStageStatus } : s,
    );
    const b = computeScore(config, inputs);
    expect(b.finalScore).toBe(100); // remaining stages all pass
    expect(b.humanReviewRequired).toBe(true); // pending forces review
    const coding = b.stages.find((s) => s.stageId === "coding_challenge");
    expect(coding?.effectiveWeight).toBe(0);
  });

  it("zero rule counts a pending stage as 0 at full weight", () => {
    const config = buildDefaultConfigSnapshot();
    config.missingStageRule = "zero";
    const inputs = allStages("PASS").map((s) =>
      s.stageId === "coding_challenge" ? { ...s, status: "PENDING" as DevSignalStageStatus } : s,
    );
    const b = computeScore(config, inputs);
    expect(b.finalScore).toBe(75); // 100 - 25 (coding contributes 0)
  });

  it("a stage with no input at all forces human review", () => {
    const config = buildDefaultConfigSnapshot();
    const inputs = allStages("PASS").filter((s) => s.stageId !== "leadership_interview");
    const b = computeScore(config, inputs);
    expect(b.humanReviewRequired).toBe(true);
  });
});

describe("computeScore — blocking + flags", () => {
  it("a block-severity flag forces human review without a cap", () => {
    const config = buildDefaultConfigSnapshot();
    const inputs = allStages("PASS").map((s) =>
      s.stageId === "video_assessment"
        ? { ...s, flags: [{ severity: "block" as const, code: "x", message: "m" }] }
        : s,
    );
    const b = computeScore(config, inputs);
    expect(b.humanReviewRequired).toBe(true);
    expect(b.cappedByStageId).toBeNull();
  });

  it("minScore threshold turns a low PASS into a blocking failure", () => {
    const config = buildDefaultConfigSnapshot();
    config.stages.identity_verification.minScore = 90;
    const inputs: ScoringStageInput[] = allStages("PASS").map((s) =>
      s.stageId === "identity_verification"
        ? { ...s, subScores: [{ key: "k", label: "l", score: 5, maxScore: 10 }] } // 50 < 90
        : s,
    );
    const b = computeScore(config, inputs);
    expect(b.blockingFailures).toContain("identity_verification");
    expect(b.finalScore).toBeLessThanOrEqual(40);
  });
});
