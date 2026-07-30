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
  it("upgrades a matching manual control to a high-confidence pass", () => {
    const resolved = resolveEvidenceBackedControls(
      "WEB_APP",
      [observed("ssl_valid", "PASS")],
    );

    const check = byKey(resolved, "standards_web_app_deep_network_01");
    expect(check.status).toBe("PASS");
    expect(check.confidence).toBe("HIGH");
    expect(check.detail).toContain("Pulse runtime evidence");
  });

  it("carries a confirmed source failure into the matching control", () => {
    const resolved = resolveEvidenceBackedControls(
      "WEB_APP",
      [observed("ssl_valid", "FAIL")],
    );

    const check = byKey(resolved, "standards_web_app_deep_network_01");
    expect(check.status).toBe("FAIL");
    expect(check.confidence).toBe("HIGH");
    expect(check.evidence).toContain("ssl_valid");
  });

  it("does not turn a warning or weak signal into a verified verdict", () => {
    const weak = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "WARN")]);
    const low = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "PASS", "LOW")]);

    for (const result of [weak, low]) {
      const check = byKey(result, "standards_web_app_deep_network_01");
      expect(check.status).toBe("WARN");
      expect(check.confidence).toBe("LOW");
    }
  });

  it("leaves unrelated controls as manual evidence requirements", () => {
    const resolved = resolveEvidenceBackedControls("WEB_APP", [observed("ssl_valid", "PASS")]);
    const unrelated = byKey(resolved, "standards_web_app_deep_ai_behavior_01");
    const original = byKey(runStandardsVerificationCatalog("WEB_APP"), "standards_web_app_deep_ai_behavior_01");

    expect(unrelated.status).toBe(original.status);
    expect(unrelated.confidence).toBe(original.confidence);
  });
});
