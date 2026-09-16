// Exploitability priority — turns the findings list into a ranked "fix this first"
// (like Intruder's risk filtering). Pure + deterministic; combines severity (status),
// how sure we are (confidence/trustBucket), category weight, and a hard-critical set.

import type { PulseScanCheckInput, PulseScanCheckRecord } from "@/types/pulse";
import { WEIGHTED_CATEGORIES } from "./categories";
import { CRITICAL_KEYS } from "./confidence";

export type PriorityTier = "P1" | "P2" | "P3" | null;
export interface CheckPriority {
  score: number;
  tier: PriorityTier;
}

type AnyCheck = PulseScanCheckInput | PulseScanCheckRecord;

// Production-critical categories carry double weight — imported from the SoT
// (categories.ts), the same set score-breakdown uses.

/**
 * Findings that are launch-blocking on their own — bumped to the top of the fix list.
 *
 * ⚠️ Built from `CRITICAL_KEYS` rather than retyped. The two lists were maintained by hand and had
 * drifted in both directions: this one carried `privacy_policy`/`terms_of_service` (which are not
 * technically severe), and — the defect that mattered — it was MISSING `outbound_target_ssrf_safe`
 * and `auth_content_redaction`, both of which the severity model already calls CRITICAL.
 *
 * Measured effect: a CONFIRMED SSRF finding scored **6** while a missing privacy policy scored
 * **10**, so the fix list told a customer their missing policy page was more urgent than a
 * server-side request forgery in their product. Both tiered P1 — Security is double-weighted, so
 * the tier was never wrong — which is exactly why this went unnoticed: the bug was in the ORDER
 * inside P1, and nothing asserted order.
 *
 * The two extras are kept deliberately and are the whole reason this is a superset rather than an
 * alias: a missing privacy policy or terms page **stops a launch** (it is in the gate's blocking
 * keys, and app stores and GDPR both require it) without being a technically severe defect. Being
 * launch-blocking and being dangerous are different properties, and only one of them belongs in
 * the score's severity weight — which is why this set adds to the ranking and never writes back.
 */
const LAUNCH_BLOCKING_ONLY = ["privacy_policy", "terms_of_service"] as const;
const HARD_CRITICAL = new Set<string>([...CRITICAL_KEYS, ...LAUNCH_BLOCKING_ONLY]);

/**
 * TIDINESS findings — the mirror of HARD_CRITICAL. Real, worth fixing, and never a
 * launch consideration: dead code, stray dev leftovers, TODO density, a plist key
 * that does nothing. They are damped so they always land in P3 and can never crowd
 * a security or store-blocking finding out of the top of the fix list.
 *
 * A check belongs here only if acting on it changes nothing a user or reviewer would
 * ever see. If it can break a build, fail review, or expose data, it does NOT.
 */
const COSMETIC = new Set([
  "ios_invalid_plist_keys",
  "ios_ats_exception_noop",
  "ios_dev_leftovers",
  "ios_todo_density",
  "ios_dead_code",
  "ios_committed_junk",
  // Flutter tidiness — a dev endpoint left in source is worth removing and is never
  // a launch consideration. NOTE flutter_commented_features is deliberately NOT here:
  // commenting out a feature CHANGES SHIPPED BEHAVIOUR, so it is a real finding.
  "flutter_dev_endpoints",
]);
const COSMETIC_DAMPING = 0.3;

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
  if (COSMETIC.has(check.checkKey)) score *= COSMETIC_DAMPING; // nice-to-have, never P1/P2

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
