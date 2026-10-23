import { describe, expect, it } from "vitest";
import { evaluateCliChecks } from "../cli-tool";
import type { RepoSnapshot } from "../native-mobile";

/**
 * October 2026 audit of the CLI family against vercel/serve, sindresorhus/np, google/zx and
 * npm-check-updates (CLAUDE.md §37 asked for exactly this). Each case is the shape of a real
 * repo, and each fix has its other side: a correct input that must NOT change.
 */
function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return { owner: "o", repo: "r", paths: [...Object.keys(files), ...extraPaths], files: new Map(Object.entries(files)), truncated: false, accessible: true };
}
const get = (s: RepoSnapshot, key: string) => evaluateCliChecks(s).find((c) => c.checkKey === key);
const pkg = (o: Record<string, unknown>) => JSON.stringify({ name: "tool", license: "MIT", description: "d", repository: "o/r", engines: { node: ">=20" }, ...o });

describe("cli_exit_codes", () => {
  it("sees exit(1) when exit was imported from node:process (vercel/serve)", () => {
    const s = snap({
      "package.json": pkg({ bin: { serve: "./build/main.js" } }),
      "source/main.ts": "import { cwd as getPwd, exit, env, stdout } from 'node:process';\nif (bad) { logger.error(e.message); exit(1); }",
    });
    expect(get(s, "cli_exit_codes")?.status).toBe("PASS");
  });
  it("still warns when the imported exit is only ever called with 0", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "cli.js": "import { exit } from 'node:process';\nexit(0);" });
    expect(get(s, "cli_exit_codes")?.status).toBe("WARN");
  });
  it("does not count a local helper called exit", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "cli.js": "function exit(n) { log(n) }\nexit(1);" });
    expect(get(s, "cli_exit_codes")?.status).toBe("WARN");
  });
  it("does not take evidence from test fixtures", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "cli.js": "console.log('hi')", "test/fixtures/exit-code.mjs": "process.exit(1)" });
    expect(get(s, "cli_exit_codes")?.status).toBe("WARN");
  });
});

describe("cli_types_published", () => {
  it("is not asked of a bin-only package (vercel/serve has no import surface)", () => {
    const s = snap({ "package.json": pkg({ bin: { serve: "./build/main.js" }, files: ["build/"] }), "source/main.ts": "export {}" });
    expect(get(s, "cli_types_published")).toBeUndefined();
  });
  it("is not triggered by TypeScript test fixtures in a JS package (np)", () => {
    const s = snap({
      "package.json": pkg({ bin: "./source/cli.js", main: "./source/index.js" }),
      "source/cli.js": "#!/usr/bin/env node",
      "test/fixtures/files/source/index.ts": "export {}",
      "index.test-d.ts": "",
    });
    expect(get(s, "cli_types_published")).toBeUndefined();
  });
  it("warns on a TS library whose exports has no types condition", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./dist/cli.js" }, exports: "./dist/index.js" }), "src/index.ts": "export const a = 1" });
    expect(get(s, "cli_types_published")?.status).toBe("WARN");
  });
  it("passes with a types condition in exports (google/zx)", () => {
    const s = snap({ "package.json": pkg({ bin: { zx: "./build/cli.js" }, exports: { ".": { types: "./build/index.d.ts", import: "./build/index.js" } } }), "src/index.ts": "export const a = 1" });
    expect(get(s, "cli_types_published")?.status).toBe("PASS");
  });
});

describe("cli_shell_injection", () => {
  it("sees node:child_process, and treats a validated non-argv value as a lead, not a finding (zx)", () => {
    const s = snap({
      "package.json": pkg({ bin: { zx: "./build/cli.js" } }),
      "src/core.ts": "import cp from 'node:child_process'\nif (!/^\\d+$/.test(pid)) throw new Fail()\ncp.exec(`taskkill /pid ${pid} /t /f`, () => {})",
    });
    const c = get(s, "cli_shell_injection");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("LOW");
  });
  it("is a confident warning when argv goes straight into a shell string", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "cli.js": "import { exec } from 'node:child_process'\nexec(`git checkout ${argv[2]}`)" });
    expect(get(s, "cli_shell_injection")).toMatchObject({ status: "WARN", confidence: "MEDIUM" });
  });
  it("does not warn on a static command or on RegExp.exec", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "cli.js": "const cp = require('child_process')\ncp.exec('git status')\n/x/.exec(\"abc\")" });
    expect(get(s, "cli_shell_injection")?.status).toBe("PASS");
  });
  it("ignores bundled third-party code in build/ when the source is committed", () => {
    const s = snap({
      "package.json": pkg({ bin: { t: "./build/cli.js" } }),
      "src/cli.ts": "import { spawn } from 'node:child_process'\nspawn('git', ['status'])",
      "build/vendor.cjs": "const cp = require('child_process'); cp.exec(`x ${y}`)",
    });
    expect(get(s, "cli_shell_injection")?.status).toBe("PASS");
  });
});

describe("cli_publish_provenance", () => {
  it("does not pass on id-token: write alone (a Pages deploy or a cloud login)", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), ".github/workflows/docs.yml": "permissions:\n  id-token: write\njobs:\n  deploy: {}" });
    expect(get(s, "cli_publish_provenance")?.status).toBe("WARN");
  });
  it("passes on npm publish --provenance (google/zx)", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), ".github/workflows/publish.yml": "permissions:\n  id-token: write\nsteps:\n  - run: npm publish --provenance" });
    expect(get(s, "cli_publish_provenance")).toMatchObject({ status: "PASS", confidence: "HIGH" });
  });
  it("passes on provenance=true in .npmrc", () => {
    const s = snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), ".npmrc": "provenance=true\n" });
    expect(get(s, "cli_publish_provenance")?.status).toBe("PASS");
  });
  it("is MEDIUM and says 'not configured in this repository', because provenance can be set outside it", () => {
    const c = get(snap({ "package.json": pkg({ bin: { t: "./cli.js" } }) }), "cli_publish_provenance");
    expect(c?.confidence).toBe("MEDIUM");
    expect(c?.detail).toContain("not configured in this repository");
  });
  it("knows changesets publishes from CI (vercel/serve)", () => {
    const c = get(snap({ "package.json": pkg({ bin: { t: "./cli.js" }, scripts: { release: "pnpm compile && changeset publish" } }), ".github/workflows/release.yaml": "uses: changesets/action@v1\nwith:\n  publish: pnpm release" }), "cli_publish_provenance");
    expect(c?.detail).toContain("already publish from CI");
  });
});

describe("cli_install_scripts", () => {
  it("warns on binding.gyp, which makes npm run node-gyp at install with no script declared", () => {
    expect(get(snap({ "package.json": pkg({ bin: { t: "./cli.js" } }), "binding.gyp": "{}" }), "cli_install_scripts")?.status).toBe("WARN");
  });
  it("passes with no scripts and no binding.gyp", () => {
    expect(get(snap({ "package.json": pkg({ bin: { t: "./cli.js" } }) }), "cli_install_scripts")?.status).toBe("PASS");
  });
});
