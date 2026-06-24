import type { PulseScanCheckInput, JurisdictionScorecardEntry, ComplianceGapItem } from "@/types/pulse";
import {
  type JurisdictionCode,
  JURISDICTIONS,
  jurisdictionsForCheck,
  checkAppliesToMarkets,
} from "./jurisdictions";

/**
 * Per-jurisdiction compliance breakdown — deterministic, AI-free. For each market
 * the product serves, it walks the checks tagged for that market (or its country
 * parent) and reports what's satisfied vs. missing.
 *
 * NOTE on the lens: this is a stricter, requirement-oriented view than the health
 * score. A check is "required" for a market when it is jurisdiction-tagged for it
 * AND actually ran (not SKIPPED — so platform-irrelevant checks don't inflate the
 * denominator). PASS = satisfied; WARN or FAIL = NOT demonstrably met → counted as
 * missing (the heuristic checks emit WARN for "no signal found", which for a legal
 * requirement means "can't show it's met"). This is intentionally binary, unlike
 * the health score where WARN earns half credit.
 *
 * Global/untagged checks (privacy_policy, terms, cookie_consent) are NOT folded
 * into a specific jurisdiction here — they're general and already drive the health
 * score; the scorecard stays crisp ("EU: these GDPR items are missing").
 */
export function computeComplianceScorecard(
  checks: PulseScanCheckInput[],
  markets: JurisdictionCode[],
): JurisdictionScorecardEntry[] {
  if (markets.length === 0) return [];

  const entries: JurisdictionScorecardEntry[] = markets.map((market) => {
    let passing = 0;
    let failing = 0;
    const missing: ComplianceGapItem[] = [];

    for (const check of checks) {
      const tags = jurisdictionsForCheck(check.checkKey);
      if (tags.length === 0) continue; // global — not jurisdiction-specific
      if (!checkAppliesToMarkets(check.checkKey, [market])) continue;
      if (check.status === "SKIPPED") continue; // didn't run (platform-irrelevant)
      if (check.status === "PASS") {
        passing++;
      } else {
        failing++;
        missing.push({ checkKey: check.checkKey, label: check.label, detail: check.detail ?? "" });
      }
    }

    const requiredChecks = passing + failing;
    const j = JURISDICTIONS[market];
    return {
      jurisdiction: market,
      label: j?.label ?? market,
      primaryLaw: j?.primaryLaw ?? "",
      requiredChecks,
      passing,
      failing,
      missing,
      compliancePct: requiredChecks === 0 ? 100 : Math.round((passing / requiredChecks) * 100),
    };
  });

  // Drop markets with nothing assessable (e.g. a declared market whose checks all
  // self-skipped) so the UI doesn't show empty rows.
  return entries.filter((e) => e.requiredChecks > 0);
}
