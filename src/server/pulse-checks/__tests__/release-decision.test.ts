import { describe, expect, it } from "vitest";
import {
  evaluateReleaseGate,
  describeDecision,
  gatePolicyById,
  GATE_POLICIES,
  DEFAULT_GATE_POLICY,
  withScanIncomplete,
} from "../release-decision";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput, ScoreBreakdown } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// The release decision, and the precedence that is the whole design:
//
//   BLOCKED  >  INCONCLUSIVE  >  CONDITIONAL  >  READY
//
// The three scenarios below are the brief's own worked examples, because they
// are the cases where a scanner most often gets it wrong: a high score hiding a
// blocker, thin coverage reading as a pass, and historical debt being mistaken
// for a reason to stop shipping.
// ─────────────────────────────────────────────────────────────────────────────

function check(overrides: Partial<PulseScanCheckInput>): PulseScanCheckInput {
  return {
    category: CATEGORIES.SECURITY,
    checkKey: "a_check",
    label: "A check",
    status: "PASS",
    confidence: "HIGH",
    trustBucket: "VERIFIED_WORKING",
    ...overrides,
  } as PulseScanCheckInput;
}

/** A FAIL Pulse is sure about. Only these are allowed to block. */
function confirmedFail(checkKey: string, over: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput {
  return check({ checkKey, label: checkKey, status: "FAIL", trustBucket: "CONFIRMED", ...over });
}

function breakdown(health: number, coverage: number, collectors?: ScoreBreakdown["collectors"]) {
  return { finalScore: health, completeness: coverage, collectors };
}

describe("the brief's worked examples", () => {
  it("A — a high score cannot override a confirmed blocker", () => {
    const result = evaluateReleaseGate(
      [confirmedFail("no_exposed_env", { severity: "CRITICAL" })],
      breakdown(94, 98),
    );
    expect(result.decision).toBe("BLOCKED");
    expect(result.blocking[0].checkKeys).toContain("no_exposed_env");
  });

  it("B — a perfect score over thin coverage is not a pass", () => {
    const result = evaluateReleaseGate([check({ status: "PASS" })], breakdown(100, 42));
    expect(result.decision).toBe("INCONCLUSIVE");
    expect(result.unverified[0].code).toBe("COVERAGE_BELOW_FLOOR");
    // And it must say this is about Pulse, not about the product.
    expect(result.unverified[0].summary).toContain("did not see enough");
  });

  it("C — historical debt with good coverage still ships", () => {
    const result = evaluateReleaseGate([check({ status: "PASS" })], breakdown(74, 97));
    expect(result.decision).toBe("READY");
  });
});

describe("precedence", () => {
  const blocker = confirmedFail("no_exposed_git", { severity: "CRITICAL" });

  it("BLOCKED outranks INCONCLUSIVE — a proven failure beats missing evidence", () => {
    // We could not see much, but what we DID see is disqualifying. Reporting
    // "inconclusive" here would bury the one thing we are certain of.
    expect(evaluateReleaseGate([blocker], breakdown(90, 10)).decision).toBe("BLOCKED");
  });

  it("INCONCLUSIVE outranks CONDITIONAL — thin evidence is not a mild pass", () => {
    expect(evaluateReleaseGate([confirmedFail("some_minor_thing")], breakdown(20, 10)).decision).toBe("INCONCLUSIVE");
  });

  it("CONDITIONAL outranks READY", () => {
    expect(evaluateReleaseGate([confirmedFail("some_minor_thing")], breakdown(90, 95)).decision).toBe("CONDITIONAL");
  });
});

describe("only a failure we are sure of may block", () => {
  it("does not block on an unconfirmed failure of a blocking control", () => {
    // Same control, same FAIL — but Pulse is not certain. Blocking a release on a
    // heuristic is how a gate gets switched off and stays off.
    const unsure = check({ checkKey: "no_exposed_env", status: "FAIL", trustBucket: "INCONCLUSIVE", confidence: "LOW" });
    expect(evaluateReleaseGate([unsure], breakdown(90, 95)).decision).toBe("READY");
  });

  it("does not block on a WARN, however severe the control", () => {
    const warned = check({ checkKey: "no_exposed_env", status: "WARN", trustBucket: "CONFIRMED", severity: "CRITICAL" });
    expect(evaluateReleaseGate([warned], breakdown(90, 95)).decision).toBe("READY");
  });

  it("blocks a confirmed CRITICAL in a blocking category even when unnamed", () => {
    const result = evaluateReleaseGate(
      [confirmedFail("some_new_security_check", { severity: "CRITICAL", category: CATEGORIES.SECURITY })],
      breakdown(90, 95),
    );
    expect(result.decision).toBe("BLOCKED");
    expect(result.blocking[0].code).toBe("CONFIRMED_CRITICAL");
  });

  it("does not double-count a control in both blocking reasons", () => {
    const result = evaluateReleaseGate(
      [confirmedFail("no_exposed_env", { severity: "CRITICAL" })],
      breakdown(90, 95),
    );
    expect(result.blocking).toHaveLength(1);
  });
});

describe("a low score is debt, not a blocker", () => {
  it("is CONDITIONAL, never BLOCKED", () => {
    const result = evaluateReleaseGate([check({ status: "PASS" })], breakdown(10, 95));
    expect(result.decision).toBe("CONDITIONAL");
    expect(result.conditional[0].code).toBe("HEALTH_BELOW_FLOOR");
    expect(result.blocking).toEqual([]);
  });
});

describe("required collectors", () => {
  const handover = gatePolicyById("handover");

  it("cannot decide a handover when the repository was never read", () => {
    const result = evaluateReleaseGate(
      [check({ status: "PASS" })],
      breakdown(95, 99, {
        completed: 1, failed: 0, notApplicable: 3, failedNames: [],
        unavailable: [
          { name: "github-checks", reason: "No repository was connected." },
          { name: "code-agent", reason: "No repository was connected." },
        ],
      }),
      handover,
    );
    expect(result.decision).toBe("INCONCLUSIVE");
    expect(result.unverified.some((reason) => reason.code === "REQUIRED_COLLECTOR_UNAVAILABLE")).toBe(true);
    // The reason a customer can act on travels with it.
    expect(result.unverified.find((r) => r.code === "REQUIRED_COLLECTOR_UNAVAILABLE")!.summary).toContain("repository");
  });

  it("treats a FAILED required collector the same as an absent one", () => {
    const result = evaluateReleaseGate(
      [check({ status: "PASS" })],
      breakdown(95, 99, { completed: 0, failed: 1, notApplicable: 0, failedNames: ["url-checks"], unavailable: [] }),
    );
    expect(result.decision).toBe("INCONCLUSIVE");
  });

  it("is READY when the same scan has everything it needs", () => {
    const result = evaluateReleaseGate(
      [check({ status: "PASS" })],
      breakdown(95, 99, { completed: 4, failed: 0, notApplicable: 0, failedNames: [], unavailable: [] }),
      handover,
    );
    expect(result.decision).toBe("READY");
  });
});

describe("evidence-required controls are reported, not paralysing", () => {
  it("lists them without making every scan inconclusive", () => {
    // A product with any manual control would otherwise be permanently
    // undecidable, and the state would stop carrying information.
    const result = evaluateReleaseGate(
      [check({ status: "EVIDENCE_REQUIRED", checkKey: "incident_response_process" })],
      breakdown(90, 95),
    );
    expect(result.decision).toBe("READY");
    expect(result.unverified.some((reason) => reason.code === "EVIDENCE_REQUIRED")).toBe(true);
  });
});

describe("policies are versioned, published and self-consistent", () => {
  it("records which policy and version produced the decision", () => {
    const result = evaluateReleaseGate([], breakdown(90, 95));
    expect(result.policy).toEqual({
      id: DEFAULT_GATE_POLICY.id,
      version: DEFAULT_GATE_POLICY.version,
      label: DEFAULT_GATE_POLICY.label,
    });
  });

  it("gives every policy a unique id, a version and a stated reason to exist", () => {
    const ids = GATE_POLICIES.map((policy) => policy.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const policy of GATE_POLICIES) {
      expect(policy.version, policy.id).toMatch(/^\d+\.\d+\.\d+$/);
      expect(policy.description.length, policy.id).toBeGreaterThan(40);
      expect(policy.minCoverage, policy.id).toBeGreaterThan(0);
    }
  });

  it("falls back to the default rather than throwing on an unknown id", () => {
    expect(gatePolicyById("does-not-exist").id).toBe(DEFAULT_GATE_POLICY.id);
    expect(gatePolicyById(null).id).toBe(DEFAULT_GATE_POLICY.id);
  });

  it("keeps the blocking set short enough to mean something", () => {
    // A blocking list that includes everything important stops meaning
    // "cannot ship" and starts meaning "should fix".
    for (const policy of GATE_POLICIES) {
      expect(policy.blockingKeys.length, policy.id).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic — the same evidence and policy give the same answer", () => {
    const checks = [confirmedFail("no_exposed_env", { severity: "CRITICAL" }), check({ status: "PASS" })];
    const first = evaluateReleaseGate(checks, breakdown(80, 90));
    const second = evaluateReleaseGate(checks, breakdown(80, 90));
    expect(first).toEqual(second);
  });
});

describe("the one-line summary", () => {
  it("leads with the decision and names the policy that made it", () => {
    const line = describeDecision(evaluateReleaseGate([confirmedFail("ssl_valid", { severity: "CRITICAL" })], breakdown(50, 90)));
    expect(line.startsWith("BLOCKED")).toBe(true);
    expect(line).toContain("launch-ready@1.0.0");
    expect(line).toContain("ssl_valid");
  });

  it("explains an INCONCLUSIVE rather than just naming it", () => {
    const line = describeDecision(evaluateReleaseGate([], breakdown(100, 10)));
    expect(line.startsWith("INCONCLUSIVE")).toBe(true);
    expect(line).toContain("coverage 10%");
  });
});

describe("a scan that did not finish", () => {
  it("cannot clear the gate — READY becomes INCONCLUSIVE", () => {
    const clean = evaluateReleaseGate([check({})], breakdown(90, 95));
    expect(clean.decision, "the precondition — it would otherwise have passed").toBe("READY");

    const downgraded = withScanIncomplete(clean, "Timed out after 60s.");
    expect(downgraded.decision).toBe("INCONCLUSIVE");
    expect(downgraded.unverified[0].summary).toContain("Timed out after 60s.");
  });

  it("cannot clear the gate — CONDITIONAL becomes INCONCLUSIVE", () => {
    const conditional = evaluateReleaseGate([confirmedFail("has_readme", { category: CATEGORIES.CODE_QUALITY })], breakdown(90, 95));
    expect(conditional.decision).toBe("CONDITIONAL");
    expect(withScanIncomplete(conditional, "Collector crashed.").decision).toBe("INCONCLUSIVE");
  });

  it("leaves BLOCKED alone — a proven blocker is knowledge, not an absence of it", () => {
    const blocked = evaluateReleaseGate([confirmedFail("no_exposed_git", { severity: "CRITICAL" })], breakdown(90, 95));
    expect(blocked.decision).toBe("BLOCKED");

    const after = withScanIncomplete(blocked, "Timed out.");
    expect(after.decision).toBe("BLOCKED");
    expect(after, "and it is returned untouched, so the blocking reasons survive verbatim").toEqual(blocked);
  });

  it("keeps the reasons the evaluation already had, and leads with the new one", () => {
    const thin = evaluateReleaseGate([], breakdown(90, 10));
    expect(thin.unverified).toHaveLength(1);

    const after = withScanIncomplete(thin, "Network unreachable.");
    expect(after.unverified).toHaveLength(2);
    expect(after.unverified[0].summary).toContain("Network unreachable.");
    expect(after.unverified[1]).toEqual(thin.unverified[0]);
  });
});
