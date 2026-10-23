import { describe, expect, it } from "vitest";
import { buildReport } from "../analyse";
import { analyseHistory, logArgs, parseLog, type Commit } from "../history";
import { diffReports } from "../trend";
import { applyLanguageApplicability, dominantLanguage, hasNonJsLinter, isJavaScriptProject } from "@/server/pulse-checks/repo-language";
import type { CodeHealthReport, FileMeasure, FunctionMeasure } from "@/types/code-health";

const fn = (complexity: number, name = "f"): FunctionMeasure => ({ name, owner: null, startLine: 1, endLine: 5, loc: 5, complexity, params: 0, maxNesting: 0 });
const file = (path: string, complexity: number, loc = 100, isTest = false): FileMeasure => ({
  path, language: "typescript", loc, isTest, functions: [fn(complexity)], classes: [], parseErrors: false,
});
const commit = (author: string, files: string[], i = 0): Commit => ({ sha: `s${i}${author}${files.join()}`, author, time: 1_700_000_000 + i, files });

describe("parseLog", () => {
  it("reads the record format logArgs asks git for", () => {
    const out = "\x1eabc\x1fAda Lovelace\x1f1700000000\n\nsrc/a.ts\nsrc/b.ts\n\x1edef\x1fBob\x1f1700000100\n\nsrc/a.ts\n";
    expect(parseLog(out)).toEqual([
      { sha: "abc", author: "Ada Lovelace", time: 1_700_000_000, files: ["src/a.ts", "src/b.ts"] },
      { sha: "def", author: "Bob", time: 1_700_000_100, files: ["src/a.ts"] },
    ]);
  });

  it("never asks git to diff file contents, which a blobless clone does not have", () => {
    expect(logArgs("2025-10-01")).toEqual(expect.arrayContaining(["--no-renames", "--name-only", "--no-merges"]));
    expect(logArgs("2025-10-01").some((a) => /--numstat|--stat|-p$|--patch/.test(a))).toBe(false);
  });
});

describe("analyseHistory", () => {
  const files = [file("src/hot.ts", 80), file("src/calm.ts", 80), file("src/busy.ts", 2), file("src/a.test.ts", 50, 100, true)];

  it("ranks hotspots by change frequency AND complexity, not either alone", () => {
    const commits = [
      ...Array.from({ length: 10 }, (_, i) => commit("Ada", ["src/hot.ts"], i)),
      ...Array.from({ length: 12 }, (_, i) => commit("Ada", ["src/busy.ts"], i + 20)),
      ...Array.from({ length: 2 }, (_, i) => commit("Ada", ["src/calm.ts"], i + 40)),
    ];
    const h = analyseHistory(commits, files);
    expect(h.hotspots[0].path).toBe("src/hot.ts");
    // Complex but untouched (2 changes) is not a hotspot; busy but simple ranks below hot.
    expect(h.hotspots.map((x) => x.path)).not.toContain("src/calm.ts");
    expect(h.hotspots.findIndex((x) => x.path === "src/busy.ts")).toBeGreaterThan(0);
  });

  it("ignores bots, mass edits and tests", () => {
    const commits = [
      ...Array.from({ length: 5 }, (_, i) => commit("dependabot[bot]", ["src/hot.ts"], i)),
      commit("Ada", Array.from({ length: 80 }, (_, i) => `src/f${i}.ts`).concat("src/hot.ts"), 9),
      ...Array.from({ length: 5 }, (_, i) => commit("Ada", ["src/a.test.ts"], i + 10)),
    ];
    const h = analyseHistory(commits, files);
    expect(h.botCommitsIgnored).toBe(5);
    expect(h.massEditsIgnored).toBe(1);
    expect(h.hotspots).toEqual([]);
    expect(h.contributors).toBe(1);
  });

  it("bus factor is the fewest people who are main author of over half the changed code", () => {
    const many = [file("a.ts", 1, 400), file("b.ts", 1, 300), file("c.ts", 1, 200), file("d.ts", 1, 100)];
    const h = analyseHistory([commit("Ada", ["a.ts"]), commit("Bob", ["b.ts"], 1), commit("Cy", ["c.ts"], 2), commit("Di", ["d.ts"], 3)], many);
    // Ada owns 40%, Ada+Bob 70%: two people hold over half.
    expect(h.busFactor).toBe(2);
    const solo = analyseHistory([commit("Ada", ["a.ts", "b.ts"]), commit("Bob", ["d.ts"], 1)], many);
    expect(solo.busFactor).toBe(1);
  });

  it("finds files that keep changing together across folders, not within one", () => {
    const fs = [file("api/user.ts", 5), file("web/user.tsx", 5), file("api/a.ts", 5), file("api/b.ts", 5)];
    const commits = [
      ...Array.from({ length: 6 }, (_, i) => commit("Ada", ["api/user.ts", "web/user.tsx"], i)),
      ...Array.from({ length: 6 }, (_, i) => commit("Ada", ["api/a.ts", "api/b.ts"], i + 10)),
    ];
    const h = analyseHistory(commits, fs);
    expect(h.coupling).toEqual([{ a: "api/user.ts", b: "web/user.tsx", shared: 6, degree: 1 }]);
  });

  it("reports no bus factor rather than inventing one when nothing changed", () => {
    expect(analyseHistory([], files).busFactor).toBeNull();
  });
});

