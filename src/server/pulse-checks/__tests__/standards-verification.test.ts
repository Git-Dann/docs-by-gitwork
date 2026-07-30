import { describe, expect, it } from "vitest";
import { PULSE_CHECK_TOTAL } from "@/config/pulse-framework";
import { computeScoreBreakdown } from "../score-breakdown";
import {
  PLATFORM_VALIDATION_PROFILES,
  STANDARDS_VALIDATION_CATALOGUE_COUNT,
  STANDARDS_VALIDATION_CONTROL_COUNT,
  STANDARDS_VALIDATION_REGISTRY,
  runStandardsVerificationCatalog,
} from "../standards-verification";

describe("standards verification catalogue", () => {
  it("covers every declared platform with 116 distinct evidence-required controls", () => {
    expect(STANDARDS_VALIDATION_CONTROL_COUNT).toBe(116);
    expect(PLATFORM_VALIDATION_PROFILES).toHaveLength(11);
    expect(STANDARDS_VALIDATION_CATALOGUE_COUNT).toBe(1276);
    expect(STANDARDS_VALIDATION_REGISTRY).toHaveLength(1276);
    expect(new Set(STANDARDS_VALIDATION_REGISTRY.map((check) => check.key)).size).toBe(1276);
  });

  it("keeps manual verification work visible without changing the health score", () => {
    const checks = runStandardsVerificationCatalog("IOS_APP");
    expect(checks).toHaveLength(116);
    expect(checks.every((check) => check.status === "WARN" && check.confidence === "LOW")).toBe(true);
    expect(computeScoreBreakdown(checks).totalWeight).toBe(0);
  });

  it("takes Pulse above the 1,500-check target", () => {
    expect(PULSE_CHECK_TOTAL).toBeGreaterThanOrEqual(1500);
  });
});
