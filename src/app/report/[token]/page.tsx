import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  SignalIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { prisma } from "@/lib/prisma";
import { serializePulseScan, pulseInclude } from "@/server/pulse";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanRecord } from "@/types/pulse";

export const dynamic = "force-dynamic";

// ─── Domain groupings ────────────────────────────────────────────────────────

const DOMAIN_DEFS = [
  { label: "Infrastructure & DevOps",   categories: ["Infrastructure", "Observability", "Performance"] },
  { label: "Security & Authentication", categories: ["Security", "Authentication", "Payments"] },
  { label: "Code Quality",              categories: ["Code Quality"] },
  { label: "Legal & Compliance",        categories: ["Legal & Compliance"] },
  { label: "Production Readiness",      categories: ["SaaS Readiness", "Missing Pages"] },
  { label: "SEO & Presence",            categories: ["SEO", "Store Listing", "Trust & Brand", "Global Distribution"] },
  { label: "Mobile & Accessibility",    categories: ["Mobile & Accessibility", "App Store & Mobile", "Accessibility"] },
];

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await prisma.pulseScan.findUnique({
    where: { shareToken: token, isShared: true },
    select: { projectName: true, healthScore: true },
  });
  if (!record) return { title: "Report not found — Gitwork Pulse" };
  return {
    title: `${record.projectName} — Gitwork Pulse Report`,
    description: `Technical audit for ${record.projectName}. Health score: ${record.healthScore ?? "—"}/100. Powered by Gitwork Pulse.`,
  };
}

// ─── Components ─────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const color = value >= 75 ? "text-emerald-600" : value >= 50 ? "text-amber-500" : "text-red-500";
  const ring = value >= 75 ? "border-emerald-400" : value >= 50 ? "border-amber-400" : "border-red-400";
  const label = value >= 75 ? "Good" : value >= 50 ? "Needs work" : "At risk";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("flex h-28 w-28 items-center justify-center rounded-full border-8", ring)}>
        <div className="text-center">
          <span className={cn("block text-3xl font-bold tabular-nums", color)}>{value}</span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>
      <span className={cn(
        "rounded-full px-3 py-0.5 text-xs font-semibold",
        value >= 75 ? "bg-emerald-100 text-emerald-700"
        : value >= 50 ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700",
      )}>
        {label}
      </span>
    </div>
  );
}

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
    <div className="overflow-hidden rounded-[10px] border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Core Web Vitals</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-500">Lighthouse · mobile</span>
      </div>
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
        <p className="mt-3 text-xs text-gray-400">
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
    <div className="space-y-6">
      {domainGroups.map((domain) => (
        <div key={domain.label}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{domain.label}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {domain.categories.map(({ name, stats }) => renderCategoryCard(name, stats))}
          </div>
        </div>
      ))}
      {otherCats.length > 0 && (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Other</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherCats.map(({ name, stats }) => renderCategoryCard(name, stats))}
          </div>
        </div>
      )}
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

  const record = await prisma.pulseScan.findUnique({
    where: { shareToken: token, isShared: true },
    include: pulseInclude,
  });

  if (!record) notFound();

  const scan = serializePulseScan(record);
  const llm = scan.llmAnalysis;
  const inputRef = scan.inputUrl ?? (scan.inputGithubRepo ? `github.com/${scan.inputGithubRepo}` : null);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-900">
              <SignalIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400">Gitwork Pulse · Technical Audit</p>
              <h1 className="truncate text-lg font-semibold text-gray-900">{scan.projectName}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">

        {/* Score hero */}
        <div className="overflow-hidden rounded-[10px] border border-gray-200 bg-white p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={scan.healthScore} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {llm?.projectClassification?.type && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {llm.projectClassification.type}
                    {llm.projectClassification.subtype ? ` · ${llm.projectClassification.subtype}` : ""}
                  </span>
                )}
                {inputRef && (
                  <a
                    href={scan.inputUrl ?? `https://github.com/${scan.inputGithubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 hover:bg-gray-200 [overflow-wrap:break-word]"
                  >
                    {inputRef}
                  </a>
                )}
              </div>
              {llm?.executiveSummary && (
                <p className="mt-3 text-sm leading-relaxed text-gray-600 [overflow-wrap:break-word]">{llm.executiveSummary}</p>
              )}
              {scan.techStack && scan.techStack.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {scan.techStack.map((t) => (
                    <span key={t} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {scan.completedAt && (
                <p className="mt-3 text-xs text-gray-400">Scanned {formatDate(scan.completedAt)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Proposal hook */}
        {llm?.proposalHook && (
          <div className="rounded-[10px] border border-indigo-200 bg-indigo-50 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Key finding</p>
            <p className="mt-1.5 text-base font-medium leading-snug text-indigo-900 [overflow-wrap:break-word]">{llm.proposalHook}</p>
          </div>
        )}

        {/* Core Web Vitals */}
        {scan.browserInsights && <VitalsGrid insights={scan.browserInsights} />}

        {/* Health narrative */}
        {llm?.healthNarrative && (
          <div className="rounded-[10px] border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Health summary</h2>
            <p className="text-sm leading-relaxed text-gray-600 [overflow-wrap:break-word]">{llm.healthNarrative}</p>
          </div>
        )}

        {/* Check categories — domain-grouped */}
        <div className="rounded-[10px] border border-gray-200 bg-white p-6">
          <h2 className="mb-5 text-sm font-semibold text-gray-700">Automated check results</h2>
          <CategorySummary checks={scan.checks} />
        </div>

        {/* Critical gaps */}
        {llm?.criticalGaps && llm.criticalGaps.length > 0 && (
          <div className="rounded-[10px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Critical gaps to address</h2>
            <div className="space-y-3">
              {llm.criticalGaps.map((gap, i) => (
                <div key={i} className="flex gap-3">
                  <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 [overflow-wrap:break-word]">{gap.gap}</span>
                      <UrgencyBadge urgency={gap.urgency} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500 [overflow-wrap:break-word]">{gap.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        {llm?.strengths && llm.strengths.length > 0 && (
          <div className="rounded-[10px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">What&apos;s working well</h2>
            <div className="space-y-3">
              {llm.strengths.slice(0, 4).map((s, i) => (
                <div key={i} className="flex gap-3">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 [overflow-wrap:break-word]">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500 [overflow-wrap:break-word]">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Build opportunities */}
        {llm?.buildOpportunities && llm.buildOpportunities.length > 0 && (
          <div className="rounded-[10px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Build opportunities</h2>
            <div className="space-y-3">
              {llm.buildOpportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-3">
                  <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 [overflow-wrap:break-word]">{opp.title}</span>
                      <EffortBadge effort={opp.estimatedEffort} />
                      <ValueBadge value={opp.businessValue} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500 [overflow-wrap:break-word]">{opp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {llm?.scalingRoadmap && llm.scalingRoadmap.length > 0 && (
          <div className="rounded-[10px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Recommended roadmap</h2>
            <div className="space-y-5">
              {llm.scalingRoadmap.map((phase) => (
                <div key={phase.phase} className="flex gap-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                    {phase.phase}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 [overflow-wrap:break-word]">{phase.title}</p>
                      <span className="text-xs text-gray-400">{phase.duration}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {phase.goals.map((g, gi) => (
                        <li key={gi} className="text-xs leading-relaxed text-gray-500 [overflow-wrap:break-word]">· {g}</li>
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
