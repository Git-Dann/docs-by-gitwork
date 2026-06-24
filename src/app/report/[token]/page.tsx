import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { serializePulseScan, pulseInclude } from "@/server/pulse";
import { DocumentCover, HealthScoreRing } from "@/components/document-cover";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanRecord } from "@/types/pulse";

// A shared report is immutable once the scan completes, so it's cached per token
// (tag `pulse-report-<token>`). The share/unshare route revalidates that tag, and
// a 5-min TTL bounds staleness if a revalidate is ever missed — so an un-shared
// link stops resolving promptly instead of re-querying the DB on every hit.
const loadSharedReport = (token: string): Promise<PulseScanRecord | null> =>
  unstable_cache(
    async () => {
      const record = await prisma.pulseScan.findUnique({
        where: { shareToken: token, isShared: true },
        include: pulseInclude,
      });
      return record ? serializePulseScan(record) : null;
    },
    ["pulse-report", token],
    { tags: [`pulse-report-${token}`], revalidate: 300 },
  )();

// ─── Domain groupings ────────────────────────────────────────────────────────

const DOMAIN_DEFS = [
  { label: "Infrastructure & DevOps",   categories: ["Infrastructure", "Observability", "Performance"] },
  { label: "Security & Authentication", categories: ["Security", "Authentication", "Payments"] },
  { label: "Code Quality",              categories: ["Code Quality"] },
  { label: "Legal & Compliance",        categories: ["Legal & Compliance"] },
  { label: "Production Readiness",      categories: ["SaaS Readiness", "Missing Pages"] },
  { label: "SEO & Presence",            categories: ["SEO", "Store Listing", "Trust & Brand", "Global Distribution"] },
  { label: "Mobile & Accessibility",    categories: ["Mobile & Accessibility", "App Store & Mobile", "Accessibility"] },
  { label: "Roles & Permissions",       categories: ["Roles & Permissions"] },
  { label: "Email Deliverability",      categories: ["Email Deliverability"] },
  { label: "Business Operations",       categories: ["Business Operations"] },
  { label: "API Quality",               categories: ["API Quality"] },
];

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scan = await loadSharedReport(token);
  // Share links are private — never let them get indexed.
  const robots = { index: false, follow: false } as const;
  if (!scan) return { title: "Report not found — Gitwork Pulse", robots };
  return {
    title: `${scan.projectName} — Gitwork Pulse Report`,
    description: `Technical audit for ${scan.projectName}. Health score: ${scan.healthScore ?? "—"}/100. Powered by Gitwork Pulse.`,
    robots,
  };
}

// ─── Components ─────────────────────────────────────────────────────────────

// Score ring now lives in `@/components/document-cover` as `HealthScoreRing` so that the
// Pulse internal report and the public share render the exact same visual.

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cls =
    urgency === "CRITICAL" ? "bg-red-100 text-red-700 border-red-200"
    : urgency === "HIGH"   ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {urgency}
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  return (
    <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
      {effort}
    </span>
  );
}

function ValueBadge({ value }: { value: string }) {
  const cls = value === "HIGH" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : value === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
      {value}
    </span>
  );
}

