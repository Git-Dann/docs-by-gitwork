import { describe, expect, it } from "vitest";
import { buildReport, classifyPath, looksGenerated } from "../analyse";
import { codeHealthChecks } from "../checks";
import { cloneArgs, isCloneableRepo } from "../clone";
import { bandOf, buildRegister, functionFindings, scoreOf, THRESHOLDS } from "../rules";
import type { CodeHealthReport, FileMeasure, FunctionMeasure } from "@/types/code-health";

const f = (o: Partial<FunctionMeasure> & { name: string }): FunctionMeasure => ({
  owner: null, startLine: 1, endLine: 10, loc: 10, complexity: 1, params: 0, maxNesting: 0, ...o,
});
const file = (o: Partial<FileMeasure> & { path: string }): FileMeasure => ({
  language: "typescript", loc: 100, isTest: false, functions: [], classes: [], parseErrors: false, ...o,
});
const COVERAGE: CodeHealthReport["coverage"] = {
  analysedFiles: 1, skippedLarge: 0, skippedMinified: 0, skippedGenerated: 0,
  unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 0, truncated: false,
};

describe("thresholds", () => {
  it("follow the SEI complexity bands exactly at their edges", () => {
    const sev = (complexity: number) => functionFindings("a.ts", f({ name: "x", complexity })).find((d) => d.kind === "complex_function")?.severity ?? null;
    expect(sev(10)).toBeNull();
    expect(sev(11)).toBe("moderate");
    expect(sev(20)).toBe("moderate");
    expect(sev(21)).toBe("high");
    expect(sev(50)).toBe("high");
    expect(sev(51)).toBe("very_high");
  });
});

describe("the register", () => {
  it("lists a function once, at its worst finding, but counts every finding", () => {
    const { debt, counts } = buildRegister([file({ path: "a.ts", functions: [f({ name: "big", complexity: 60, loc: 300, params: 9 })] })]);
    expect(debt).toHaveLength(1);
    expect(debt[0]).toMatchObject({ kind: "complex_function", severity: "very_high", symbol: "big" });
    expect(counts).toMatchObject({ complex_function: 1, long_function: 1, long_parameter_list: 1 });
  });

  it("leaves test files out: a long test is normal", () => {
    const { debt } = buildRegister([file({ path: "a.test.ts", isTest: true, loc: 5000, functions: [f({ name: "t", complexity: 80 })] })]);
    expect(debt).toEqual([]);
  });

  it("names a method with its class", () => {
    const { debt } = buildRegister([file({ path: "a.ts", functions: [f({ name: "send", owner: "Mailer", complexity: 30 })] })]);
    expect(debt[0].symbol).toBe("Mailer.send");
  });

  it("orders worst first", () => {
    const { debt } = buildRegister([file({ path: "a.ts", functions: [f({ name: "mid", complexity: 25 }), f({ name: "worst", complexity: 90 }), f({ name: "low", complexity: 12 })] })]);
    expect(debt.map((d) => d.symbol)).toEqual(["worst", "mid", "low"]);
  });
});

describe("the score", () => {
  it("is 100 for simple code and drops with the share of complex code, not the count", () => {
    const simple = [file({ path: "a.ts", loc: 1000, functions: [f({ name: "a", loc: 50 }), f({ name: "b", loc: 80 })] })];
    expect(scoreOf(simple).score).toBe(100);
    const half = [file({ path: "a.ts", loc: 1000, functions: [f({ name: "a", complexity: 30, loc: 500 })] })];
    expect(scoreOf(half).score).toBe(75);
    // The same complex function in a codebase ten times bigger costs a tenth as much.
    // Spread over files under the large-file limit, so only the share is in play:
    // 100 − 50 × (500 / 10,000) = 97.5.
    const big = Array.from({ length: 10 }, (_, i) => file({ path: `f${i}.ts`, loc: 1000, functions: i === 0 ? [f({ name: "a", complexity: 30, loc: 500 })] : [] }));
    expect(scoreOf(big).score).toBe(98);
  });

  it("does not charge a nested function's lines twice", () => {
    const fns = [
      f({ name: "outer", startLine: 1, endLine: 200, loc: 200, complexity: 25 }),
      f({ name: "inner", startLine: 10, endLine: 50, loc: 40, complexity: 25 }),
    ];
    expect(scoreOf([file({ path: "a.ts", loc: 400, functions: fns })]).complexLocShare).toBe(0.5);
  });

  it("ignores tests", () => {
    expect(scoreOf([file({ path: "a.test.ts", isTest: true, loc: 1000, functions: [f({ name: "t", complexity: 99, loc: 1000 })] })]).score).toBe(100);
  });

  it("bands at 80 and 60", () => {
    expect([bandOf(80), bandOf(79), bandOf(60), bandOf(59)]).toEqual(["good", "fair", "fair", "poor"]);
  });
});

