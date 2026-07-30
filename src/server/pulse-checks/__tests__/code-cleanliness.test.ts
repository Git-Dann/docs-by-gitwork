import { describe, it, expect } from "vitest";
import {
  evaluateCleanlinessChecks,
  commentedOutCodeLines,
  maxNestingDepth,
  detectDuplication,
} from "../code-cleanliness";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// The three analysers here are the only real ALGORITHMS in Pulse's check layer —
// everything else is pattern matching. So they get tested directly, and the tests
// concentrate on the cases where a naive implementation is confidently wrong:
//
//   • a prose comment counted as commented-out code (the check would fire on
//     every well-documented file, which is precisely backwards)
//   • a brace inside a string or JSX inflating nesting depth
//   • shared import blocks and runs of closing braces read as duplication
// ─────────────────────────────────────────────────────────────────────────────

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.status;

describe("commented-out code vs prose", () => {
  it("counts commented-out statements", () => {
    const text = [
      "// const x = compute();",
      "// if (ready) {",
      "// return null;",
      "// doTheThing();",
    ].join("\n");
    expect(commentedOutCodeLines(text)).toBe(4);
  });

  it("does NOT count comments that explain why", () => {
    // The single most important negative case. A check that fires on documented
    // code punishes exactly the thing it is meant to encourage.
    const text = [
      "// We retry twice because the upstream API rate-limits bursts.",
      "// See RFC 7807 for the error envelope shape.",
      "// This is deliberate — do not 'fix' it.",
      "# Python prose comment explaining a decision here.",
    ].join("\n");
    expect(commentedOutCodeLines(text)).toBe(0);
  });

  it("ignores tool directives and task markers", () => {
    const text = [
      "// TODO: handle the empty case",
      "// eslint-disable-next-line no-console",
      "// @ts-expect-error upstream types are wrong",
      "# noqa: E501",
    ].join("\n");
    expect(commentedOutCodeLines(text)).toBe(0);
  });
});

describe("nesting depth", () => {
  it("measures brace depth in C-family code", () => {
    const text = `function a() {\n if (x) {\n  for (;;) {\n   while (y) {\n    if (z) {\n     go();\n    }\n   }\n  }\n }\n}`;
    expect(maxNestingDepth(text, "a.ts")).toBe(5);
  });

  it("does not count braces inside strings", () => {
    // Without string handling a template literal or a JSX className inflates the
    // reading badly, and the check fires on shallow, readable files.
    const text = `const a = "{{{{{{{{";\nconst b = \`\${x} {{{{ \`;\nfunction f() { return 1; }`;
    expect(maxNestingDepth(text, "a.ts")).toBe(1);
  });

  it("does not count braces inside comments", () => {
    const text = `/* { { { { { */\nfunction f() { return 1; }`;
    expect(maxNestingDepth(text, "a.ts")).toBe(1);
  });

  it("does NOT count object literals as nesting", () => {
    // Found by running this against a real repository (tmoreton/tutorials). Both
    // files the check flagged were an AWS CDK stack and an SDK entrypoint — nested
    // CONFIG objects with three levels of actual control flow. Counting every
    // brace makes any config-heavy or JSX-heavy file read as tangled logic, which
    // is the "fires on every React app" failure this family must not have.
    const configHeavy = `app.entrypoint({
      handler: {
        async run() {
          return { data: { nested: { deeper: 1 } } };
        },
      },
    });`;
    // One function body. The object literals are not conditions to hold in mind.
    expect(maxNestingDepth(configHeavy, "a.ts")).toBe(1);
  });

  it("still counts real control flow", () => {
    // The other half of the same fix: narrowing the metric must not neuter it.
    const nested = `function a() {
      if (x) {
        for (;;) {
          while (y) {
            if (z) { go(); }
          }
        }
      }
    }`;
    expect(maxNestingDepth(nested, "a.ts")).toBe(5);
  });

  it("counts arrow-function and else bodies", () => {
    const arrows = `const f = () => { if (a) { return 1; } else { return 2; } };`;
    expect(maxNestingDepth(arrows, "a.ts")).toBe(2);
  });

  it("measures indentation depth for Python", () => {
    const text = `def a():\n    if x:\n        for i in y:\n            while z:\n                go()`;
    expect(maxNestingDepth(text, "a.py")).toBe(4);
  });
});

