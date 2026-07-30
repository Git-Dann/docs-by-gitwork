import { describe, expect, it } from "vitest";
import { PULSE_CHECK_TOTAL } from "@/config/pulse-framework";
import { computeScoreBreakdown } from "../score-breakdown";
import {
  PLATFORM_VALIDATION_PROFILES,
  PULSE_DEEP_AUDIT_CONTROL_COUNT,
  PULSE_VERIFICATION_CONTROLS,
  STANDARDS_VALIDATION_CATALOGUE_COUNT,
  STANDARDS_VALIDATION_CONTROL_COUNT,
  STANDARDS_VALIDATION_REGISTRY,
  runStandardsVerificationCatalog,
} from "../standards-verification";

describe("standards verification catalogue", () => {
  it("covers every declared platform with distinct evidence-required controls", () => {
    expect(STANDARDS_VALIDATION_CONTROL_COUNT).toBe(116);
    expect(PULSE_DEEP_AUDIT_CONTROL_COUNT).toBe(275);
    expect(PULSE_VERIFICATION_CONTROLS).toHaveLength(391);
    expect(PLATFORM_VALIDATION_PROFILES).toHaveLength(11);
    expect(STANDARDS_VALIDATION_CATALOGUE_COUNT).toBe(4301);
    expect(STANDARDS_VALIDATION_REGISTRY).toHaveLength(4301);
    expect(new Set(STANDARDS_VALIDATION_REGISTRY.map((check) => check.key)).size).toBe(4301);
  });

  it("keeps manual verification work visible without changing the health score", () => {
    const checks = runStandardsVerificationCatalog("IOS_APP");
    expect(checks).toHaveLength(391);
    expect(checks.every((check) => check.status === "WARN" && check.confidence === "LOW")).toBe(true);
    expect(computeScoreBreakdown(checks).totalWeight).toBe(0);
  });

  it("takes Pulse above the 5,000-check target", () => {
    expect(PULSE_CHECK_TOTAL).toBeGreaterThanOrEqual(5000);
  });
});
