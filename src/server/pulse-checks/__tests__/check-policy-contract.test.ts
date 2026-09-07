import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCheckPolicy, type CheckPolicy } from "@/server/check-config";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "../categories";

// ─────────────────────────────────────────────────────────────────────────────
// What the Settings → Checks panel PROMISES, held against what the code DOES.
//
// Two of its claims were untrue. It said a disabled check is "skipped entirely
// during scans" — the detector runs and its verdict is replaced at ingest, so
// anyone disabling a check to save scan time or API quota was misinformed about
// their own bill. And its severity override offered "Always fail", which reads as
// "force this check to fail"; it only re-grades a result the detector already
// returned as WARN or FAIL, and can never touch a PASS.
//
// Copy is not decoration here: it is what an admin bases a policy decision on.
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

/**
 * The panel with its comments stripped. The comments deliberately quote the old,
 * untrue copy so the reason for the change survives — asserting against the raw
 * file would match those quotes and pass on a revert.
 */
const panel = readFileSync("src/components/settings/checks-panel.tsx", "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("disabling a check", () => {
  const policy: CheckPolicy = { disabledKeys: new Set(["a_check"]), overrides: new Map() };

  it("keeps the control visible as NOT_TESTED rather than dropping it", () => {
    const [result] = applyCheckPolicy([check({ status: "FAIL" })], policy);
    expect(result.status).toBe("NOT_TESTED");
    expect(result.scoreEligible).toBe(false);
  });

  it("cannot be used to quietly improve a score by hiding a failure", () => {
    const [result] = applyCheckPolicy([check({ status: "FAIL" })], policy);
    expect(result.status).not.toBe("PASS");
  });

  it("does not claim in the UI that the check is skipped, because it is not", () => {
    expect(panel).not.toContain("skipped entirely during scans");
    expect(panel).toContain("still runs");
  });
});

describe("the severity override only re-grades an existing issue", () => {
  const forceFail: CheckPolicy = {
    disabledKeys: new Set(),
    overrides: new Map([["a_check", { labelOverride: null, severityOverride: "FAIL" }]]),
  };

  it("upgrades a WARN to a FAIL", () => {
    expect(applyCheckPolicy([check({ status: "WARN" })], forceFail)[0].status).toBe("FAIL");
  });

  it("leaves a PASS alone — an override cannot invent a finding", () => {
    expect(applyCheckPolicy([check({ status: "PASS" })], forceFail)[0].status).toBe("PASS");
  });

  it("leaves a non-outcome status alone", () => {
    for (const status of ["SKIPPED", "NOT_APPLICABLE", "INCONCLUSIVE", "EVIDENCE_REQUIRED"] as const) {
      expect(applyCheckPolicy([check({ status })], forceFail)[0].status).toBe(status);
    }
  });

  it("does not offer 'always fail' in the UI, which would describe a power it lacks", () => {
    expect(panel).not.toContain("Always fail");
    expect(panel).not.toContain("Always warn");
  });
});

describe("resetting a check's configuration needs the authority that set it", () => {
  // POST /api/settings/checks requires admin to SET an override. DELETE, which
  // removes one, had no authorisation at all — so any signed-in member could undo
  // an admin's deliberate disable or severity decision.
  const source = readFileSync("src/app/api/settings/checks/[checkKey]/route.ts", "utf8");
  // The HANDLER BODY, not the file. Asserting against the whole file passed while
  // the gate was deleted, because the import line still mentioned it — the same
  // false-negative CLAUDE.md §42.15 records.
  const handler = source.slice(source.indexOf("export async function DELETE"));

  it("gates DELETE the same way POST is gated", () => {
    expect(handler).toContain("assertAtLeastAdmin(");
    // Before the request is acted on, not after.
    expect(handler.indexOf("assertAtLeastAdmin(")).toBeLessThan(handler.indexOf("resetCheckConfig(decodeURIComponent"));
  });
});
