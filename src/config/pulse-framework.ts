// Framework coverage catalogue — "what does Pulse cover", surfaced on the Pulse
// overview + public product/context pages.
//
// DERIVED, not hand-maintained: one entry per runtime category from the single
// source of truth (src/server/pulse-checks/categories.ts), with the check count
// read straight from the registry (checks-registry.ts). Add a category or a check
// there and the counts + totals here update automatically — no drift.

import { CATEGORY_META } from "@/server/pulse-checks/categories";
import { CHECKS_REGISTRY, getChecksByCategory } from "@/server/checks-registry";
import { PULSE_DEEP_AUDIT_CONTROL_COUNT, STANDARDS_VALIDATION_CATALOGUE_COUNT } from "@/server/pulse-checks/standards-verification";

export interface PulseFrameworkCategory {
  name: string;
  count: number;
  blurb: string;
  /** True for the 2026 AI-era categories added to diagnose AI-generated products. */
  aiEra?: boolean;
}

export const PULSE_FRAMEWORK: PulseFrameworkCategory[] = CATEGORY_META.map((m) => ({
  name: m.name,
  count: getChecksByCategory(m.name).length,
  blurb: m.blurb,
  aiEra: m.aiEra,
}));

/** Checks backed by executable URL/repository/source collectors today. */
export const PULSE_EXECUTABLE_CHECK_TOTAL = CHECKS_REGISTRY.filter((check) => !check.key.startsWith("standards_")).length;
/** Evidence requirements awaiting authenticated, device, CI-artifact, or release proof. */
export const PULSE_EVIDENCE_REQUIREMENT_TOTAL = PULSE_DEEP_AUDIT_CONTROL_COUNT + 116;
/** Platform-specific display rows; this is coverage inventory, never an executable-test count. */
export const PULSE_EVIDENCE_COVERAGE_ROWS = STANDARDS_VALIDATION_CATALOGUE_COUNT;
/** @deprecated Use PULSE_EXECUTABLE_CHECK_TOTAL for customer-facing claims. */
export const PULSE_CHECK_TOTAL = PULSE_EXECUTABLE_CHECK_TOTAL;
export const PULSE_CATEGORY_TOTAL = PULSE_FRAMEWORK.length;
