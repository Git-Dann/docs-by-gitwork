import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { UNTRUSTED_DATA_POLICY } from "../pulse-ai";
import { isWritableFixPath } from "../pulse-agents/fix-agent";

// ─────────────────────────────────────────────────────────────────────────────
// Everything the models see about a scanned product is written by someone else.
//
// Page titles, meta descriptions, competitor tech-stack strings, rendered
// screenshots and — for the fix agent — whole repository files come back into the
// context verbatim. One call site (the synthesis call) carried a security
// boundary; the other four did not, and the fix agent, which is the only one that
// WRITES anywhere, was among them.
//
// These tests pin the boundary at each site. The fix agent's path guard is tested
// as behaviour; the prompt wiring is asserted against the file, because a system
// prompt has no observable behaviour without calling a provider.
// ─────────────────────────────────────────────────────────────────────────────

const read = (path: string) => readFileSync(path, "utf8");

describe("the untrusted-data policy is one text, used everywhere", () => {
  it("says the things a boundary has to say", () => {
    expect(UNTRUSTED_DATA_POLICY).toContain("untrusted data");
    expect(UNTRUSTED_DATA_POLICY).toMatch(/never follow/i);
    // File contents were absent from the wording while the fix agent read them.
    expect(UNTRUSTED_DATA_POLICY).toContain("file contents");
  });

  it("reaches every model call that can see scanned content", () => {
    const pulseAi = read("src/server/pulse-ai.ts");
    // Synthesis (was already covered) and the discovery kit.
    expect(pulseAi).toContain("const resolvedSystemPrompt = `${configuredSystemPrompt}");
    expect(pulseAi.slice(pulseAi.indexOf("const DISCOVERY_SYSTEM_PROMPT"), pulseAi.indexOf("export async function generateDiscoveryKit")))
      .toContain("${UNTRUSTED_DATA_POLICY}");
    // The competitor comparison previously ran with no system prompt at all.
    // Declaring the constant is not enough — it has to be PASSED, on both provider
    // paths. An earlier version of this test asserted only the declaration and
    // stayed green when the `system:` argument was deleted.
    expect(pulseAi.slice(pulseAi.indexOf("const comparisonSystemPrompt"), pulseAi.indexOf("const comparisonSystemPrompt") + 400))
      .toContain("UNTRUSTED_DATA_POLICY");
    expect(pulseAi, "Anthropic competitor call must receive the system prompt")
      .toContain("system: comparisonSystemPrompt");
    expect(pulseAi, "OpenAI competitor call must receive the system prompt")
      .toContain('{ role: "system", content: comparisonSystemPrompt }');

    // Same rule for the vision call: declared and passed.
    const visual = read("src/server/pulse-agents/visual-agent.ts");
    expect(visual).toContain("UNTRUSTED_DATA_POLICY");
    expect(visual, "the vision call must receive a system prompt").toMatch(/system:\s*`[^`]*UNTRUSTED_DATA_POLICY/);

    // The fix agent's policy is inside its system prompt constant, which is passed
    // on every loop iteration — asserted separately below via the path guard.
    expect(read("src/server/pulse-agents/fix-agent.ts")).toContain("${UNTRUSTED_DATA_POLICY}");
  });

  it("is appended after any workspace prompt override, so it cannot be configured away", () => {
    const pulseAi = read("src/server/pulse-ai.ts");
    const line = pulseAi
      .split("\n")
      .find((candidate) => candidate.includes("configuredSystemPrompt") && candidate.includes("UNTRUSTED_DATA_POLICY"));
    expect(line, "the resolved system prompt should interpolate the override first").toBeTruthy();
    expect(line!.indexOf("configuredSystemPrompt")).toBeLessThan(line!.indexOf("UNTRUSTED_DATA_POLICY"));
  });
});

describe("scraped page identity is bounded before it enters a prompt", () => {
  it("caps every raw tag value, not just the description", () => {
    const pulseAi = read("src/server/pulse-ai.ts");
    const block = pulseAi.slice(
      pulseAi.indexOf("const pageIdentityLines"),
      pulseAi.indexOf("const contextBlock"),
    );
    // An attacker-controlled <title> was an unbounded write into the prompt.
    const capped = block.match(/\.slice\(0, 300\)/g) ?? [];
    expect(capped.length, "page title, OG title and meta description must all be capped").toBe(3);
  });
});

describe("the fix agent may only write inside the repository", () => {
  it("accepts ordinary repo-relative paths", () => {
    for (const path of ["src/middleware.ts", "README.md", ".github/workflows/ci.yml", "a/b/c/d.json"]) {
      expect(isWritableFixPath(path), path).toBe(true);
    }
  });

  it("rejects traversal, including the backslash form", () => {
    for (const path of ["../secrets.env", "src/../../etc/passwd", "..\\..\\windows\\system32", "a/../../b"]) {
      expect(isWritableFixPath(path), path).toBe(false);
    }
  });

  it("rejects absolute paths and URLs", () => {
    for (const path of ["/etc/passwd", "\\\\server\\share", "C:\\Windows\\win.ini", "https://example.test/x", "file:///etc/passwd"]) {
      expect(isWritableFixPath(path), path).toBe(false);
    }
  });

  it("rejects writes into .git, which rewrites refs rather than source", () => {
    expect(isWritableFixPath(".git/config")).toBe(false);
    expect(isWritableFixPath(".git/hooks/pre-commit")).toBe(false);
    // …but a file that merely starts with the same letters is ordinary source.
    expect(isWritableFixPath(".gitignore")).toBe(true);
    expect(isWritableFixPath(".github/dependabot.yml")).toBe(true);
  });

  it("rejects empty and control-character paths", () => {
    expect(isWritableFixPath("")).toBe(false);
    expect(isWritableFixPath("   ")).toBe(false);
    expect(isWritableFixPath("src/app\u0000.ts")).toBe(false);
    expect(isWritableFixPath("src/app\n.ts")).toBe(false);
  });

  it("refuses a bad path at propose time, so it never reaches the pull request", () => {
    const source = read("src/server/pulse-agents/fix-agent.ts");
    const proposeBranch = source.slice(
      source.indexOf('if (name === "propose_fix")'),
      source.indexOf('return "Unknown tool"'),
    );
    expect(proposeBranch).toContain("isWritableFixPath");
    // The guard has to run BEFORE the fix is queued — validating at write time
    // would still have put the rejected path into the PR body.
    expect(proposeBranch.indexOf("isWritableFixPath")).toBeLessThan(proposeBranch.indexOf("proposedFixes.push"));
  });
});
