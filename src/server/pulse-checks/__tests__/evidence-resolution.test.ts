import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import {
  resolveEvidenceBackedControls,
  runStandardsVerificationCatalog,
} from "../standards-verification";

function observed(
  checkKey: string,
  status: PulseScanCheckInput["status"],
  confidence: PulseScanCheckInput["confidence"] = "HIGH",
): PulseScanCheckInput {
  return {
    category: "Security",
    checkKey,
    label: "Observed source control",
    status,
    confidence,
    detail: "Observed by Pulse during this scan.",
    evidence: "scan evidence",
  };
}

const byKey = (checks: PulseScanCheckInput[], key: string) => {
  const check = checks.find((candidate) => candidate.checkKey === key);
  expect(check, `Expected ${key} to be present`).toBeDefined();
  return check!;
};

describe("evidence-backed verification controls", () => {
  it("upgrades a control with a complete proving group to a pass", () => {
    const resolved = resolveEvidenceBackedControls(
      "WEB_APP",
      [observed("web_dependency_pinning", "PASS")],
    );

    const check = byKey(resolved, "standards_deep_supply_01");
    expect(check.status).toBe("PASS");
    expect(check.confidence).toBe("HIGH");
    expect(check.detail).toContain("Pulse observed");
  });

  it("carries a confirmed source failure into the matching control", () => {
    const resolved = resolveEvidenceBackedControls(
      "WEB_APP",
      [observed("ssl_valid", "FAIL")],
    );

    const check = byKey(resolved, "standards_deep_network_01");
    expect(check.status).toBe("FAIL");
    expect(check.confidence).toBe("HIGH");
    expect(check.evidence).toContain("ssl_valid");
  });

  it("carries a warning as a warning, and treats a weak signal as no evidence", () => {
    const weak = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "WARN")]);
    expect(byKey(weak, "standards_deep_network_01").status).toBe("WARN");

    const low = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "PASS", "LOW")]);
    const check = byKey(low, "standards_deep_network_01");
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.confidence).toBe("LOW");
  });

  it("leaves unrelated controls as manual evidence requirements", () => {
    const resolved = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "PASS")]);
    const unrelated = byKey(resolved, "standards_deep_ai_behavior_01");
    const original = byKey(runStandardsVerificationCatalog("WEB_APP"), "standards_deep_ai_behavior_01");

    expect(unrelated.status).toBe(original.status);
    expect(unrelated.confidence).toBe(original.confidence);
  });
});
