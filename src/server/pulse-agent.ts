// Pulse as an agent-callable service — runs a scan and returns a COMPACT verdict
// for AI coding tools (via the MCP server) or any authenticated HTTP agent.
//
// AI-free: reuses the deterministic lite scan + the trust/grades/compliance layers.
// SSRF-guarded + rate-limited inside runLiteScan/assertScannableUrl. Pulse stays
// internal — callers are authenticated by middleware (API key / OAuth); this module
// has no auth of its own.

import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { computeGrades, type PulseGrade } from "@/server/pulse-checks/grades";
import { computeComplianceScorecard } from "@/server/pulse-checks/compliance-scorecard";
import { resolveTargetMarkets, isJurisdictionCode, type JurisdictionCode } from "@/server/pulse-checks/jurisdictions";
import { calculateHealthScore } from "@/server/pulse-scan";
import { rankFindings } from "@/server/pulse-checks/priority";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface AgentVerdict {
  url: string;
  status: "COMPLETED" | "FAILED";
  healthScore: number;
  summary: string;
  grades: PulseGrade[];
  techStack: string[];
  /**
   * TRUST-BUCKET populations, not issue counts. `confirmed` is every HIGH-confidence
   * check that is not passing — it is NOT the length of `confirmedIssues`, which
   * counts only outright failures. Read `failures`/`warnings` for issue counts.
   */
  counts: {
    confirmed: number;
    likely: number;
    verifiedWorking: number;
    inconclusive: number;
    /** Failing checks surfaced in `confirmedIssues` (the number the summary quotes). */
    failures: number;
    /** Warning checks surfaced in `warnings`. */
    warnings: number;
  };
  confirmedIssues: { checkKey: string; label: string; category: string; detail: string }[];
  /**
   * WARN-status findings. Previously omitted entirely, which made a scan whose
   * problems were all warnings look clean — for a native mobile repo that was most
   * of them. Capped like confirmedIssues.
   */
  warnings: { checkKey: string; label: string; category: string; detail: string }[];
  rls: { applicable: boolean; enforced: boolean | null; detail: string };
  compliance: { jurisdiction: string; label: string; compliancePct: number; missing: string[] }[];
  topFixes: string[];
}