describe("diffReports", () => {
  const COVERAGE: CodeHealthReport["coverage"] = { analysedFiles: 1, skippedLarge: 0, skippedMinified: 0, skippedGenerated: 0, unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 0, truncated: false };
  const report = (fs: FileMeasure[], commit: string) => buildReport({ repo: "a/b", branch: "main", commit }, fs, COVERAGE, () => 0);

  it("matches debt by file and symbol, so a function that moved lines is not new", () => {
    const before = report([{ ...file("src/a.ts", 30), functions: [{ ...fn(30, "big"), startLine: 10 }] }], "c1");
    const after = report([{ ...file("src/a.ts", 30), functions: [{ ...fn(30, "big"), startLine: 90 }, fn(25, "newer")] }], "c2");
    const t = diffReports(before, after, "scan-1");
    expect(t).toMatchObject({ newDebt: 1, resolvedDebt: 0, previousScanId: "scan-1", previousCommit: "c1" });
    expect(t.newItems[0].symbol).toBe("newer");
  });

  it("counts resolved debt and the score change", () => {
    const before = report([{ ...file("src/a.ts", 40), loc: 200, functions: [{ ...fn(40, "big"), loc: 150 }] }], "c1");
    const after = report([{ ...file("src/a.ts", 4), loc: 200, functions: [{ ...fn(4, "big"), loc: 150 }] }], "c2");
    const t = diffReports(before, after, "scan-1");
    expect(t.resolvedDebt).toBe(1);
    expect(t.scoreDelta).toBeGreaterThan(0);
  });
});

describe("repo language", () => {
  const py = ["pyproject.toml", "src/flask/app.py", "src/flask/cli.py", "tests/test_app.py", "docs/conf.py", "docs/_static/x.js"];

  it("knows a Python repo is not a JavaScript project, even with JS in its docs", () => {
    expect(dominantLanguage(py)).toBe("python");
    expect(isJavaScriptProject(py)).toBe(false);
  });

  it("keeps JS checks on anything with a root package.json", () => {
    expect(isJavaScriptProject([...py, "package.json"])).toBe(true);
  });

  it("skips TypeScript and Jest on a Python repo, and keeps everything else", () => {
    const out = applyLanguageApplicability(
      [{ checkKey: "has_typescript", status: "WARN", detail: "" as string | undefined }, { checkKey: "has_unit_test_config", status: "WARN" }, { checkKey: "has_readme", status: "PASS" }, { checkKey: "has_linter", status: "WARN" }],
      py,
    );
    expect(out.map((c) => c.status)).toEqual(["SKIPPED", "SKIPPED", "PASS", "WARN"]);
    expect(out[0].detail).toContain("Python");
  });

  it("finds linters outside JavaScript", () => {
    expect(hasNonJsLinter(["src/a.py", ".flake8"])).toBe(true);
    expect(hasNonJsLinter(["lib/a.rb", ".rubocop.yml"])).toBe(true);
    expect(hasNonJsLinter(["pyproject.toml"], "[project]\nname='x'\n\n[tool.ruff]\nline-length = 100\n")).toBe(true);
    expect(hasNonJsLinter(["pyproject.toml"], "[project]\nname='x'\n")).toBe(false);
  });
});