describe("duplication detection", () => {
  const block = (n: number) =>
    `const a${n} = 1;\nconst b${n} = 2;\nif (a${n}) {\n  doThing(b${n});\n  other(a${n});\n}\nreturn a${n};`;

  it("finds an identical block copied into a second file", () => {
    const dup = detectDuplication(new Map([
      ["src/one.ts", block(1)],
      ["src/two.ts", block(1)],
    ]));
    expect(dup.crossFile).toBeGreaterThan(0);
    expect(dup.files.sort()).toEqual(["src/one.ts", "src/two.ts"]);
  });

  it("does not flag two files that merely share imports", () => {
    // Every file in a codebase shares its import block. Counting that would make
    // duplication fire on every repo, forever.
    const imports = `import a from "a";\nimport b from "b";\nimport c from "c";\n` +
      `import d from "d";\nimport e from "e";\nimport f from "f";`;
    const dup = detectDuplication(new Map([
      ["src/one.ts", imports + "\nconst unique1 = 1;"],
      ["src/two.ts", imports + "\nconst unique2 = 2;"],
    ]));
    expect(dup.crossFile).toBe(0);
  });

  it("does not flag runs of closing braces as duplicated logic", () => {
    const braces = `}\n}\n}\n}\n}\n}\n}`;
    const dup = detectDuplication(new Map([
      ["src/one.ts", `function a() { if (x) { for (;;) { while (y) {\n${braces}`],
      ["src/two.ts", `function b() { if (p) { for (;;) { while (q) {\n${braces}`],
    ]));
    expect(dup.crossFile).toBe(0);
  });

  it("ignores formatting differences", () => {
    // Normalisation is what makes this useful — a reformatted copy is still a copy.
    const dup = detectDuplication(new Map([
      ["src/one.ts", block(1)],
      ["src/two.ts", block(1).split("\n").map((l) => "    " + l).join("\n")],
    ]));
    expect(dup.crossFile).toBeGreaterThan(0);
  });

  it("counts repetition inside a single file separately", () => {
    const dup = detectDuplication(new Map([["src/one.ts", block(1) + "\n" + block(1)]]));
    expect(dup.inFile).toBeGreaterThan(0);
  });
});

describe("the family end to end", () => {
  it("returns nothing when no source was read", () => {
    expect(evaluateCleanlinessChecks(snapshot({}))).toEqual([]);
    expect(evaluateCleanlinessChecks({ ...snapshot({}), accessible: false })).toEqual([]);
  });

  it("fails a repo with a huge file", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/app.ts": Array.from({ length: 1400 }, (_, i) => `const v${i} = ${i};`).join("\n"),
    }));
    expect(statusOf(checks, "clean_file_size")).toBe("FAIL");
  });

  it("warns at the 600-line band without failing", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/app.ts": Array.from({ length: 700 }, (_, i) => `const v${i} = ${i};`).join("\n"),
    }));
    expect(statusOf(checks, "clean_file_size")).toBe("WARN");
  });

  it("ignores generated and vendored output when sizing files", () => {
    // A committed bundle is real code and not the team's to maintain. Counting it
    // makes every repo with a dist/ directory fail on file size.
    const huge = Array.from({ length: 2000 }, (_, i) => `const v${i} = ${i};`).join("\n");
    const checks = evaluateCleanlinessChecks(snapshot({
      "dist/bundle.js": huge,
      "node_modules/lib/index.js": huge,
      "src/app.ts": `export const x = 1;`,
    }));
    expect(statusOf(checks, "clean_file_size")).toBe("PASS");
  });

  it("fails a repo with committed dependencies", () => {
    const checks = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": `export const x = 1;` },
      ["node_modules/left-pad/index.js", "node_modules/left-pad/package.json"],
    ));
    expect(statusOf(checks, "clean_committed_artifacts")).toBe("FAIL");
  });

  it("flags stray debug output", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/app.ts": `export function go() { console.log("here", token); }`,
    }));
    expect(statusOf(checks, "clean_debug_statements")).toBe("WARN");
  });

  it("does not flag a commented-out console.log as live debug output", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/app.ts": `export function go() { /* console.log("here"); */ return 1; }`,
    }));
    expect(statusOf(checks, "clean_debug_statements")).toBe("PASS");
  });

  it("leaves a clean, well-documented repo clean", () => {
    // The acceptance test for the whole family: heavy prose comments, modest
    // files, shallow nesting and no duplication must produce zero FAILs.
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/user-service.ts":
        `// The user service owns identity lookups.\n` +
        `// We cache for 60s because the upstream directory is slow and rarely changes.\n` +
        `export async function findUser(id: string) {\n  return cache.get(id);\n}\n`,
      "src/order-service.ts":
        `// Orders are immutable once placed; corrections create a new record.\n` +
        `export async function placeOrder(input: OrderInput) {\n  return db.orders.create(input);\n}\n`,
    }));
    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
  });
});