/** Build the compact verdict from a finished set of (trust-annotated) checks. */
export function buildAgentVerdict(args: {
  url: string;
  status: "COMPLETED" | "FAILED";
  healthScore: number;
  techStack: string[];
  checks: PulseScanCheckInput[];
  targetMarkets?: string[];
  detectedMarkets?: JurisdictionCode[];
}): AgentVerdict {
  const { checks } = args;
  const bucket = (b: string) => checks.filter((c) => c.trustBucket === b);
  const confirmed = bucket("CONFIRMED");

  const declared = (args.targetMarkets ?? []).filter(isJurisdictionCode) as JurisdictionCode[];
  const effective = resolveTargetMarkets(declared, args.detectedMarkets ?? []).effective;
  const scorecard = computeComplianceScorecard(checks, effective);

  const rlsCheck = checks.find((c) => c.checkKey === "supabase_rls_enforced");
  const rls = rlsCheck && rlsCheck.status !== "SKIPPED"
    ? { applicable: true, enforced: rlsCheck.status === "PASS", detail: rlsCheck.detail ?? "" }
    : { applicable: false, enforced: null, detail: "No Supabase backend detected." };

  const asIssue = (c: PulseScanCheckInput) => ({
    checkKey: c.checkKey,
    label: c.label,
    category: c.category,
    detail: c.detail ?? "",
  });

  // Ranked worst-first before any truncation.
  //
  // These lists used to be in scan order, which had two consequences on a real client
  // scan: topFixes recommended "README.md" and ".gitignore" ABOVE a finding that the
  // app writes plaintext passwords and auth tokens to the device console (a UK GDPR
  // Art. 32 exposure); and because both lists are capped at 15, an arbitrary 16 of 31
  // warnings were DROPPED — so severity decided nothing and file order decided
  // everything. rankFindings already scores by severity × certainty × category weight
  // (with launch-gates boosted and cosmetic findings damped); it simply was not used
  // here. Ranking before slicing means the cap now removes the least important
  // findings rather than whichever happened to be scanned last.
  const rankedKeys = new Map(
    rankFindings(checks).map((r, i) => [r.check.checkKey, { rank: i, tier: r.priority.tier }]),
  );
  const byPriority = (a: { checkKey: string }, b: { checkKey: string }) =>
    (rankedKeys.get(a.checkKey)?.rank ?? Number.MAX_SAFE_INTEGER) -
    (rankedKeys.get(b.checkKey)?.rank ?? Number.MAX_SAFE_INTEGER);

  const confirmedIssues = confirmed.filter((c) => c.status === "FAIL").map(asIssue).sort(byPriority);
  // Warnings across every bucket except the unprovable ones — a WARN is still a real
  // finding, and omitting them made "all warnings" read as "nothing wrong".
  const warnings = checks
    .filter((c) => c.status === "WARN" && c.trustBucket !== "INCONCLUSIVE")
    .map(asIssue)
    .sort(byPriority);

  const summaryParts = [
    `${args.healthScore}/100`,
    `${confirmedIssues.length} confirmed issue${confirmedIssues.length !== 1 ? "s" : ""}`,
  ];
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
  if (rls.applicable) summaryParts.push(`RLS ${rls.enforced ? "enforced" : "OFF"}`);

  return {
    url: args.url,
    status: args.status,
    healthScore: args.healthScore,
    summary: summaryParts.join(" · "),
    grades: computeGrades(checks),
    techStack: args.techStack,
    counts: {
      confirmed: confirmed.length,
      likely: bucket("LIKELY").length,
      verifiedWorking: bucket("VERIFIED_WORKING").length,
      inconclusive: bucket("INCONCLUSIVE").length,
      failures: confirmedIssues.length,
      warnings: warnings.length,
    },
    confirmedIssues: confirmedIssues.slice(0, 15),
    warnings: warnings.slice(0, 15),
    rls,
    compliance: scorecard.map((e) => ({ jurisdiction: e.jurisdiction, label: e.label, compliancePct: e.compliancePct, missing: e.missing.map((m) => m.label).slice(0, 8) })),
    // Failures first, then warnings — so a scan whose worst findings are warnings
    // still recommends something rather than returning an empty fix list. Both lists
    // are already priority-ranked above, so the top 5 are genuinely the top 5.
    topFixes: [...confirmedIssues, ...warnings].slice(0, 5).map((i) => i.label),
  };
}

/** Run a fresh lite scan for an agent and return the compact verdict. */
export async function runAgentScan(input: { url: string; targetMarkets?: string[] }): Promise<AgentVerdict> {
  const markets = (input.targetMarkets ?? []).filter(isJurisdictionCode) as JurisdictionCode[];
  try {
    const lite = await runLiteScan({
      inputType: "URL",
      url: input.url,
      includePageSpeed: false, // fast + no PSI quota; agents want a quick verdict
      targetMarkets: markets.length > 0 ? markets : undefined,
      // skipUrlGuard left false — external agents must pass the SSRF guard.
    });
    return buildAgentVerdict({
      url: input.url,
      status: "COMPLETED",
      healthScore: lite.healthScore || calculateHealthScore(lite.checks),
      techStack: lite.techStack,
      checks: lite.checks,
      targetMarkets: input.targetMarkets,
      detectedMarkets: lite.detectedMarkets,
    });
  } catch (error) {
    return {
      url: input.url, status: "FAILED", healthScore: 0,
      summary: error instanceof Error ? error.message : "Scan failed.",
      grades: [], techStack: [],
      counts: { confirmed: 0, likely: 0, verifiedWorking: 0, inconclusive: 0, failures: 0, warnings: 0 },
      confirmedIssues: [], warnings: [], rls: { applicable: false, enforced: null, detail: "" }, compliance: [], topFixes: [],
    };
  }
}