function VitalsGrid({ insights }: { insights: NonNullable<PulseScanRecord["browserInsights"]> }) {
  const fmt = (ms: number | null) => ms !== null ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`) : "—";
  const lcpStatus = (insights.lcp ?? 99999) <= 2500 ? "good" : (insights.lcp ?? 99999) <= 4000 ? "ok" : "poor";
  const fcpStatus = (insights.fcp ?? 99999) <= 1800 ? "good" : (insights.fcp ?? 99999) <= 3000 ? "ok" : "poor";
  const tbtStatus = (insights.tbt ?? 99999) <= 200  ? "good" : (insights.tbt ?? 99999) <= 600  ? "ok" : "poor";
  const clsStatus = (insights.cls ?? 99)    <= 0.1  ? "good" : (insights.cls ?? 99)    <= 0.25 ? "ok" : "poor";
  const metricColor = (s: string) => s === "good" ? "text-emerald-600" : s === "ok" ? "text-amber-500" : "text-red-500";
  const scoreColor  = (s: number | null) => !s ? "text-gray-400" : s >= 90 ? "text-emerald-600" : s >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBg     = (s: number | null) => !s ? "bg-gray-50 border-gray-200" : s >= 90 ? "bg-emerald-50 border-emerald-200" : s >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">WEB VITALS</span>
        <span className="widget-header-right">Lighthouse · mobile</span>
      </div>
      <div className="widget-body-compact">
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[
          { label: "Performance",    score: insights.performanceScore },
          { label: "Accessibility",  score: insights.accessibilityScore },
          { label: "SEO",            score: insights.seoScore },
          { label: "Best practices", score: insights.bestPracticesScore },
        ].map(({ label, score }) => (
          <div key={label} className={cn("flex flex-col items-center gap-1 rounded-[10px] border p-3", scoreBg(score))}>
            <span className={cn("text-xl font-bold tabular-nums", scoreColor(score))}>{score ?? "—"}</span>
            <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
          </div>
        ))}
      </div>
      {(insights.lcp !== null || insights.fcp !== null || insights.tbt !== null || insights.cls !== null) && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {insights.lcp !== null && (
            <div className="flex items-center justify-between rounded-[6px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">LCP</span>
              <span className={cn("font-bold", metricColor(lcpStatus))}>{fmt(insights.lcp)}</span>
            </div>
          )}
          {insights.fcp !== null && (
            <div className="flex items-center justify-between rounded-[6px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">FCP</span>
              <span className={cn("font-bold", metricColor(fcpStatus))}>{fmt(insights.fcp)}</span>
            </div>
          )}
          {insights.tbt !== null && (
            <div className="flex items-center justify-between rounded-[6px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">TBT</span>
              <span className={cn("font-bold", metricColor(tbtStatus))}>{fmt(insights.tbt)}</span>
            </div>
          )}
          {insights.cls !== null && (
            <div className="flex items-center justify-between rounded-[6px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">CLS</span>
              <span className={cn("font-bold", metricColor(clsStatus))}>{insights.cls.toFixed(3)}</span>
            </div>
          )}
        </div>
      )}
      {insights.cruxCategory && (
        <p className="mt-3 text-xs text-[var(--text-4)]">
          Real-user experience (Chrome UX Report):{" "}
          <span className={cn(
            "font-semibold",
            insights.cruxCategory === "FAST" ? "text-emerald-600"
            : insights.cruxCategory === "AVERAGE" ? "text-amber-500"
            : "text-red-500",
          )}>
            {insights.cruxCategory.toLowerCase()}
          </span>
        </p>
      )}
      </div>
    </div>
  );
}

function CategorySummary({ checks }: { checks: PulseScanRecord["checks"] }) {
  // Build per-category stats
  const byCategory = new Map<string, { pass: number; warn: number; fail: number }>();
  for (const check of checks) {
    if (check.status === "SKIPPED") continue;
    const s = byCategory.get(check.category) ?? { pass: 0, warn: 0, fail: 0 };
    if (check.status === "PASS") s.pass++;
    else if (check.status === "WARN") s.warn++;
    else if (check.status === "FAIL") s.fail++;
    byCategory.set(check.category, s);
  }

  // Group by domain
  const assignedCats = new Set<string>();
  const domainGroups = DOMAIN_DEFS.map((def) => {
    const cats = def.categories
      .filter((cat) => byCategory.has(cat))
      .map((cat) => { assignedCats.add(cat); return { name: cat, stats: byCategory.get(cat)! }; })
      .sort((a, b) => (b.stats.fail + b.stats.warn) - (a.stats.fail + a.stats.warn));
    return { label: def.label, categories: cats };
  }).filter((d) => d.categories.length > 0);

  // Catch-all for any unassigned categories
  const otherCats = [...byCategory.entries()]
    .filter(([cat]) => !assignedCats.has(cat))
    .map(([name, stats]) => ({ name, stats }))
    .sort((a, b) => (b.stats.fail + b.stats.warn) - (a.stats.fail + a.stats.warn));

  const renderCategoryCard = (name: string, stats: { pass: number; warn: number; fail: number }) => {
    const total = stats.pass + stats.warn + stats.fail;
    const score = total > 0 ? Math.round(((stats.pass + stats.warn * 0.5) / total) * 100) : 100;
    const tone = score >= 75 ? "border-emerald-200 bg-emerald-50"
      : score >= 50 ? "border-amber-200 bg-amber-50"
      : "border-red-200 bg-red-50";
    return (
      <div key={name} className={cn("flex items-center justify-between rounded-[10px] border px-3 py-2.5", tone)}>
        <span className="min-w-0 text-sm font-medium text-gray-700 [overflow-wrap:break-word]">{name}</span>
        <div className="ml-3 flex shrink-0 items-center gap-2 text-xs">
          {stats.pass > 0 && <span className="flex items-center gap-1 text-emerald-700"><CheckCircleIcon className="h-3.5 w-3.5" />{stats.pass}</span>}
          {stats.warn > 0 && <span className="flex items-center gap-1 text-amber-700"><ExclamationTriangleIcon className="h-3.5 w-3.5" />{stats.warn}</span>}
          {stats.fail > 0 && <span className="flex items-center gap-1 text-red-700"><XCircleIcon className="h-3.5 w-3.5" />{stats.fail}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {[...domainGroups, ...(otherCats.length > 0 ? [{ label: "Other", categories: otherCats }] : [])].map((domain, di) => {
        const domainPass  = domain.categories.reduce((s, c) => s + c.stats.pass, 0);
        const domainWarn  = domain.categories.reduce((s, c) => s + c.stats.warn, 0);
        const domainFail  = domain.categories.reduce((s, c) => s + c.stats.fail, 0);
        const domainTotal = domainPass + domainWarn + domainFail;
        const domainPct   = domainTotal > 0 ? Math.round((domainPass / domainTotal) * 100) : 100;
        const barColor    = domainPct >= 80 ? "bg-emerald-500" : domainPct >= 50 ? "bg-amber-500" : "bg-red-500";
        const scoreColor  = domainPct >= 80 ? "text-emerald-600" : domainPct >= 50 ? "text-amber-600" : "text-red-600";
        const idx         = String(di + 1).padStart(2, "0");
        return (
          <div key={domain.label}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
                {`${idx} // ${domain.label}`}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                  <div className={cn("h-full rounded-full", barColor)} style={{ width: `${domainPct}%` }} />
                </div>
                <span className={cn("text-xs font-bold tabular-nums", scoreColor)}>{domainPct}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {domain.categories.map(({ name, stats }) => renderCategoryCard(name, stats))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const scan = await loadSharedReport(token);
  if (!scan) notFound();

  const llm = scan.llmAnalysis;
  const inputRef = scan.inputUrl ?? (scan.inputGithubRepo ? `github.com/${scan.inputGithubRepo}` : null);

  // Build the 4-up stat strip — same colours/labels the internal report uses so the two
  // surfaces feel like one product
  const passCount = scan.checks.filter((c) => c.status === "PASS").length;
  const warnCount = scan.checks.filter((c) => c.status === "WARN").length;
  const failCount = scan.checks.filter((c) => c.status === "FAIL").length;
  const skipCount = scan.checks.filter((c) => c.status === "SKIPPED").length;
  const coverStats = [
    { count: passCount, label: "Passing", color: "#16A34A", bg: "#F0FDF4" },
    { count: warnCount, label: "Warnings", color: "#D97706", bg: "#FFFBEB" },
    { count: failCount, label: "Failed", color: "#DC2626", bg: "#FEF2F2" },
    ...(skipCount > 0
      ? [{ count: skipCount, label: "Skipped", color: "#9CA3AF", bg: "#F9FAFB" }]
      : []),
  ];

  const meta: Array<{ label: string; value: string }> = [];
  if (llm?.projectClassification?.type) {
    meta.push({
      label: "Type",
      value: `${llm.projectClassification.type}${llm.projectClassification.subtype ? ` · ${llm.projectClassification.subtype}` : ""}`,
    });
  }
  if (scan.completedAt) {
    meta.push({ label: "Scanned", value: formatDate(scan.completedAt) });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl">
        {/* ═══════════════════════ COVER ═══════════════════════ */}
        <DocumentCover
          eyebrow="PULSE // PROJECT HEALTH REPORT"
          title={scan.projectName}
          subtitle={inputRef ?? undefined}
          meta={meta}
          rightSlot={<HealthScoreRing score={scan.healthScore ?? 0} />}
          stats={coverStats}
          executiveSummary={llm?.executiveSummary ?? undefined}
          callout={llm?.proposalHook ? { text: llm.proposalHook, tone: "blue" } : undefined}
          dated={scan.completedAt ? `Scanned ${formatDate(scan.completedAt)}` : "Recent"}
          variant="screen"
        />
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">

        {/* Tech stack */}
        {scan.techStack && scan.techStack.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">01 // TECH STACK</span>
              <span className="widget-header-right">{scan.techStack.length} detected</span>
            </div>
            <div className="widget-body-compact">
              <div className="flex flex-wrap gap-1.5">
                {scan.techStack.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Compliance by market */}
        {scan.complianceScorecard && scan.complianceScorecard.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">COMPLIANCE BY MARKET</span>
              <span className="widget-header-right">
                {scan.complianceScorecard.reduce((n, e) => n + e.failing, 0)} requirements outstanding
              </span>
            </div>
            <div className="widget-body space-y-4">
              {scan.complianceScorecard.map((entry) => {
                const tone = entry.compliancePct >= 80 ? "text-emerald-600" : entry.compliancePct >= 50 ? "text-amber-600" : "text-red-600";
                return (
                  <div key={entry.jurisdiction}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--text-1)]">{entry.label} · {entry.primaryLaw}</span>
                      <span className={cn("text-xs font-bold tabular-nums", tone)}>{entry.compliancePct}% · {entry.passing}/{entry.requiredChecks}</span>
                    </div>
                    {entry.missing.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {entry.missing.map((m) => (
                          <li key={m.checkKey} className="text-xs leading-5 text-[var(--text-3)]">• {m.label}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Core Web Vitals */}
        {scan.browserInsights && <VitalsGrid insights={scan.browserInsights} />}

        {/* Health narrative */}
        {llm?.healthNarrative && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">02 // HEALTH SUMMARY</span>
            </div>
            <div className="widget-body">
              <p className="text-sm leading-relaxed text-[var(--text-2)] [overflow-wrap:break-word]">{llm.healthNarrative}</p>
            </div>
          </div>
        )}

        {/* Production blockers */}
        {llm?.productionBlockers && (llm.productionBlockers as Array<{blocker:string;why:string;urgency:string;category:string;recommendedService?:string}>).length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">03 // PRODUCTION BLOCKERS</span>
              <span className="widget-header-right" style={{ color: "#dc2626" }}>
                {(llm.productionBlockers as Array<{urgency:string}>).filter((b) => b.urgency === "CRITICAL").length} critical
              </span>
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {(llm.productionBlockers as Array<{blocker:string;why:string;urgency:string;category:string;recommendedService?:string}>).map((blocker, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  <XCircleIcon className={cn("mt-0.5 h-4 w-4 shrink-0", blocker.urgency === "CRITICAL" ? "text-red-500" : "text-orange-400")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)] [overflow-wrap:break-word]">{blocker.blocker}</p>
                      <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase", blocker.urgency === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700")}>
                        {blocker.urgency}
                      </span>
                      {blocker.recommendedService && (
                        <span className="rounded-[4px] bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">→ {blocker.recommendedService}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{blocker.why}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Check categories — domain-grouped */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">04 // AUTOMATED CHECKS</span>
            <span className="widget-header-right">{scan.checks.filter((c) => c.status !== "SKIPPED").length} checks</span>
          </div>
          <div className="widget-body">
            <CategorySummary checks={scan.checks} />
          </div>
        </div>

        {/* Critical gaps */}
        {llm?.criticalGaps && llm.criticalGaps.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">05 // CRITICAL GAPS</span>
              <span className="widget-header-right">{llm.criticalGaps.length} identified</span>
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {llm.criticalGaps.map((gap, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-1)] [overflow-wrap:break-word]">{gap.gap}</span>
                      <UrgencyBadge urgency={gap.urgency} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{gap.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        {llm?.strengths && llm.strengths.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">06 // STRENGTHS</span>
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {llm.strengths.slice(0, 4).map((s, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)] [overflow-wrap:break-word]">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Build opportunities */}
        {llm?.buildOpportunities && llm.buildOpportunities.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">07 // BUILD OPPORTUNITIES</span>
              <span className="widget-header-right">{llm.buildOpportunities.length} identified</span>
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {llm.buildOpportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-1)] [overflow-wrap:break-word]">{opp.title}</span>
                      <EffortBadge effort={opp.estimatedEffort} />
                      <ValueBadge value={opp.businessValue} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{opp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {llm?.scalingRoadmap && llm.scalingRoadmap.length > 0 && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">08 // BUILD ROADMAP</span>
              <span className="widget-header-right">{llm.scalingRoadmap.length} phases</span>
            </div>
            <div className="widget-body space-y-4">
              {llm.scalingRoadmap.map((phase) => (
                <div key={phase.phase} className="flex gap-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-gray-900 text-xs font-bold text-white">
                    {phase.phase}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)] [overflow-wrap:break-word]">{phase.title}</p>
                      <span className="text-xs text-[var(--text-4)]">{phase.duration}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {phase.goals.map((g, gi) => (
                        <li key={gi} className="text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">· {g}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div className="rounded-[10px] border border-gray-900 bg-gray-900 p-6 text-center">
          <p className="text-sm font-semibold text-white">Want to act on this report?</p>
          <p className="mt-1 text-sm text-gray-400">
            Gitwork specialises in taking AI-built apps from prototype to production.
          </p>
          <div className="mt-4">
            <Link
              href="https://gitwork.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[10px] bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              Talk to Gitwork
            </Link>
          </div>
          <p className="mt-4 text-[10px] text-gray-600">
            Powered by <span className="font-medium text-gray-400">Gitwork Pulse</span> — from prompt to production.
          </p>
        </div>

      </div>
    </div>
  );
}
