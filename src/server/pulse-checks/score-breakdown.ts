import type {
  PulseControlSeverity,
  PulseEvidenceStrength,
  PulseScanCheckInput,
  ScoreBreakdown,
  ScoreCategoryBreakdown,
} from "@/types/pulse";
import { WEIGHTED_CATEGORIES } from "./categories";

const SCORE_VERSION = "pulse-score-v3" as const;
const POLICY_VERSION = "pulse-policy-v3" as const;

const SEVERITY_WEIGHT: Record<PulseControlSeverity, number> = {
  CRITICAL: 8,
  HIGH: 5,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

const EVIDENCE_WEIGHT: Record<PulseEvidenceStrength, number> = {
  VERIFIED: 1,
  STRONG: 0.8,
  HEURISTIC: 0.5,
  CLAIMED: 0.25,
};

const CONFIDENCE_WEIGHT = { HIGH: 1, MEDIUM: 0.75, LOW: 0.4 } as const;
const UNKNOWN_STATUSES = new Set(["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"]);
const EXCLUDED_STATUSES = new Set(["SKIPPED", "NOT_APPLICABLE"]);

const CRITICAL_KEYS = new Set([
  "ssl_valid", "supabase_rls_enforced", "no_service_role_key_exposed",
  "no_exposed_env", "no_exposed_git", "outbound_target_ssrf_safe",
  "auth_content_redaction",
]);
const NON_TECHNICAL_KEYS = new Set([
  "github_stars", "press_media", "press_coverage", "product_hunt_badge",
  "public_roadmap", "social_media_links", "social_proof", "social_proof_numbers",
  "customer_logo_wall", "named_customer_quotes", "affiliate_program",
  "affiliate_programme_page", "bnpl_options", "crypto_payments",
  "investor_backing_listed", "community_forum_slack", "newsletter_signup", "media_kit",
]);

function severityFor(check: PulseScanCheckInput): PulseControlSeverity {
  if (check.severity) return check.severity;
  if (CRITICAL_KEYS.has(check.checkKey)) return "CRITICAL";
  if (check.category === "Security" || check.category === "AI Safety") return "HIGH";
  return check.status === "WARN" ? "LOW" : "MEDIUM";
}

function evidenceFor(check: PulseScanCheckInput): PulseEvidenceStrength {
  if (check.evidenceStrength) return check.evidenceStrength;
  return check.confidence === "HIGH" ? "VERIFIED" : check.confidence === "LOW" ? "CLAIMED" : "HEURISTIC";
}

function confidenceFor(check: PulseScanCheckInput): keyof typeof CONFIDENCE_WEIGHT {
  return check.confidence ?? "MEDIUM";
}

function outcomeValue(check: PulseScanCheckInput): number | null {
  if (check.status === "PASS") return 1;
  if (check.status === "WARN") return 0.5;
  if (check.status === "FAIL") return 0;
  return null;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Score v3: severity, evidence and confidence are symmetric for every outcome;
 * correlated controls share weight; categories are capped to a fixed contribution;
 * unknown collector states lower completeness instead of improving product health.
 */
export function computeScoreBreakdown(checks: PulseScanCheckInput[]): ScoreBreakdown {
  const eligible = checks.filter((check) =>
    check.scoreEligible !== false
    && check.category !== "Standards Verification"
    && !NON_TECHNICAL_KEYS.has(check.checkKey)
    && SEVERITY_WEIGHT[severityFor(check)] > 0,
  );
  const groupCounts = new Map<string, number>();
  for (const check of eligible) {
    const controlId = check.controlId ?? check.checkKey;
    groupCounts.set(controlId, (groupCounts.get(controlId) ?? 0) + 1);
  }

  const byCategoryAcc = new Map<string, ScoreCategoryBreakdown>();
  let observedPossible = 0;
  let observedEarned = 0;
  let unknownWeight = 0;
  let excludedCount = checks.length - eligible.length;

  for (const check of checks) {
    if (check.scoreEligible !== false || !check.completenessEligible || !UNKNOWN_STATUSES.has(check.status)) continue;
    unknownWeight += SEVERITY_WEIGHT[severityFor(check)]
      * EVIDENCE_WEIGHT[evidenceFor(check)]
      * CONFIDENCE_WEIGHT[confidenceFor(check)];
  }

  for (const check of eligible) {
    const categoryWeight = WEIGHTED_CATEGORIES.has(check.category) ? 2 : 1;
    let entry = byCategoryAcc.get(check.category);
    if (!entry) {
      entry = {
        category: check.category,
        weight: categoryWeight,
        pass: 0,
        warn: 0,
        fail: 0,
        skipped: 0,
        unknown: 0,
        earned: 0,
        possible: 0,
      };
      byCategoryAcc.set(check.category, entry);
    }

    if (EXCLUDED_STATUSES.has(check.status)) {
      entry.skipped++;
      excludedCount++;
      continue;
    }

    const independence = 1 / (groupCounts.get(check.controlId ?? check.checkKey) ?? 1);
    const controlWeight = SEVERITY_WEIGHT[severityFor(check)]
      * EVIDENCE_WEIGHT[evidenceFor(check)]
      * CONFIDENCE_WEIGHT[confidenceFor(check)]
      * independence;
    const value = outcomeValue(check);

    if (value === null || UNKNOWN_STATUSES.has(check.status)) {
      entry.unknown++;
      unknownWeight += controlWeight;
      continue;
    }

    entry.possible += controlWeight;
    entry.earned += controlWeight * value;
    observedPossible += controlWeight;
    observedEarned += controlWeight * value;
    if (check.status === "PASS") entry.pass++;
    else if (check.status === "WARN") entry.warn++;
    else entry.fail++;
  }

  // One category cannot dilute another merely by registering more controls.
  // Each applicable category contributes only its published fixed category weight.
  const scoredCategories = [...byCategoryAcc.values()].filter((entry) => entry.possible > 0);
  const categoryPossible = scoredCategories.reduce((sum, entry) => sum + entry.weight, 0);
  const categoryEarned = scoredCategories.reduce(
    (sum, entry) => sum + (entry.earned / entry.possible) * entry.weight,
    0,
  );
  const rawScore = categoryPossible === 0 ? 0 : Math.round((categoryEarned / categoryPossible) * 100);

  const knownAndUnknown = observedPossible + unknownWeight;
  const completeness = knownAndUnknown === 0 ? 0 : rounded((observedPossible / knownAndUnknown) * 100);
  const lowerBound = knownAndUnknown === 0 ? 0 : Math.round((observedEarned / knownAndUnknown) * 100);
  const upperBound = knownAndUnknown === 0 ? 0 : Math.round(((observedEarned + unknownWeight) / knownAndUnknown) * 100);

  return {
    rawScore,
    finalScore: rawScore,
    totalWeight: observedPossible,
    earnedWeight: observedEarned,
    byCategory: [...byCategoryAcc.values()].sort((a, b) => b.possible - a.possible),
    capsApplied: [],
    scoreVersion: SCORE_VERSION,
    policyVersion: POLICY_VERSION,
    completeness,
    lowerBound: Math.min(lowerBound, rawScore),
    upperBound: Math.max(upperBound, rawScore),
    unknownWeight,
    excludedCount,
  };
}