describe("which files are measured", () => {
  it.each([
    ["src/app.ts", "typescript"],
    ["lib/thing.tsx", "tsx"],
    ["app/models/user.py", "python"],
    ["Sources/App/Router.swift", "swift"],
  ])("measures %s", (path, lang) => {
    expect(classifyPath(path)).toEqual({ language: lang, isTest: false });
  });

  it.each(["node_modules/x/index.js", "vendor/a.php", "Pods/A/a.swift", "dist/app.js", ".next/server.js", "docs/js/jazzy.js", "src/types.d.ts", "lib/app.min.js", "examples/demo/app.ts"])(
    "excludes %s",
    (path) => {
      expect("skip" in classifyPath(path)).toBe(true);
    },
  );

  it("keeps tests, marked as tests", () => {
    for (const p of ["src/__tests__/a.test.ts", "tests/test_app.py", "server_test.go", "AppTests/RouterTests.swift"]) {
      expect(classifyPath(p)).toMatchObject({ isTest: true });
    }
  });

  it("counts source it cannot read yet, so the report can say so", () => {
    expect(classifyPath("lib/main.dart")).toEqual({ skip: "unsupported", label: "Dart" });
  });

  it("recognises minified and generated content", () => {
    expect(looksGenerated("x".repeat(20_000))).toBe("minified");
    expect(looksGenerated("// Code generated by protoc. DO NOT EDIT.\npackage x\n")).toBe("generated");
    expect(looksGenerated("const a = 1;\nconst b = 2;\n")).toBeNull();
  });
});

describe("the clone is hardened", () => {
  it("accepts owner/repo and nothing else", () => {
    expect(isCloneableRepo("pallets/flask")).toBe(true);
    for (const bad of ["pallets", "a/b/c", "../etc/passwd", "-o/x", "a/.git", "a/b.git", "https://github.com/a/b", "a/b c"]) {
      expect(isCloneableRepo(bad)).toBe(false);
    }
  });

  it("never puts the token in the URL, and turns off hooks, symlinks and local protocols", () => {
    const args = cloneArgs("acme/app", "/tmp/x", null, "ghp_SECRETSECRETSECRETSECRET");
    const url = args.find((a) => a.startsWith("https://"));
    expect(url).toBe("https://github.com/acme/app.git");
    expect(args.join(" ")).not.toContain("ghp_SECRET");
    expect(args).toEqual(expect.arrayContaining(["core.hooksPath=/dev/null", "core.symlinks=false", "protocol.file.allow=never", "--depth", "1"]));
    expect(args.some((a) => a.startsWith("http.https://github.com/.extraHeader=Authorization: Basic "))).toBe(true);
  });

  it("sends no auth header without a token", () => {
    expect(cloneArgs("acme/app", "/tmp/x", null, null).some((a) => a.includes("extraHeader"))).toBe(false);
  });
});

describe("the checks", () => {
  const report = (files: FileMeasure[], coverage = COVERAGE) => buildReport({ repo: "a/b", branch: "main", commit: "abcdef1234" }, files, coverage, () => 0);

  it("claims nothing when nothing was measured", () => {
    const checks = codeHealthChecks(report([], { ...COVERAGE, analysedFiles: 0, unsupportedSourceFiles: 40, unsupportedLanguages: ["Dart"] }));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ checkKey: "code_health_score", status: "INCONCLUSIVE" });
    expect(checks[0].detail).toContain("Dart");
  });

  it("fails on a very complex function, naming it and where it is", () => {
    const checks = codeHealthChecks(report([file({ path: "src/booking.ts", loc: 2000, functions: [f({ name: "handler", startLine: 486, complexity: 326, loc: 1800 })] })]));
    const c = checks.find((x) => x.checkKey === "code_health_complex_functions")!;
    expect(c.status).toBe("FAIL");
    expect(c.evidence).toContain("src/booking.ts:486 handler");
    expect(c.confidence).toBe("HIGH");
  });

  it("passes clean code on every check", () => {
    const checks = codeHealthChecks(report([file({ path: "a.ts", loc: 400, functions: [f({ name: "a", complexity: 3, loc: 20 })] })]));
    expect(checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("drops to medium confidence when the measure was cut short", () => {
    const checks = codeHealthChecks(report([file({ path: "a.ts" })], { ...COVERAGE, truncated: true }));
    expect(checks[0].confidence).toBe("MEDIUM");
  });

  it("never makes a dead-code claim it cannot back", () => {
    const keys = codeHealthChecks(report([file({ path: "a.ts", functions: [f({ name: "a", complexity: 90 })] })])).map((c) => c.checkKey);
    expect(keys.some((k) => /dead|unused/.test(k))).toBe(false);
  });

  it("uses the published thresholds in its wording", () => {
    const c = codeHealthChecks(report([file({ path: "a.ts", functions: [f({ name: "a", complexity: 15 })] })])).find((x) => x.checkKey === "code_health_complex_functions")!;
    expect(c.detail).toContain(String(THRESHOLDS.complexity.moderate));
  });
});
