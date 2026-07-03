// Framework coverage catalogue — "what does Pulse cover", surfaced on the Pulse
// overview + public product/context pages.
//
// DERIVED, not hand-maintained: one entry per runtime category from the single
// source of truth (src/server/pulse-checks/categories.ts), with the check count
// read straight from the registry (checks-registry.ts). Add a category or a check
// there and the counts + totals here update automatically — no drift.

import { CATEGORY_META } from "@/server/pulse-checks/categories";
import { getChecksByCategory } from "@/server/checks-registry";

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

/** Total checks catalogued across the framework (exact registry count). */
export const PULSE_CHECK_TOTAL = PULSE_FRAMEWORK.reduce((sum, c) => sum + c.count, 0);
export const PULSE_CATEGORY_TOTAL = PULSE_FRAMEWORK.length;
