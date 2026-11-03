import { describe, expect, it } from "vitest";
import { detectCi, detectDependencyUpdates, detectLinter, detectTests, type RepoBasicsInput } from "../repo-basics";

// Path lists are shaped on the repos named in check-relevance-data.ts's WITHHELD reasons
// (October 2026 audit): gothinkster/node-express-realworld-example-app, electron/fiddle,
// kickstarter/ios-oss, sindresorhus/np.

function input(paths: string[] | null, extra: Partial<RepoBasicsInput> = {}): RepoBasicsInput {
  const rootNames = [...new Set((paths ?? []).map((p) => p.split("/")[0].toLowerCase()))];
  return { rootNames, paths, truncated: false, ...extra };
}

describe("has_tests — detectTests", () => {
  it("finds tests below the root (node-express-realworld: jest.config.ts, src/tests/*.test.ts)", () => {
    const r = detectTests(input(["package.json", "jest.config.ts", "src/app.ts", "src/tests/user.service.test.ts"]));
    expect(r.state).toBe("present");
  });

  it("finds colocated *.test.ts, Go _test.go, pytest test_*.py and XCTest *Tests.swift", () => {
    expect(detectTests(input(["src/a.ts", "src/a.test.ts"])).state).toBe("present");
    expect(detectTests(input(["go.mod", "pkg/server/handler_test.go"])).state).toBe("present");
    expect(detectTests(input(["app/main.py", "app/test_main.py"])).state).toBe("present");
    expect(detectTests(input(["Kickstarter-iOS/App.swift", "Library/ViewModels/LoginViewModelTests.swift"])).state).toBe("present");
    expect(detectTests(input(["app/src/androidTest/java/ExampleInstrumentedTest.kt"])).state).toBe("present");
  });

  it("counts a real package.json test script, but not npm's placeholder", () => {
    const real = JSON.stringify({ scripts: { test: "vitest run" } });
    const placeholder = JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } });
    expect(detectTests(input(["package.json", "index.js"], { packageJson: real })).state).toBe("present");
    expect(detectTests(input(["package.json", "index.js"], { packageJson: placeholder })).state).toBe("absent");
  });

  it("does not count tests that belong to an example, fixture or vendored tree", () => {
    const r = detectTests(input(["src/index.ts", "examples/demo/demo.test.ts", "node_modules/x/x.test.js", "vendor/y/y_test.go"]));
    expect(r.state).toBe("absent");
  });

  it("does not read latest.swift / Contest.kt as a test file", () => {
    expect(detectTests(input(["App/Latest.swift", "App/Contest.kt"])).state).toBe("absent");
  });

  it("is UNKNOWN, not absent, when the tree was not read or was truncated", () => {
    expect(detectTests(input(null, { rootNames: ["src", "package.json"] })).state).toBe("unknown");
    expect(detectTests(input(["src/index.ts"], { truncated: true })).state).toBe("unknown");
  });
});

describe("has_linter — detectLinter", () => {
  it("finds .eslintrc.json/.cjs/.yml and eslint.config.ts", () => {
    for (const f of [".eslintrc.json", ".eslintrc.cjs", ".eslintrc.yml", "eslint.config.ts", "eslint.config.mjs"]) {
      expect(detectLinter(input([f, "src/a.ts"])).state, f).toBe("present");
    }
  });

  it("finds oxlint (electron/fiddle) and a linter declared only in package.json", () => {
    expect(detectLinter(input([".oxlintrc.json", ".prettierrc", "src/a.ts"])).state).toBe("present");
    const pkg = JSON.stringify({ devDependencies: { eslint: "^9.0.0" } });
    expect(detectLinter(input(["package.json"], { packageJson: pkg })).state).toBe("present");
  });

  it("does not count Prettier — a formatter — as a linter", () => {
    expect(detectLinter(input([".prettierrc", "package.json", "src/a.ts"], { packageJson: JSON.stringify({ devDependencies: { prettier: "3" } }) })).state).toBe("absent");
  });

  it("finds non-JS linters at any depth (monorepo package)", () => {
    expect(detectLinter(input(["services/api/ruff.toml", "services/api/main.py"])).state).toBe("present");
    expect(detectLinter(input([".swiftlint.yml", "App/A.swift"])).state).toBe("present");
  });

  it("is UNKNOWN on a truncated tree with nothing found", () => {
    expect(detectLinter(input(["src/a.ts"], { truncated: true })).state).toBe("unknown");
  });
});

describe("ci_cd_present — detectCi", () => {
  it("does not pass on a .github folder holding only templates (kickstarter/ios-oss, sindresorhus/np)", () => {
    const r = detectCi(input([".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/bug.md", "README.md"]));
    expect(r.state).toBe("absent");
  });

  it("passes on a workflow file and on other CI systems", () => {
    expect(detectCi(input([".github/workflows/ci.yml", "README.md"])).state).toBe("present");
    expect(detectCi(input([".circleci/config.yml"])).state).toBe("present");
    expect(detectCi(input([".gitlab-ci.yml"])).state).toBe("present");
    expect(detectCi(input(["Jenkinsfile"])).state).toBe("present");
  });

  it("with no CI dot-directory at the root, the root listing settles absence even without a tree", () => {
    expect(detectCi(input(null, { rootNames: ["src", "readme.md"] })).state).toBe("absent");
  });

  it("is UNKNOWN when .github exists but its contents could not be read", () => {
    expect(detectCi(input(null, { rootNames: [".github", "src"] })).state).toBe("unknown");
  });
});

describe("has_dependabot — detectDependencyUpdates", () => {
  it("does not pass on a .github folder without dependabot.yml", () => {
    expect(detectDependencyUpdates(input([".github/workflows/ci.yml", ".github/PULL_REQUEST_TEMPLATE.md"])).state).toBe("absent");
  });

  it("passes on .github/dependabot.yml(.yaml) and on a Renovate config", () => {
    expect(detectDependencyUpdates(input([".github/dependabot.yml"])).state).toBe("present");
    expect(detectDependencyUpdates(input([".github/dependabot.yaml"])).state).toBe("present");
    expect(detectDependencyUpdates(input(["renovate.json"])).state).toBe("present");
  });

  it("is UNKNOWN when .github exists but was not read", () => {
    expect(detectDependencyUpdates(input(null, { rootNames: [".github"] })).state).toBe("unknown");
  });
});
