import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCheckPolicy, type CheckPolicy } from "@/server/check-config";
import { policyDisposition } from "../policy-disposition";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// The detector's finding and the workspace's decision about it are two facts.
//
// `applyCheckPolicy` used to overwrite `status` and `detail` in place, so only the
// second survived. A stored scan could not be replayed against a different policy,
// and nobody could ask what the scanner actually found about a disabled check —
// it simply read as though nothing had been found.
// ─────────────────────────────────────────────────────────────────────────────

function check(overrides: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput {
  return {
    category: CATEGORIES.SECURITY,
    checkKey: "a_check",
    label: "A check",
    status: "PASS",
    ...overrides,
  } as PulseScanCheckInput;
}

const disable: CheckPolicy = { disabledKeys: new Set(["a_check"]), overrides: new Map() };
const regrade: CheckPolicy = {
  disabledKeys: new Set(),
  overrides: new Map([["a_check", { labelOverride: null, severityOverride: "FAIL" }]]),
};

describe("disabling a check keeps what the scanner found", () => {
  it("records the detector's status and detail", () => {
    const [result] = applyCheckPolicy(
      [check({ status: "FAIL", detail: "Exposed .env at /.env" })],
      disable,
    );
    expect(result.status).toBe("NOT_TESTED");
    expect(result.detectorStatus).toBe("FAIL");
    expect(result.detectorDetail).toBe("Exposed .env at /.env");
    // The policy's own wording still occupies `detail` — that is what the row says.
    expect(result.detail).toBe("Check disabled in workspace settings.");
  });

  it("does not invent a detectorDetail when the check had none", () => {
    const [result] = applyCheckPolicy([check({ status: "FAIL" })], disable);
    expect(result.detectorDetail).toBeUndefined();
  });
});

describe("re-grading records the grade it replaced", () => {
  it("keeps the detector's WARN when policy raises it to FAIL", () => {
    const [result] = applyCheckPolicy([check({ status: "WARN" })], regrade);
    expect(result.status).toBe("FAIL");
    expect(result.detectorStatus).toBe("WARN");
  });

  it("leaves detectorStatus unset when policy changed nothing", () => {
    // A PASS is never re-graded, so there is no prior verdict to record — and an
    // unconditionally-populated column would make every row look overridden.
    expect(applyCheckPolicy([check({ status: "PASS" })], regrade)[0].detectorStatus).toBeUndefined();
    expect(applyCheckPolicy([check({ status: "FAIL" })], { disabledKeys: new Set(), overrides: new Map() })[0]
      .detectorStatus).toBeUndefined();
  });

  it("leaves detectorStatus unset when a label-only override applies", () => {
    const labelOnly: CheckPolicy = {
      disabledKeys: new Set(),
      overrides: new Map([["a_check", { labelOverride: "Renamed", severityOverride: null }]]),
    };
    const [result] = applyCheckPolicy([check({ status: "FAIL" })], labelOnly);
    expect(result.label).toBe("Renamed");
    expect(result.detectorStatus).toBeUndefined();
  });
});

describe("the disposition is derived from the pair, never stored", () => {
  it("reads an untouched check as the detector's own", () => {
    expect(policyDisposition({ status: "FAIL" })).toBe("DETECTOR");
    expect(policyDisposition({ status: "FAIL", detectorStatus: null })).toBe("DETECTOR");
    // Equal values mean nothing was changed, whatever wrote them.
    expect(policyDisposition({ status: "FAIL", detectorStatus: "FAIL" })).toBe("DETECTOR");
  });

  it("distinguishes a disable from a re-grade", () => {
    expect(policyDisposition({ status: "NOT_TESTED", detectorStatus: "FAIL" })).toBe("DISABLED");
    expect(policyDisposition({ status: "FAIL", detectorStatus: "WARN" })).toBe("REGRADED");
  });

  it("agrees with what applyCheckPolicy actually produced", () => {
    expect(policyDisposition(applyCheckPolicy([check({ status: "FAIL" })], disable)[0])).toBe("DISABLED");
    expect(policyDisposition(applyCheckPolicy([check({ status: "WARN" })], regrade)[0])).toBe("REGRADED");
    expect(policyDisposition(applyCheckPolicy([check({ status: "PASS" })], regrade)[0])).toBe("DETECTOR");
  });
});

describe("the new columns survive the round trip", () => {
  const pulse = readFileSync("src/server/pulse.ts", "utf8");
  const persist = pulse.slice(pulse.indexOf("const persistChecks"), pulse.indexOf("let allChecks"));
  const serialise = pulse.slice(pulse.indexOf("checks: record.checks.map"), pulse.indexOf("createdAt: record.createdAt"));

  it("is written by persistChecks", () => {
    for (const field of ["completenessEligible", "detectorStatus", "detectorDetail"]) {
      expect(persist, `${field} must be persisted or it is dropped on write`).toContain(field);
    }
  });

  it("is read back by the serialiser", () => {
    for (const field of ["completenessEligible", "detectorStatus", "detectorDetail"]) {
      expect(serialise, `${field} must be serialised or the UI never sees it`).toContain(field);
    }
  });

  it("is rendered, so recording it is not a write-only column", () => {
    const report = readFileSync("src/components/pulse/pulse-scan-results.tsx", "utf8");
    expect(report).toContain("policyDisposition");
    expect(report).toContain("check.detectorStatus");
  });
});
