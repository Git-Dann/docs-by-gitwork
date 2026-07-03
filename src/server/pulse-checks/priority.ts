// Exploitability priority — turns the findings list into a ranked "fix this first"
// (like Intruder's risk filtering). Pure + deterministic; combines severity (status),
// how sure we are (confidence/trustBucket), category weight, and a hard-critical set.

import type { PulseScanCheckInput, PulseScanCheckRecord } from "@/types/pulse";
import { WEIGHTED_CATEGORIES } from "./categories";

export type PriorityTier = "P1" | "P2" | "P3" | null;
export interface CheckPriority {
  score: number;
  tier: PriorityTier;
}

type AnyCheck = PulseScanCheckInput | PulseScanCheckRecord;

// Production-critical categories carry double weight — imported from the SoT
// (categories.ts), the same set score-breakdown uses.

// Findings that are launch-blocking on their own — bumped to the top.
const HARD_CRITICAL = new Set([
  "ssl_valid", "privacy_policy", "terms_of_service",
  "supabase_rls_enforced", "no_service_role_key_exposed", "no_exposed_env", "no_exposed_git",
]);

/** Deterministic priority for a single check. PASS/SKIPPED → not a priority (null). */
export function computePriority(check: AnyCheck): CheckPriority {
  if (check.status !== "FAIL" && check.status !== "WARN") return { score: 0, tier: null };

  const base = check.status === "FAIL" ? 3 : 1.5;
  // Certainty: a CONFIRMED finding outranks an unproven one of the same severity.
  const certainty =
    check.trustBucket === "CONFIRMED" ? 1
    : check.trustBucket === "LIKELY" ? 0.6
    : check.trustBucket === "INCONCLUSIVE" ? 0.2
    : check.confidence === "HIGH" ? 1
    : check.confidence === "LOW" ? 0.3
    : 0.6;
  const categoryWeight = WEIGHTED_CATEGORIES.has(check.category) ? 2 : 1;

  let score = base * certainty * categoryWeight;
  if (check.status === "FAIL" && HARD_CRITICAL.has(check.checkKey)) score += 4; // launch gate

  const tier: PriorityTier = score >= 6 ? "P1" : score >= 2.5 ? "P2" : "P3";
  return { score: Math.round(score * 10) / 10, tier };
}

/** Rank a scan's findings worst-first (FAIL/WARN only), highest priority on top. */
export function rankFindings<T extends AnyCheck>(checks: T[]): { check: T; priority: CheckPriority }[] {
  return checks
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .map((check) => ({ check, priority: computePriority(check) }))
    .sort((a, b) => b.priority.score - a.priority.score);
}
