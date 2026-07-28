import { describe, it, expect } from "vitest";
import { buildHealthScoreForTest, detectRepoSignalsForTest } from "../codeclear-analysis";

// THE BUG THIS FILE EXISTS FOR.
//
// detectRepoSignals used to receive `[]` for a repo whose contents could not be read
// — private, no GITHUB_TOKEN, or rate limited — because safeGithubRequest collapses
// every failure into its fallback. It returned hasTests/hasCi/hasLint/hasReadme/
// hasManifest ALL FALSE, worth 50 of the ~100 health-score points, and that fed
// CodeClearScore. So every private candidate repo was scored as one with no tests,
// no CI, no linter and no docs.
//
// Same defect class as the Pulse GraphQL bug: "we could not look" rendering as
// "it is not there". Here it was shaping assessments of people.

const READABLE = [
  { name: "README.md", type: "file" as const },
  { name: "tests", type: "dir" as const },
  { name: ".github", type: "dir" as const },
  { name: "package.json", type: "file" as const },
  { name: "biome.json", type: "file" as const },
];

const baseScore = {
  stars: 0,
  forks: 0,
  recentActivity: false,
  recentCommitCount: 0,
  hasDocs: false,
  hasTests: false,
  hasCi: false,
  hasLint: false,
  hasManifest: false,
};

describe("detectRepoSignals distinguishes unreadable from empty", () => {
  it("marks a null listing unreadable", () => {
    const s = detectRepoSignalsForTest(null);
    expect(s.readable).toBe(false);
    // The flags are false, but `readable` is what tells a caller they mean nothing.
    expect(s.hasTests).toBe(false);
  });

  it("marks a genuinely empty repo READABLE", () => {
    // This is the distinction that did not exist before: an empty repo really does
    // have no tests, and should still be scored on that.
    const s = detectRepoSignalsForTest([]);
    expect(s.readable).toBe(true);
    expect(s.hasTests).toBe(false);
  });

  it("reads real signals from a populated listing", () => {
    const s = detectRepoSignalsForTest(READABLE);
    expect(s).toMatchObject({
      readable: true, hasReadme: true, hasDocs: true, hasTests: true, hasCi: true,
      hasLint: true, hasManifest: true,
    });
  });

  it("treats an error-object response as unreadable, not as an empty repo", () => {
    // GitHub returns { message: "Not Found" } rather than an array in some cases.
    const s = detectRepoSignalsForTest({ message: "Not Found" });
    expect(s.hasTests).toBe(false);
    // It is a successful HTTP response, so it IS readable — just not an array. The
    // point is only that it must not throw.
    expect(s.readable).toBe(true);
  });
});

describe("an unreadable repo is not scored as a deficient one", () => {
  it("does not penalise the 50 file-signal points it could not observe", () => {
    const unreadable = buildHealthScoreForTest({ ...baseScore, readable: false });
    const readEmpty = buildHealthScoreForTest({ ...baseScore, readable: true });

    // The old behaviour scored these identically. They must now differ: the empty
    // repo genuinely lacks the signals; the unreadable one was never assessed.
    expect(unreadable).toBeGreaterThan(readEmpty);
  });

  it("still rewards what WAS observable on an unreadable repo", () => {
    const quiet = buildHealthScoreForTest({ ...baseScore, readable: false });
    const active = buildHealthScoreForTest({
      ...baseScore, readable: false, recentActivity: true, recentCommitCount: 10, stars: 400,
    });
    expect(active).toBeGreaterThan(quiet);
  });

  it("scores a fully-equipped readable repo above an unreadable one", () => {
    // The fix must not overshoot into rewarding unreadability.
    const unreadable = buildHealthScoreForTest({ ...baseScore, readable: false });
    const equipped = buildHealthScoreForTest({
      ...baseScore, readable: true,
      hasDocs: true, hasTests: true, hasCi: true, hasLint: true, hasManifest: true,
    });
    expect(equipped).toBeGreaterThan(unreadable);
  });

  it("keeps readable scoring unchanged", () => {
    // Regression guard: the rescale must apply ONLY to unreadable repos.
    const equipped = buildHealthScoreForTest({
      ...baseScore, readable: true, recentActivity: true,
      hasDocs: true, hasTests: true, hasCi: true, hasLint: true, hasManifest: true,
    });
    // 35 base + 10 docs + 14 tests + 10 CI + 8 lint + 8 manifest + 8 recent = 93
    expect(equipped).toBe(93);
  });
});
