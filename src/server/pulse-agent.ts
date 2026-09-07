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
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { collectorCoverage } from "@/server/pulse-checks/collector-health";
import { evaluateReleaseGate, gatePolicyById, withScanIncomplete } from "@/server/pulse-checks/release-decision";
import type { PulseScanCheckInput, GateEvaluationRecord, ScoreBreakdown } from "@/types/pulse";

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
  /**
   * ⚠️ Registry labels are ASSERTIONS OF THE DESIRED STATE ("Database queries are
   * parameterised", "WebView JavaScript is not enabled for remote content"). This
   * field used to be `.map((i) => i.label)`, so for a FAILING check it handed the
   * caller a statement that the thing was already correct — the exact inverse of
   * the finding, on what is Pulse's most agent-visible surface (the MCP
   * `pulse_scan` / `pulse_scan_result` tools return this verbatim).
   *
   * It now carries the check's `detail`, which for a non-passing check is the
   * evidence plus the remediation prose, and only falls back to the label when a
   * check emitted no detail at all. Kept as `string[]` so the MCP contract does
   * not break; read `topIssues` for the structured form.
   */
  topFixes: string[];
  /**
   * The same top findings, structured — so a caller never has to parse prose to
   * learn which check fired. `problem` is deliberately NOT the registry label,
   * for the reason documented on `topFixes` above.
   */
  topIssues: { checkKey: string; category: string; problem: string; evidence: string }[];
  /**
   * The release decision. This is what a CI gate should exit on — the score and
   * the issue counts are inputs to it, not substitutes for it. Always present:
   * a scan that failed outright still gets an INCONCLUSIVE rather than nothing,
   * because an absent decision is too easily read as consent.
   */
  gate: GateEvaluationRecord;
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
  /**
   * Collector coverage from the run. Absent when rebuilding a verdict from a
   * stored scan, which costs the "a required collector never ran" reason but
   * never invents one — a missing input must not become a clean bill.
   */
  collectors?: ScoreBreakdown["collectors"];
  /** Which bar to judge against. Falls back to the general launch policy. */
  gatePolicyId?: string;
  /** Why the scan did not finish. Carried into both the summary and the gate. */
  failureReason?: string;
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

  // Failures first, then warnings, already priority-ranked — so the top 5 are the
  // top 5 by severity, and a scan whose worst findings are all warnings still
  // returns something rather than an empty list.
  const topFindings = [...confirmedIssues, ...warnings].slice(0, 5);

  const summaryParts = [
    args.failureReason ?? `${args.healthScore}/100`,
    `${confirmedIssues.length} confirmed issue${confirmedIssues.length !== 1 ? "s" : ""}`,
  ];
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
  if (rls.applicable) summaryParts.push(`RLS ${rls.enforced ? "enforced" : "OFF"}`);

  // The gate is derived from the SAME checks this verdict describes, so the
  // decision and the issue lists can never tell an agent two different stories.
  const policy = gatePolicyById(args.gatePolicyId);
  const evaluated = evaluateReleaseGate(
    checks,
    { ...computeScoreBreakdown(checks), collectors: args.collectors },
    policy,
  );
  const gate = args.status === "FAILED"
    ? withScanIncomplete(evaluated, args.failureReason ?? "Pulse reported the scan as FAILED.")
    : evaluated;

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
    // `detail`, never `label` — see the AgentVerdict.topFixes doc comment. A label
    // asserts the state we WANT, so emitting it for a failing check told the caller
    // the opposite of what was found.
    topFixes: topFindings.map((i) => (i.detail.trim() ? i.detail : i.label)),
    topIssues: topFindings.map((i) => ({
      checkKey: i.checkKey,
      category: i.category,
      problem: i.detail.trim() ? i.detail : i.label,
      evidence: i.detail,
    })),
    gate,
  };
}

/** Run a fresh lite scan for an agent and return the compact verdict. */
export async function runAgentScan(input: {
  url: string;
  targetMarkets?: string[];
  gatePolicyId?: string;
}): Promise<AgentVerdict> {
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
      collectors: collectorCoverage(lite.collectorExecutions),
      gatePolicyId: input.gatePolicyId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Scan failed.";
    // A scan that never ran cannot clear a gate. Returning no decision at all
    // would leave a CI script to invent one, and the convenient invention is
    // "nothing failed, therefore ship". Built through buildAgentVerdict so the
    // failure path cannot drift from the rules the success path obeys.
    return buildAgentVerdict({
      url: input.url,
      status: "FAILED",
      healthScore: 0,
      techStack: [],
      checks: [],
      gatePolicyId: input.gatePolicyId,
      failureReason: reason,
    });
  }
}
