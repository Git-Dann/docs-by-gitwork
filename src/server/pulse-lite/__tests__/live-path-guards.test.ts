import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// WHY THIS FILE EXISTS.
//
// The mobile-repo web-suite guard was written into pulse-agents/orchestrator.ts and
// merged to production as a fix. runOrchestratedScan has NO CALLERS — it is dead
// code — so the fix never executed. Every unit test passed, the typecheck passed,
// CI passed, and the scan behaved exactly as before.
//
// This is the §34 lesson in a new costume: it is not enough for logic to be correct,
// it has to be REACHED. These tests assert reachability, which no amount of testing
// the logic itself can establish.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the live scan path carries the guards", () => {
  it("run-lite-scan never expands a repository scan into its optional homepage", () => {
    // runLiteScan IS the live path: pulse.ts's runAnalysis calls it directly.
    const src = read("../run-lite-scan.ts");
    expect(src).not.toContain("runUrlChecks(safeHome");
    expect(src).not.toContain("runDeployAgent(safeHome");
    expect(src).not.toContain("runBrowserAgent(safeHome");
  });

  it("run-lite-scan threads the caller's target markets into the URL checks", () => {
    // Jurisdiction filtering is only applied when targetMarkets is actually passed;
    // the dead orchestrator passed `undefined`, which silently disabled it.
    const src = read("../run-lite-scan.ts");
    const urlCheckCalls = src.match(/runUrlChecks\([^)]*\)/g) ?? [];
    expect(urlCheckCalls.length).toBeGreaterThan(0);
    for (const call of urlCheckCalls) {
      expect(call, `must pass targetMarkets: ${call}`).toContain("input.targetMarkets");
    }
  });

  it("run-lite-scan plans agents after URL classification, so irrelevant calls never start", () => {
    const src = read("../run-lite-scan.ts");
    const urlChecksAt = src.indexOf("await runUrlChecks(safeUrl");
    const deployAt = src.indexOf("runDeployAgent(safeUrl", urlChecksAt);
    const browserAt = src.indexOf("runBrowserAgent(safeUrl", urlChecksAt);

    expect(urlChecksAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(urlChecksAt);
    expect(browserAt).toBeGreaterThan(urlChecksAt);
    expect(src).toContain("buildUrlCollectorPlan");
    expect(src).toContain("target_content_accessible");
    expect(src).toContain("urlSurfaceIsProduction");
    expect(src).toMatch(/if \(!urlTargetBlocked && urlSurfaceIsProduction && shouldResolveStandards\)[\s\S]*?resolveEvidenceBackedControls/);
  });
});

describe("dead code cannot masquerade as the live path", () => {
  it("orchestrator.ts is either called by something, or labelled dead", () => {
    // If someone wires runOrchestratedScan up later this test still passes. What it
    // forbids is the state we were in: an uncalled module that reads like the engine,
    // with no warning to the next person who edits it.
    const orchestrator = read("../../pulse-agents/orchestrator.ts");
    const liveCallers = [
      read("../run-lite-scan.ts"),
      read("../../pulse.ts"),
    ].some((s) => s.includes("runOrchestratedScan"));

    if (!liveCallers) {
      expect(
        orchestrator,
        "orchestrator.ts has no callers — it must say so at the top, or a fix written " +
        "there will silently never run (this happened, and shipped, in July 2026)",
      ).toMatch(/DEAD CODE|NOT CALLED|no callers/i);
    }
  });
});
