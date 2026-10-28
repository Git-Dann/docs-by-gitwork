"use client";

import type { PulseScanCheckInput, PulseScanCheckRecord, PulseScanRecord } from "@/types/pulse";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { computePillarBreakdown } from "@/server/pulse-checks/pillars";
import { cn } from "@/lib/format";
import { STATUS_LEGEND } from "@/lib/pulse-status-words";

export const actionMenuPanel =
  "z-50 mt-1.5 w-52 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";

export const actionMenuItem =
  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] data-[focus]:text-[var(--text-1)] disabled:opacity-50";

export function groupChecksByCategory(checks: PulseScanCheckRecord[]) {
  const map = new Map<string, PulseScanCheckRecord[]>();
  for (const check of checks) {
    const list = map.get(check.category) ?? [];
    list.push(check);
    map.set(check.category, list);
  }
  return map;
}

/**
 * A category's score, from the same core the headline uses.
 *
 * This is the FALLBACK path — a scan carrying a stored `scoreBreakdown` reads
 * that instead. It used to be a hand-rolled PASS=1 / WARN=0.5 ratio under a
 * comment claiming it matched `calculateHealthScore`. It did not: the real
 * formula weights every check by severity, evidence strength and confidence, and
 * damps checks that share a `controlId` so several views of one signal count
 * once. So a legacy scan's bars could disagree with its own headline number, and
 * with the same bars on a newer scan.
 *
 * Reading `byCategory` rather than `finalScore` is deliberate: it is exactly the
 * arithmetic the stored path does (`earned / possible`), and it avoids
 * `finalScore`'s scan-level caps, which would zero a single category for a
 * reason that has nothing to do with that category.
 */
export function categoryScore(checks: PulseScanCheckRecord[]): number {
  const [row] = computeScoreBreakdown(checks as unknown as PulseScanCheckInput[]).byCategory;
  return row && row.possible > 0 ? Math.round((row.earned / row.possible) * 100) : 0;
}

/**
 * The six pillars, above the 26-category wall.
 *
 * 1,645 checks across 26 categories is a more accurate measurement than any
 * six-bucket rollup and a much worse conversation: a client sees one number and
 * then a list, with no answer to "which part of this is the problem?". This is
 * the answer, and it is a PRESENTATION rollup — `computePillarBreakdown`
 * delegates every check to the same `computeScoreBreakdown` the headline uses, so
 * the two cannot apply different trust rules.
 *
 * Derived at render, never stored: it describes the checks on this page, so a
 * snapshot would be correct exactly once. (Opposite call from Countermark, which
 * freezes because it records what was true at a moment.)
 */
export function PillarStrip({ checks, num }: { checks: PulseScanCheckRecord[]; num: string }) {
  const { pillars, dropped } = computePillarBreakdown(checks as unknown as PulseScanCheckInput[]);
  const scored = pillars.filter((pillar) => pillar.score !== null);
  if (scored.length === 0) return null;

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{`${num} // WHERE IT STANDS`}</span>
        <span className="widget-header-right">
          {dropped.length > 0 ? `${scored.length} of ${pillars.length} apply` : "published weights"}
        </span>
      </div>
      <div className="widget-body">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {scored.map((pillar) => (
            <div key={pillar.key}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="widget-data-label truncate" title={pillar.question}>{pillar.label}</p>
                {/* The weight it ACTUALLY carried, after dropped pillars were
                    redistributed — not the published one, which would be a
                    different number from the one that produced this score. */}
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-4)]">{pillar.effectiveWeight}%</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{pillar.score}</span>
                <span className="font-mono text-[10px] text-[var(--text-4)]">
                  {pillar.pass}/{pillar.pass + pillar.warn + pillar.fail}
                  {pillar.excluded > 0 ? ` · ${pillar.excluded} unscored` : ""}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    (pillar.score ?? 0) >= 75 ? "bg-emerald-500"
                      : (pillar.score ?? 0) >= 50 ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${pillar.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* A dropped pillar is NAMED. Scoring one on nothing, or scoring it zero,
            is the "we could not look" → "it is not there" failure this codebase
            keeps finding. */}
        {dropped.length > 0 && (
          <p className="mt-4 border-t border-[var(--border-2)] pt-3 text-xs text-[var(--text-3)]">
            <span className="widget-data-label">Not assessed</span>{" "}
            {pillars.filter((pillar) => pillar.score === null).map((pillar) => pillar.label).join(" · ")}
            {" — nothing applicable to this project type ran, so their points were shared across the pillars that did apply rather than counting against the score."}
          </p>
        )}
      </div>
    </div>
  );
}

