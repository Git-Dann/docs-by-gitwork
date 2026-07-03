import type {
  PulseScanCheckInput,
  ScoreBreakdown,
  ScoreCategoryBreakdown,
  ScoreCap,
} from "@/types/pulse";

// Categories that count double toward the health score — the production-critical
// ones. Derived from the SoT (categories.ts `weighted` flag); shared with priority.ts.
import { WEIGHTED_CATEGORIES } from "./categories";

/**
 * The single source of truth for the health score AND its human explanation.
 * `calculateHealthScore` delegates to `.finalScore`, so the "why this score"
 * breakdown can never drift from the headline number.
 *
 * Rule (unchanged): PASS = full weight, WARN = half, FAIL = 0, SKIPPED excluded;
 * Infrastructure/Security/Legal weighted ×2. Hard caps: no SSL → max 50; missing
 * privacy policy or terms → max 65 (binary launch gates).
 */
export function computeScoreBreakdown(checks: PulseScanCheckInput[]): ScoreBreakdown {
  const byCategory = new Map<string, ScoreCategoryBreakdown>();
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of checks) {
    const weight = WEIGHTED_CATEGORIES.has(check.category) ? 2 : 1;
    let entry = byCategory.get(check.category);
    if (!entry) {
      entry = { category: check.category, weight, pass: 0, warn: 0, fail: 0, skipped: 0, earned: 0, possible: 0 };
      byCategory.set(check.category, entry);
    }
    if (check.status === "SKIPPED") {
      entry.skipped++;
      continue;
    }
    // Trust layer: a LOW-confidence FAIL/WARN is an unproven alarm — don't let it
    // tank the score. Excluded from scoring (like SKIPPED); still shown in the UI
    // as "Inconclusive". PASS at low confidence still counts (a working signal we
    // saw, just weakly — excluding it would unfairly lower the score).
    if (check.confidence === "LOW" && check.status !== "PASS") {
      entry.skipped++;
      continue;
    }
    totalWeight += weight;
    entry.possible += weight;
    if (check.status === "PASS") {
      entry.pass++;
      earnedWeight += weight;
      entry.earned += weight;
    } else if (check.status === "WARN") {
      entry.warn++;
      earnedWeight += weight * 0.5;
      entry.earned += weight * 0.5;
    } else {
      entry.fail++; // FAIL earns nothing
    }
  }

  const rawScore = totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100);

  // Hard caps — replicated in the exact order of calculateHealthScore.
  let finalScore = rawScore;
  const capsApplied: ScoreCap[] = [];
  const hasNoSSL = checks.some((c) => c.checkKey === "ssl_valid" && c.status === "FAIL");
  const hasNoPrivacy = checks.some((c) => c.checkKey === "privacy_policy" && c.status === "FAIL");
  const hasNoTerms = checks.some((c) => c.checkKey === "terms_of_service" && c.status === "FAIL");

  if (hasNoSSL) {
    if (rawScore > 50) capsApplied.push({ cap: 50, reason: "No valid HTTPS/SSL (ssl_valid failed) — score capped at 50 until HTTPS works." });
    finalScore = Math.min(finalScore, 50);
  }
  if (hasNoPrivacy || hasNoTerms) {
    const what = hasNoPrivacy && hasNoTerms ? "privacy policy and terms of service" : hasNoPrivacy ? "privacy policy" : "terms of service";
    if (finalScore > 65) capsApplied.push({ cap: 65, reason: `Missing ${what} — score capped at 65 until published.` });
    finalScore = Math.min(finalScore, 65);
  }

  return {
    rawScore,
    finalScore,
    totalWeight,
    earnedWeight,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.possible - a.possible),
    capsApplied,
  };
}
