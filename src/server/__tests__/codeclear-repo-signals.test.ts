import { describe, it, expect } from "vitest";
import { buildHealthScoreForTest, detectRepoSignalsForTest } from "../codeclear-analysis";
import type { RepoTree } from "../codeclear-analysis";

// TWO BUGS THIS FILE GUARDS, both of which quietly under-scored real people.
//
// 1. UNREADABLE READ AS ABSENT. Repo contents were fetched with
//    safeGithubRequest(path, []), which collapses every failure into its fallback, so
//    a 404 (private repo / no GITHUB_TOKEN), a 403 (rate limit) and a genuinely empty
//    repository all became []. detectRepoSignals then reported no tests, no CI, no
//    linter, no docs — worth 50 of the ~100 health-score points, feeding CodeClearScore.
//
// 2. SIGNALS WERE JAVASCRIPT-SHAPED. Only the ROOT listing was read, and the names
//    tested were JS ones. An Android repo keeps tests in app/src/test/ and lints with
//    detekt; Flutter uses analysis_options.yaml; Swift uses Tests/. All of them read
//    as having no tests and no linter EVEN WHEN PERFECTLY READABLE.

const tree = (paths: string[], truncated = false): RepoTree => ({
  paths: paths.map((p) => p.toLowerCase()),
  truncated,
});

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

describe("unreadable is distinguishable from empty", () => {
  it("marks a null tree unreadable", () => {
    const s = detectRepoSignalsForTest(null);
    expect(s.readable).toBe(false);
    expect(s.hasTests).toBe(false); // false, but `readable` says it means nothing
  });

  it("marks a genuinely empty repo READABLE", () => {
    // The distinction that did not exist: an empty repo really has no tests.
    const s = detectRepoSignalsForTest(tree([]));
    expect(s.readable).toBe(true);
    expect(s.hasTests).toBe(false);
  });

  it("surfaces truncation without treating it as failure", () => {
    const s = detectRepoSignalsForTest(tree(["README.md"], true));
    expect(s.readable).toBe(true);
    expect(s.truncated).toBe(true);
  });
});

describe("signals are language-aware, not JavaScript-shaped", () => {
  it("finds Android/Kotlin tests, lint and manifest", () => {
    const s = detectRepoSignalsForTest(tree([
      "app/build.gradle.kts",
      "app/src/main/java/com/acme/App.kt",
      "app/src/test/java/com/acme/AppTest.kt",
      "app/src/androidTest/java/com/acme/UiTest.kt",
      "config/detekt.yml",
      ".github/workflows/ci.yml",
      "README.md",
    ]));
    expect(s).toMatchObject({
      readable: true, hasTests: true, hasLint: true, hasManifest: true,
      hasCi: true, hasReadme: true, hasDocs: true,
    });
  });

  it("finds Flutter/Dart tests, lint and manifest", () => {
    const s = detectRepoSignalsForTest(tree([
      "pubspec.yaml",
      "analysis_options.yaml",
      "lib/main.dart",
      "test/widget_test.dart",
      "codemagic.yaml",
    ]));
    expect(s).toMatchObject({ hasTests: true, hasLint: true, hasManifest: true, hasCi: true });
  });

  it("finds Swift tests and manifest", () => {
    const s = detectRepoSignalsForTest(tree([
      "Package.swift",
      "Sources/App/App.swift",
      "Tests/AppTests/AppTests.swift",
      ".swiftlint.yml",
    ]));
    expect(s).toMatchObject({ hasTests: true, hasLint: true, hasManifest: true });
  });

  it("finds Python, Go and Rust conventions", () => {
    // pyproject.toml is a MANIFEST. It may or may not carry a [tool.ruff] block, and
    // we do not read file contents — so claiming a linter from its presence alone
    // would be a false positive. Lint needs an explicit config.
    const py = detectRepoSignalsForTest(tree(["pyproject.toml", "src/app.py", "tests/test_app.py"]));
    expect(py).toMatchObject({ hasTests: true, hasManifest: true, hasLint: false });

    const pyLinted = detectRepoSignalsForTest(tree(["pyproject.toml", ".ruff.toml", "src/app.py"]));
    expect(pyLinted.hasLint).toBe(true);

    const go = detectRepoSignalsForTest(tree(["go.mod", "main.go", "main_test.go", ".golangci.yml"]));
    expect(go).toMatchObject({ hasTests: true, hasLint: true, hasManifest: true });

    const rs = detectRepoSignalsForTest(tree(["Cargo.toml", "src/lib.rs", "tests/it.rs", "rustfmt.toml"]));
    expect(rs).toMatchObject({ hasTests: true, hasLint: true, hasManifest: true });
  });

  it("still handles the JavaScript layout it always handled", () => {
    const s = detectRepoSignalsForTest(tree([
      "package.json", ".eslintrc.json", "src/index.ts", "src/index.test.ts",
      ".github/workflows/test.yml", "README.md",
    ]));
    expect(s).toMatchObject({
      hasTests: true, hasLint: true, hasManifest: true, hasCi: true, hasReadme: true,
    });
  });

  it("does not credit tests that belong to a vendored dependency", () => {
    // A committed Pods/ or node_modules/ must not make a repo look well-tested.
    const s = detectRepoSignalsForTest(tree([
      "Podfile",
      "Pods/SomeLib/Tests/SomeLibTests.swift",
      "node_modules/left-pad/test/index.test.js",
      "App/main.swift",
    ]));
    expect(s.hasTests).toBe(false);
    expect(s.hasManifest).toBe(true); // the Podfile is the repo's own
  });

  it("does not treat a bare .github directory as CI", () => {
    // Issue templates and a CODEOWNERS file are not a pipeline.
    const s = detectRepoSignalsForTest(tree([".github/ISSUE_TEMPLATE/bug.md", ".github/CODEOWNERS"]));
    expect(s.hasCi).toBe(false);
  });

  it("recognises mobile CI that is not GitHub Actions", () => {
    expect(detectRepoSignalsForTest(tree(["fastlane/Fastfile"])).hasCi).toBe(true);
    expect(detectRepoSignalsForTest(tree(["bitrise.yml"])).hasCi).toBe(true);
    expect(detectRepoSignalsForTest(tree([".gitlab-ci.yml"])).hasCi).toBe(true);
  });
});

describe("an unreadable repo is not scored as a deficient one", () => {
  it("does not penalise the 50 file-signal points it could not observe", () => {
    const unreadable = buildHealthScoreForTest({ ...baseScore, readable: false });
    const readEmpty = buildHealthScoreForTest({ ...baseScore, readable: true });
    // The old behaviour scored these identically.
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
    // Regression guard: the rescale applies ONLY to unreadable repos.
    // 35 base + 10 docs + 14 tests + 10 CI + 8 lint + 8 manifest + 8 recent = 93
    const equipped = buildHealthScoreForTest({
      ...baseScore, readable: true, recentActivity: true,
      hasDocs: true, hasTests: true, hasCi: true, hasLint: true, hasManifest: true,
    });
    expect(equipped).toBe(93);
  });
});
