import { describe, expect, it } from "vitest";
import { DEFAULT_GATE_POLICY, evaluateReleaseGate } from "@/server/pulse-checks/release-decision";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * The release gate must never confuse "we established this" with "we could not
 * establish this".
 *
 * The bug this pins, measured on 2026-08-22 before the fix: `privacy_policy` and
 * `terms_of_service` BOTH INCONCLUSIVE, on an otherwise-clean 42-check scan, returned
 *
 *     decision = READY,  score 100,  unverified = []
 *
 * — byte-identical to the run where both PASSED. `unverified` was fed only by
 * COVERAGE_BELOW_FLOOR, REQUIRED_COLLECTOR_UNAVAILABLE and EVIDENCE_REQUIRED, so an
 * unestablished blocking key fed into nothing at all.
 *
 * That contradicts the precedence argued at the top of release-decision.ts
 * ("INCONCLUSIVE outranks CONDITIONAL and READY because the opposite mistake is
 * worse"), and it is not an edge case: a client-rendered site behind catch-all 200
 * routing cannot have either legal document established from outside, and that is
 * Pulse's core target population. The commonest scan we run was being rubber-stamped
 * on the two controls a launch actually turns on.
 */

function check(over: Partial<PulseScanCheckInput>): PulseScanCheckInput {
  return { category: "Legal", checkKey: "x", label: "x", status: "PASS", ...over } as PulseScanCheckInput;
}

/** An otherwise-clean scan, with the two legal blockers set to `status`. */
function scanWithLegal(status: PulseScanCheckInput["status"], trustBucket?: string) {
  return [
    check({ checkKey: "privacy_policy", label: "Privacy Policy", status, trustBucket } as Partial<PulseScanCheckInput>),
    check({ checkKey: "terms_of_service", label: "Terms of Service", status, trustBucket } as Partial<PulseScanCheckInput>),
    ...Array.from({ length: 40 }, (_, i) => check({ checkKey: `ok_${i}`, label: `ok ${i}`, status: "PASS" })),
  ];
}

const clean = { finalScore: 100, completeness: 95 };

describe("an unestablished launch blocker cannot clear the gate", () => {
  it("INCONCLUSIVE legal blockers yield INCONCLUSIVE, not READY", () => {
    const gate = evaluateReleaseGate(scanWithLegal("INCONCLUSIVE"), clean, DEFAULT_GATE_POLICY);
    expect(gate.decision).toBe("INCONCLUSIVE");
    expect(gate.unverified.map((r) => r.code)).toContain("BLOCKING_CONTROL_UNESTABLISHED");
    expect(gate.unverified[0].checkKeys).toEqual(["privacy_policy", "terms_of_service"]);
  });

  it("says it could not see enough — not that the controls are failing", () => {
    // The wording matters: a customer reading "non-negotiable control failing" would
    // go looking for a fault that Pulse has not claimed exists.
    const gate = evaluateReleaseGate(scanWithLegal("INCONCLUSIVE"), clean, DEFAULT_GATE_POLICY);
    const reason = gate.unverified.find((r) => r.code === "BLOCKING_CONTROL_UNESTABLISHED")!;
    expect(reason.summary).toMatch(/could not be established either way/i);
    expect(reason.summary).toMatch(/not saying (it is|they are) failing/i);
    expect(gate.blocking).toEqual([]);
  });

  it("ERROR and NOT_TESTED on a blocker are unestablished too", () => {
    for (const status of ["ERROR", "NOT_TESTED"] as const) {
      const gate = evaluateReleaseGate(scanWithLegal(status), clean, DEFAULT_GATE_POLICY);
      expect(gate.decision, status).toBe("INCONCLUSIVE");
    }
  });

  it("still distinguishes all four outcomes from each other", () => {
    // The regression was that INCONCLUSIVE and PASS were indistinguishable.
    const decisions = {
      PASS: evaluateReleaseGate(scanWithLegal("PASS"), clean, DEFAULT_GATE_POLICY).decision,
      INCONCLUSIVE: evaluateReleaseGate(scanWithLegal("INCONCLUSIVE"), clean, DEFAULT_GATE_POLICY).decision,
      FAIL: evaluateReleaseGate(
        scanWithLegal("FAIL", "CONFIRMED" as unknown as string),
        clean,
        DEFAULT_GATE_POLICY,
      ).decision,
    };
    expect(decisions.PASS).toBe("READY");
    expect(decisions.INCONCLUSIVE).toBe("INCONCLUSIVE");
    expect(decisions.FAIL).toBe("BLOCKED");
    // A confirmed blocker is KNOWLEDGE and must still outrank "we could not look".
    expect(decisions.FAIL).not.toBe(decisions.INCONCLUSIVE);
  });
});

describe("what must NOT become unestablished", () => {
  it("a SKIPPED blocker is a decision, not a gap", () => {
    // `applicable: false` with a reason is how Pulse says a control does not apply to
    // this subject — an iOS blocker on a URL-only scan, for instance. Treating that as
    // unverified would make every URL scan permanently INCONCLUSIVE.
    const gate = evaluateReleaseGate(scanWithLegal("SKIPPED"), clean, DEFAULT_GATE_POLICY);
    expect(gate.unverified.map((r) => r.code)).not.toContain("BLOCKING_CONTROL_UNESTABLISHED");
    expect(gate.decision).toBe("READY");
  });

  it("NOT_APPLICABLE likewise", () => {
    const gate = evaluateReleaseGate(scanWithLegal("NOT_APPLICABLE"), clean, DEFAULT_GATE_POLICY);
    expect(gate.unverified.map((r) => r.code)).not.toContain("BLOCKING_CONTROL_UNESTABLISHED");
  });

  it("a blocker that produced no check at all is COVERAGE's job, not this one", () => {
    // Double-counting an absent check here would fire on any policy whose blocking set
    // outruns what the scan's input type can assess.
    const gate = evaluateReleaseGate(
      Array.from({ length: 40 }, (_, i) => check({ checkKey: `ok_${i}`, label: `ok ${i}`, status: "PASS" })),
      clean,
      DEFAULT_GATE_POLICY,
    );
    expect(gate.unverified.map((r) => r.code)).not.toContain("BLOCKING_CONTROL_UNESTABLISHED");
  });

  it("an INCONCLUSIVE check that is NOT a blocker does not hold up the gate", () => {
    const gate = evaluateReleaseGate(
      [
        check({ checkKey: "multi_region_signals", label: "Multi-region", status: "INCONCLUSIVE", category: "Infrastructure" } as Partial<PulseScanCheckInput>),
        ...Array.from({ length: 40 }, (_, i) => check({ checkKey: `ok_${i}`, label: `ok ${i}`, status: "PASS" })),
      ],
      clean,
      DEFAULT_GATE_POLICY,
    );
    expect(gate.decision).toBe("READY");
  });
});