export const FEATURE_LABEL: Record<string, string> = {
  payments: "payments", accounts: "user accounts", saas_multitenant: "multi-tenant SaaS", ecommerce: "a store",
  ai_features: "AI features", sends_email: "outbound email", public_api: "a public API", marketing_content: "marketing content",
  i18n: "multiple languages", user_content: "user content", supabase: "Supabase", firebase: "Firebase",
  mobile_app: "a companion mobile app",
};

/** One sentence: how many checks applied, and why the rest were left out. */
export function describeRelevance(relevance: NonNullable<NonNullable<PulseScanRecord["scoreBreakdown"]>["relevance"]>): string {
  const parts: string[] = [];
  const r = relevance.byReason;
  if (r.not_this_artefact) parts.push(`${r.not_this_artefact} measure something this scan did not look at`);
  if (r.not_this_platform) parts.push(`${r.not_this_platform} do not apply to this kind of product`);
  if (r.feature_absent) {
    const features = Object.entries(relevance.byFeature)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([feature]) => FEATURE_LABEL[feature] ?? feature);
    parts.push(`${r.feature_absent} are about ${features.join(", ")}, which Pulse did not detect`);
  }
  if (r.needs_evidence) parts.push(`${r.needs_evidence} catalogue controls need evidence Pulse cannot collect from outside`);
  if (r.not_applicable) parts.push(`${r.not_applicable} reported themselves not applicable`);
  if (r.withheld) parts.push(`${r.withheld} are withheld — Pulse cannot verify them from what it scanned, or they are being rebuilt after an audit found they could give a wrong answer`);
  return `${relevance.shown} checks apply to this product and are shown. ${relevance.hidden} were left out: ${parts.join("; ")}.`;
}

// Best-effort tech stack: prefer the deterministically-detected stack; when none
// (idea/URL-only/no-repo), fall back to what we CAN infer — the builder platform
// (Lovable/Bolt/v0/Replit/Vercel…) and the AI's inferred infrastructure layers.
// New scans no longer need the builder-evidence fallback below — detectTechStack() in
// pulse-scan.ts now merges the AI-builder detector (Lovable/Bolt/v0/...) directly into the
// persisted techStack. This function stays as a display-layer fallback for scans persisted
// before that fix, where techStack may be non-empty (e.g. ["Cloudflare"]) but missing the
// builder platform entirely.
export function effectiveTechStack(scan: PulseScanRecord): { stack: string[]; inferred: boolean } {
  if (scan.techStack && scan.techStack.length > 0) return { stack: scan.techStack, inferred: false };
  const out: string[] = [];
  const builderEvidence = scan.checks.find((c) => c.checkKey === "vibe_ai_builder")?.evidence;
  if (builderEvidence) out.push(builderEvidence);
  const plat = scan.deployInsights?.platform;
  if (plat && plat !== "other") out.push(plat.charAt(0).toUpperCase() + plat.slice(1));
  const ds = scan.llmAnalysis?.techStackAnalysis?.detectedStack;
  if (ds) {
    for (const k of ["frontend", "backend", "database", "hosting", "auth", "payments"] as const) {
      const v = ds[k];
      if (v && v.trim() && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v.trim());
    }
  }
  return { stack: [...new Set(out)], inferred: true };
}

export type Tab = "overview" | "checks" | "gaps" | "opportunities" | "roadmap" | "readiness" | "stack" | "discovery" | "competitors" | "compliance" | "technical";

/**
 * Four tabs on the page; the older, finer ids still exist so deep links and
 * `setActiveTab("gaps")` from a card keep working. Each maps to the tab it lives in.
 */
export type PrimaryTab = "summary" | "checks" | "plan" | "technical";

export const PRIMARY_OF: Record<Tab, PrimaryTab> = {
  overview: "summary",
  checks: "checks",
  compliance: "checks",
  readiness: "plan",
  // Gaps were AI-written restatements of failing checks; an old deep link lands on the findings.
  gaps: "checks",
  opportunities: "plan",
  roadmap: "plan",
  stack: "plan",
  technical: "technical",
  competitors: "technical",
  discovery: "technical",
};

/** What the status words mean, said once beside the list rather than left to guesswork. */
export function StatusLegend() {
  const dot: Record<string, string> = {
    FAIL: "bg-[var(--danger-500)]",
    WARN: "bg-[var(--warning-500)]",
    INCONCLUSIVE: "bg-[var(--text-4)]",
    NOT_APPLICABLE: "border border-[var(--border-2)]",
  };
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-[8px] border border-[var(--border-2)] px-3 py-2.5 sm:grid-cols-2">
      {STATUS_LEGEND.map((item) => (
        <div key={item.status} className="flex items-start gap-2 text-xs leading-5">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[item.status])} aria-hidden />
          <dt className="shrink-0 font-semibold text-[var(--text-1)]">{item.word}</dt>
          <dd className="text-[var(--text-3)]">{item.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
