import { describe, expect, it } from "vitest";
import { applyCheckPolicy, type CheckPolicy } from "../../check-config";
import { collectorCompletenessCheck } from "../collector-health";
import { computeScoreBreakdown } from "../score-breakdown";
import type { PulseScanCheckInput } from "@/types/pulse";

const check = (overrides: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput => ({
  category: "Security",
  checkKey: "example_control",
  label: "Example control",
  status: "PASS",
  ...overrides,
});

describe("workspace check policy", () => {
  it("applies disable, label and issue-status overrides on the live result", () => {
    const policy: CheckPolicy = {
      disabledKeys: new Set(["disabled"]),
      overrides: new Map([
        ["renamed", { labelOverride: "Workspace label", severityOverride: "FAIL" }],
      ]),
    };

    const result = applyCheckPolicy([
      check({ checkKey: "disabled" }),
      check({ checkKey: "renamed", status: "WARN" }),
    ], policy);

    expect(result[0]).toMatchObject({ status: "NOT_TESTED", detail: "Check disabled in workspace settings." });
    expect(result[1]).toMatchObject({ label: "Workspace label", status: "FAIL" });
  });
});

describe("collector completeness", () => {
  it("emits an explicit, score-neutral ERROR instead of dropping failed collectors", () => {
    const result = collectorCompletenessCheck([
      { name: "security-extended", outcome: "COMPLETED" },
      { name: "wcag", outcome: "ERROR", detail: "browser timed out" },
    ]);

    expect(result).toMatchObject({
      checkKey: "scan_collector_completeness",
      status: "ERROR",
      scoreEligible: false,
    });
    expect(result.detail).toContain("wcag");
  });
});

describe("Pulse score v3 trust model", () => {
  it("treats LOW-confidence PASS and FAIL symmetrically", () => {
    const breakdown = computeScoreBreakdown([
      check({ checkKey: "weak_pass", status: "PASS", confidence: "LOW" }),
      check({ checkKey: "weak_fail", status: "FAIL", confidence: "LOW" }),
    ]);

    expect(breakdown.finalScore).toBe(50);
  });

  it("publishes completeness and uncertainty without legacy legal or TLS caps", () => {
    const breakdown = computeScoreBreakdown([
      ...Array.from({ length: 9 }, (_, i) => check({ checkKey: `pass_${i}` })),
      check({ checkKey: "ssl_valid", status: "FAIL" }),
      check({ checkKey: "collector_unknown", status: "ERROR" }),
    ]);

    expect(breakdown.scoreVersion).toBe("pulse-score-v3");
    expect(breakdown.policyVersion).toBe("pulse-policy-v3");
    expect(breakdown.capsApplied).toEqual([]);
    expect(breakdown.finalScore).toBeGreaterThan(50);
    expect(breakdown.completeness).toBeLessThan(100);
    expect(breakdown.lowerBound).toBeLessThanOrEqual(breakdown.finalScore);
    expect(breakdown.upperBound).toBeGreaterThanOrEqual(breakdown.finalScore);
  });

  it("keeps manual evidence and growth signals outside the technical score", () => {
    const baseline = computeScoreBreakdown([check({ checkKey: "security_control", status: "FAIL" })]);
    const withGrowth = computeScoreBreakdown([
      check({ checkKey: "security_control", status: "FAIL" }),
      ...Array.from({ length: 20 }, (_, i) => check({
        category: "Trust & Brand",
        checkKey: `growth_${i}`,
        status: "PASS",
        scoreEligible: false,
      })),
    ]);

    expect(withGrowth.finalScore).toBe(baseline.finalScore);
  });
});
