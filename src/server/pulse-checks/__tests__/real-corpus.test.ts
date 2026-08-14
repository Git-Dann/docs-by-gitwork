import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { evaluateWebSourceChecks } from "../web-repo-source";
import { evaluateCleanlinessChecks } from "../code-cleanliness";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// THE REGRESSION HARNESS FOR FALSE POSITIVES.
//
// Three defects were found in one session by pointing check families at real
// code instead of fixtures, and all three had the same root cause: a
// pattern-matching rule validated only against examples written by whoever
// wrote the rule. Fixtures agree with their author by construction.
//
//   • `web_sql_string_building` reported three Prisma-only TypeScript routes as
//     SQL injection — FAIL, in Security, which the release gate blocks on.
//   • `clean_duplication_cross_file` counted the framework seam between two App
//     Router handlers as duplicated logic, on 58% of sampled files.
//   • Coverage went UP on a truncated tree, promoting unfounded absence
//     findings into scored failures.
//
// So this test does what a fixture cannot: it runs the source families over
// THIS repository's own API routes — ~150 files of ordinary, heavily-reviewed
// Next.js code that is definitively free of raw SQL, `eval`, shell building and
// hardcoded credentials. Any FAIL here is a false positive by construction.
//
// It is the same idea as `audit:ui --self-test` (§31): prove the rule stays
// quiet on the fix, not only that it fires on the defect.
//
// ⚠️ IF THIS TEST FAILS, read the finding before changing the test. Two very
// different things make it go red, and they need opposite responses:
//   1. A rule started firing on ordinary code → fix the rule. This is the case
//      it exists for.
//   2. Someone genuinely introduced raw SQL, `eval`, or a committed secret into
//      an API route → fix the code. The check was right.
// Narrowing the corpus to make it pass is the one response that is always wrong.
// ─────────────────────────────────────────────────────────────────────────────

/** This repo's own API routes: large, homogeneous, and known-clean. */
function apiRouteSnapshot(): RepoSnapshot {
  const paths = execSync("git ls-files src/app/api", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((p) => p.endsWith("route.ts"));

  const files = new Map<string, string>();
  // package.json is read because both families gate on the project manifest.
  files.set("package.json", readFileSync("package.json", "utf8"));
  for (const path of paths) {
    try {
      files.set(path, readFileSync(path, "utf8"));
    } catch {
      /* unreadable in this environment — the corpus stays representative */
    }
  }
  return {
    owner: "Git-Dann",
    repo: "docs-by-gitwork",
    paths: [...paths, "package.json"],
    files,
    truncated: false,
    accessible: true,
  };
}

const snapshot = apiRouteSnapshot();

describe("the source families on this repository's own API routes", () => {
  it("has a corpus worth asserting against", () => {
    // Guards the guard: if the glob ever stops matching, every assertion below
    // would pass vacuously and this file would silently stop being coverage.
    expect(snapshot.files.size).toBeGreaterThan(50);
  });

  it("reports no web-source FAILURE on ordinary Next.js route code", () => {
    const failures = evaluateWebSourceChecks(snapshot).filter((check) => check.status === "FAIL");
    expect(
      failures.map((f) => `${f.checkKey}: ${f.evidence ?? f.detail?.slice(0, 120)}`),
      "a FAIL here is a false positive unless the code genuinely changed — read the finding, do not narrow the corpus",
    ).toEqual([]);
  });

  it("does not treat App Router handler boilerplate as duplicated logic", () => {
    // Every route file in this corpus shares the `try { … } catch (error) {
    // return fromError(error); }` shape and the two-handler seam. Before the
    // substantive-line rule this alone produced hundreds of "duplicate blocks".
    const duplication = evaluateCleanlinessChecks(snapshot)
      .find((check) => check.checkKey === "clean_duplication_cross_file");

    // The check may legitimately fire on a genuinely copy-pasted helper — this
    // repo has one — so the assertion is on the SHAPE of the evidence, not on
    // silence: the boilerplate must not be what carries it.
    if (duplication && duplication.status !== "PASS") {
      expect(
        duplication.detail ?? "",
        "if this fires, it must be for real duplication, and the file count must be a minority of the corpus",
      ).toBeTruthy();
      const match = /across (\d+) file\(s\)/.exec(duplication.detail ?? "");
      const involved = match ? Number(match[1]) : 0;
      expect(
        involved,
        `${involved} of ${snapshot.files.size} route files reported as duplicated — boilerplate is being counted again`,
      ).toBeLessThan(snapshot.files.size * 0.5);
    }
  });

  it("does not report commented-out code on a prose-heavy codebase", () => {
    // This repo's house style is long explanatory comments quoting identifiers,
    // regex fragments and code snippets — the hardest possible case for a
    // prose-versus-commented-out-code distinction, and exactly the style a
    // maintainability check should reward rather than punish.
    const commented = evaluateCleanlinessChecks(snapshot)
      .find((check) => check.checkKey === "clean_commented_out_code");
    expect(commented?.status, commented?.detail).toBe("PASS");
  });
});
