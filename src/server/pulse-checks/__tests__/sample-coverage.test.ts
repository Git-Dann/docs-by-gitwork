import { describe, expect, it } from "vitest";
import { sampleCoverage } from "../native-mobile";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// `RepoSnapshot.truncated` was SET by the tree reader and READ BY NOBODY, while
// its own docstring claimed "findings stay best-effort when true".
//
// Inert would have been bad enough. It was worse than inert: every family
// computed coverage as `read / paths-matching-a-source-extension`, and on a
// truncated tree `paths` is short — so the denominator shrinks and coverage
// goes UP. A repository we saw LESS of reported as one we saw MORE of.
//
// That is backwards in the worst possible direction. Thin coverage is the
// mechanism that downgrades an absence finding to LOW confidence and drops it
// out of the score, so truncation was PROMOTING unfounded "no X anywhere"
// findings into scored failures — on exactly the largest repositories, which
// are the ones a truncated tree happens to.
// ─────────────────────────────────────────────────────────────────────────────

describe("sampleCoverage", () => {
  it("reports the sampled fraction on a complete tree", () => {
    expect(sampleCoverage(30, 100, false)).toBeCloseTo(0.3);
    expect(sampleCoverage(100, 100, false)).toBe(1);
  });

  it("reports 0 on a truncated tree, however much was read", () => {
    // Not "a bit lower" — there is no honest figure, because the denominator is
    // unknown rather than merely large.
    expect(sampleCoverage(80, 100, true)).toBe(0);
    expect(sampleCoverage(1000, 1000, true)).toBe(0);
  });

  it("never exceeds 1, and treats an empty project as no coverage", () => {
    expect(sampleCoverage(50, 10, false)).toBe(1);
    expect(sampleCoverage(0, 0, false)).toBe(0);
  });

  it("is strictly lower on a truncated tree than on the same complete one", () => {
    // The property that was inverted. Reading the same files off a tree we know
    // to be incomplete can never buy MORE confidence than reading them off a
    // complete one.
    for (const [read, total] of [[10, 100], [50, 100], [99, 100]] as const) {
      expect(sampleCoverage(read, total, true)).toBeLessThan(sampleCoverage(read, total, false));
    }
  });
});

describe("a truncated tree makes absence findings inconclusive", () => {
  const files = new Map([
    ["package.json", '{"dependencies":{"next":"15.0.0"}}'],
    ["src/index.ts", "export const x = 1;"],
  ]);
  const paths = ["package.json", "src/index.ts"];

  const run = (truncated: boolean) =>
    evaluateWebSourceChecks({ owner: "o", repo: "r", paths, files, truncated, accessible: true } as RepoSnapshot);

  it("marks them LOW confidence and says why", () => {
    const truncated = run(true).filter((c) => c.confidence === "LOW");
    expect(truncated.length).toBeGreaterThan(0);
    expect(
      truncated[0].detail,
      "the reader is told the finding is inconclusive rather than a failure",
    ).toMatch(/inconclusive rather than a failure/);
  });

  it("keeps every absence finding out of the confident tier", () => {
    // The whole point: on a truncated tree NOTHING may claim "not present
    // anywhere", because we were never shown the whole tree.
    const complete = run(false);
    const truncated = run(true);
    const confidentIn = (checks: { confidence?: string }[]) =>
      checks.filter((c) => c.confidence === "HIGH").length;
    expect(confidentIn(complete), "the control — a complete tree does support confident absences").toBeGreaterThan(0);
    expect(confidentIn(truncated)).toBeLessThan(confidentIn(complete));
  });
});
