import { describe, it, expect } from "vitest";
import { buildClientFacingSummary, toBestMatchLabel } from "../best-match";
import type { DevSignalScoreBreakdown } from "../scoring";

function breakdown(partial: Partial<DevSignalScoreBreakdown>): DevSignalScoreBreakdown {
  return {
    formulaVersion: "devsignal-score-v1",
    configVersion: "v1",
    pipelineVersion: "devsignal-pipeline-v1",
    finalScore: 0,
    weightedScore: 0,
    cappedByStageId: null,
    cap: null,
    stages: [],
    blockingFailures: [],
    humanReviewRequired: false,
    ...partial,
  };
}

describe("toBestMatchLabel", () => {
  it("maps score bands when clean", () => {
    expect(toBestMatchLabel(breakdown({ finalScore: 90 }))).toBe("BEST_MATCH");
    expect(toBestMatchLabel(breakdown({ finalScore: 72 }))).toBe("STRONG_MATCH");
    expect(toBestMatchLabel(breakdown({ finalScore: 60 }))).toBe("QUALIFIED_MATCH");
    expect(toBestMatchLabel(breakdown({ finalScore: 30 }))).toBe("REVIEW_RECOMMENDED");
  });

  it("blocking failure always reads NOT_RECOMMENDED even at a high score", () => {
    expect(
      toBestMatchLabel(breakdown({ finalScore: 95, blockingFailures: ["identity_verification"] })),
    ).toBe("NOT_RECOMMENDED");
  });

  it("unresolved human review overrides a high provisional score", () => {
    expect(toBestMatchLabel(breakdown({ finalScore: 95, humanReviewRequired: true }))).toBe(
      "REVIEW_RECOMMENDED",
    );
  });
});

describe("buildClientFacingSummary — redaction boundary", () => {
  it("returns only label + strengths + vetted, never numbers", () => {
    const summary = buildClientFacingSummary({
      breakdown: breakdown({ finalScore: 91 }),
      strengths: ["Strong React history", "Clear communicator", "Ships fast", "extra-dropped"],
      promotedToCode: true,
    });
    expect(summary.label).toBe("BEST_MATCH");
    expect(summary.labelDisplay).toBe("Best match");
    expect(summary.vetted).toBe(true);
    expect(summary.strengths).toHaveLength(3); // capped
    // No score-shaped keys leak out.
    expect(Object.keys(summary)).toEqual(["label", "labelDisplay", "strengths", "vetted"]);
    expect(JSON.stringify(summary)).not.toContain("91");
  });
});
