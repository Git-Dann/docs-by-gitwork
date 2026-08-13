import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  collectorCoverage,
  collectorCompletenessCheck,
  sourceCollectorsUnavailable,
  SOURCE_ONLY_COLLECTORS,
  type CollectorExecution,
} from "../collector-health";

// ─────────────────────────────────────────────────────────────────────────────
// A scan has to say what it did NOT run.
//
// On a URL-only scan the source collectors were not recorded as skipped — they
// were not recorded at all. So the coverage control counted "6 of 6 collectors
// completed" while the entire source half of Pulse had never run: absent read as
// complete, in the one control whose whole job is to stop exactly that.
//
// And "not applicable" is the wrong word for it. A URL scan CAN run those
// families; it was not given a repository. That is something the customer can
// change, and saying so is worth more than a count.
// ─────────────────────────────────────────────────────────────────────────────

const NO_REPO = "No repository was connected, so the source-analysis families did not run. Re-scan with a GitHub repo to include them.";

describe("a URL-only scan records the source collectors it could not run", () => {
  it("marks every source-only collector unavailable, with the reason", () => {
    const executions = sourceCollectorsUnavailable(NO_REPO);
    expect(executions).toHaveLength(SOURCE_ONLY_COLLECTORS.length);
    for (const execution of executions) {
      expect(execution.outcome).toBe("NOT_APPLICABLE");
      expect(execution.reason).toContain("repository");
    }
  });

  it("does not report them as completed", () => {
    const coverage = collectorCoverage([
      { name: "url-checks", outcome: "COMPLETED" },
      ...sourceCollectorsUnavailable(NO_REPO),
    ]);
    expect(coverage.completed).toBe(1);
    expect(coverage.notApplicable).toBe(SOURCE_ONLY_COLLECTORS.length);
  });

  it("names them, so 'what did you not check' has an answer rather than a number", () => {
    const coverage = collectorCoverage(sourceCollectorsUnavailable(NO_REPO));
    expect(coverage.unavailable.map((item) => item.name)).toEqual([...SOURCE_ONLY_COLLECTORS]);
    expect(new Set(coverage.unavailable.map((item) => item.reason)).size).toBe(1);
  });

  it("is wired into the live URL path, not just available to be called", () => {
    const source = readFileSync("src/server/pulse-lite/run-lite-scan.ts", "utf8");
    // The URL branch, up to where the GITHUB_REPO branch begins.
    const urlBranch = source.slice(
      source.indexOf('if (input.inputType === "URL")'),
      source.indexOf("// GITHUB_REPO"),
    );
    expect(urlBranch).toContain("sourceCollectorsUnavailable");
  });
});

describe("coverage separates a failure from an absence", () => {
  const executions: CollectorExecution[] = [
    { name: "url-checks", outcome: "COMPLETED" },
    { name: "browser-agent", outcome: "ERROR", detail: "PageSpeed Insights returned HTTP 429" },
    { name: "deploy-agent", outcome: "NOT_APPLICABLE" },
    ...sourceCollectorsUnavailable(NO_REPO),
  ];

  it("counts each outcome separately", () => {
    const coverage = collectorCoverage(executions);
    expect(coverage).toMatchObject({ completed: 1, failed: 1, notApplicable: 4 });
    expect(coverage.failedNames).toEqual(["browser-agent"]);
  });

  it("lists only the absences that carry an actionable reason", () => {
    // deploy-agent was genuinely not applicable and offers the customer nothing
    // to act on, so it is counted but not surfaced as an instruction.
    const coverage = collectorCoverage(executions);
    expect(coverage.notApplicable).toBe(4);
    expect(coverage.unavailable).toHaveLength(3);
    expect(coverage.unavailable.some((item) => item.name === "deploy-agent")).toBe(false);
  });

  it("still drives the check row to ERROR when something failed", () => {
    expect(collectorCompletenessCheck(executions).status).toBe("ERROR");
  });

  it("does not call a scan an error merely because something was unavailable", () => {
    // Not running the source families is a scope fact, not a fault.
    const clean = collectorCompletenessCheck([
      { name: "url-checks", outcome: "COMPLETED" },
      ...sourceCollectorsUnavailable(NO_REPO),
    ]);
    expect(clean.status).toBe("PASS");
  });
});

describe("coverage travels with the score it explains", () => {
  it("is attached to the stored breakdown", () => {
    const pulse = readFileSync("src/server/pulse.ts", "utf8");
    expect(pulse).toContain("collectors: collectorCoverage(collectorExecutions)");
  });

  it("is rendered where the score is explained", () => {
    const report = readFileSync("src/components/pulse/pulse-scan-results.tsx", "utf8");
    expect(report).toContain("What Pulse could not check");
    expect(report).toContain("breakdown.collectors");
  });

  it("treats a missing record as unknown rather than as everything having run", () => {
    // Scans predating this have no `collectors`, and the panel must stay silent
    // rather than assert full coverage on their behalf.
    const report = readFileSync("src/components/pulse/pulse-scan-results.tsx", "utf8");
    expect(report).toContain("breakdown.collectors && (");
  });
});
