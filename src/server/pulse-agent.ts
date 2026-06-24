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
import type { PulseScanCheckInput } from "@/types/pulse";

export interface AgentVerdict {
  url: string;
  status: "COMPLETED" | "FAILED";
  healthScore: number;
  summary: string;
  grades: PulseGrade[];
  techStack: string[];
  counts: { confirmed: number; likely: number; verifiedWorking: number; inconclusive: number };
  confirmedIssues: { checkKey: string; label: string; category: string; detail: string }[];
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

  const confirmedIssues = confirmed
    .filter((c) => c.status === "FAIL")
    .map((c) => ({ checkKey: c.checkKey, label: c.label, category: c.category, detail: c.detail ?? "" }));

  return {
    url: args.url,
    status: args.status,
    healthScore: args.healthScore,
    summary: `${args.healthScore}/100 · ${confirmedIssues.length} confirmed issue${confirmedIssues.length !== 1 ? "s" : ""}${rls.applicable ? ` · RLS ${rls.enforced ? "enforced" : "OFF"}` : ""}`,
    grades: computeGrades(checks),
    techStack: args.techStack,
    counts: {
      confirmed: confirmed.length,
      likely: bucket("LIKELY").length,
      verifiedWorking: bucket("VERIFIED_WORKING").length,
      inconclusive: bucket("INCONCLUSIVE").length,
    },
    confirmedIssues: confirmedIssues.slice(0, 15),
    rls,
    compliance: scorecard.map((e) => ({ jurisdiction: e.jurisdiction, label: e.label, compliancePct: e.compliancePct, missing: e.missing.map((m) => m.label).slice(0, 8) })),
    topFixes: confirmedIssues.slice(0, 5).map((i) => i.label),
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
      grades: [], techStack: [], counts: { confirmed: 0, likely: 0, verifiedWorking: 0, inconclusive: 0 },
      confirmedIssues: [], rls: { applicable: false, enforced: null, detail: "" }, compliance: [], topFixes: [],
    };
  }
}
