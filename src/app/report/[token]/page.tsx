"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import type { PulseCriticalGap, PulseScalingPhase } from "@/types/pulse";
import { cn, formatDate } from "@/lib/format";

interface BrowserInsights {
  performanceScore: number | null;
  accessibilityScore: number | null;
  seoScore: number | null;
  bestPracticesScore: number | null;
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  tbt: number | null;
  cruxCategory: string | null;
}

interface PublicScan {
  id: string;
  projectName: string;
  inputType: string;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  healthScore: number | null;
  techStack: string[] | null;
  completedAt: string | null;
  browserInsights: BrowserInsights | null;
  llmAnalysis: {
    projectClassification: { type: string; subtype: string | null };
    executiveSummary: string;
    healthNarrative: string;
    strengths: { title: string; detail: string }[];
    criticalGaps: PulseCriticalGap[];
    scalingRoadmap: PulseScalingPhase[];
    techStackAnalysis: { detectedStack: Record<string, string | null>; assessment: string };
  } | null;
  checks: { category: string; status: string; checkKey: string; label: string; detail: string | null }[];
}

function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const color = value >= 75 ? "text-emerald-600" : value >= 50 ? "text-amber-500" : "text-red-500";
  const ring = value >= 75 ? "border-emerald-400" : value >= 50 ? "border-amber-400" : "border-red-400";
  return (
    <div className={cn("flex h-28 w-28 items-center justify-center rounded-full border-8", ring)}>
      <div className="text-center">
        <span className={cn("block text-3xl font-bold tabular-nums", color)}>{value}</span>
        <span className="text-xs text-gray-400">/100</span>
      </div>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cls =
    urgency === "CRITICAL"
      ? "bg-red-100 text-red-700 border-red-200"
      : urgency === "HIGH"
        ? "bg-orange-100 text-orange-700 border-orange-200"
        : "bg-amber-100 text-amber-700 border-amber-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {urgency}
    </span>
  );
}

function VitalsRow({ label, score }: { label: string; score: number | null }) {
  const color = score === null ? "text-gray-400" : score >= 90 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-red-500";
  const bg = score === null ? "bg-gray-50 border-gray-200" : score >= 90 ? "bg-emerald-50 border-emerald-200" : score >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-[10px] border p-3", bg)}>
      <span className={cn("text-xl font-bold tabular-nums", color)}>{score ?? "—"}</span>
      <span className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  );
}

function WebVitalsSection({ insights }: { insights: BrowserInsights }) {
  const fmt = (ms: number | null) => ms !== null ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`) : "—";
  const lcpStatus = (insights.lcp ?? 99999) <= 2500 ? "good" : (insights.lcp ?? 99999) <= 4000 ? "needs improvement" : "poor";
  const fcpStatus = (insights.fcp ?? 99999) <= 1800 ? "good" : (insights.fcp ?? 99999) <= 3000 ? "needs improvement" : "poor";
  const tbtStatus = (insights.tbt ?? 99999) <= 200 ? "good" : (insights.tbt ?? 99999) <= 600 ? "needs improvement" : "poor";
  const clsStatus = (insights.cls ?? 99) <= 0.1 ? "good" : (insights.cls ?? 99) <= 0.25 ? "needs improvement" : "poor";
  const metricColor = (s: string) => s === "good" ? "text-emerald-600" : s === "needs improvement" ? "text-amber-500" : "text-red-500";

  return (
    <div className="overflow-hidden rounded-[16px] border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Core Web Vitals</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-500">Lighthouse · mobile</span>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        <VitalsRow label="Performance" score={insights.performanceScore} />
        <VitalsRow label="Accessibility" score={insights.accessibilityScore} />
        <VitalsRow label="SEO" score={insights.seoScore} />
        <VitalsRow label="Best practices" score={insights.bestPracticesScore} />
      </div>
      {(insights.lcp !== null || insights.fcp !== null || insights.tbt !== null || insights.cls !== null) && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {insights.lcp !== null && (
            <div className="flex items-center justify-between rounded-[8px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">LCP</span>
              <span className={cn("font-bold", metricColor(lcpStatus))}>{fmt(insights.lcp)}</span>
            </div>
          )}
          {insights.fcp !== null && (
            <div className="flex items-center justify-between rounded-[8px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">FCP</span>
              <span className={cn("font-bold", metricColor(fcpStatus))}>{fmt(insights.fcp)}</span>
            </div>
          )}
          {insights.tbt !== null && (
            <div className="flex items-center justify-between rounded-[8px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">TBT</span>
              <span className={cn("font-bold", metricColor(tbtStatus))}>{fmt(insights.tbt)}</span>
            </div>
          )}
          {insights.cls !== null && (
            <div className="flex items-center justify-between rounded-[8px] bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-500">CLS</span>
              <span className={cn("font-bold", metricColor(clsStatus))}>{insights.cls.toFixed(3)}</span>
            </div>
          )}
        </div>
      )}
      {insights.cruxCategory && (
        <p className="mt-3 text-xs text-gray-400">
          Chrome UX Report (real users):{" "}
          <span className={cn("font-semibold",
            insights.cruxCategory === "FAST" ? "text-emerald-600" : insights.cruxCategory === "AVERAGE" ? "text-amber-500" : "text-red-500",
          )}>
            {insights.cruxCategory.toLowerCase()}
          </span>
        </p>
      )}
    </div>
  );
}

function CategorySummary({ checks }: { checks: PublicScan["checks"] }) {
  const byCategory = new Map<string, { pass: number; warn: number; fail: number }>();
  for (const check of checks) {
    const s = byCategory.get(check.category) ?? { pass: 0, warn: 0, fail: 0 };
    if (check.status === "PASS") s.pass++;
    else if (check.status === "WARN") s.warn++;
    else if (check.status === "FAIL") s.fail++;
    byCategory.set(check.category, s);
  }

  const categories = [...byCategory.entries()]
    .filter(([, s]) => s.pass + s.warn + s.fail > 0)
    .sort(([, a], [, b]) => (b.fail + b.warn) - (a.fail + a.warn));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {categories.slice(0, 8).map(([category, s]) => {
        const total = s.pass + s.warn + s.fail;
        const score = Math.round(((s.pass + s.warn * 0.5) / total) * 100);
        const tone = score >= 75 ? "border-emerald-200 bg-emerald-50" : score >= 50 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
        return (
          <div key={category} className={cn("flex items-center justify-between rounded-[10px] border px-3 py-2.5", tone)}>
            <span className="text-sm font-medium text-gray-700">{category}</span>
            <div className="flex items-center gap-2 text-xs">
              {s.pass > 0 && <span className="flex items-center gap-1 text-emerald-700"><CheckCircleIcon className="h-3.5 w-3.5" />{s.pass}</span>}
              {s.warn > 0 && <span className="flex items-center gap-1 text-amber-700"><ExclamationTriangleIcon className="h-3.5 w-3.5" />{s.warn}</span>}
              {s.fail > 0 && <span className="flex items-center gap-1 text-red-700"><XCircleIcon className="h-3.5 w-3.5" />{s.fail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [scan, setScan] = useState<PublicScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/report/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.scan) setScan(data.scan);
        else setError(data.error ?? "Report not found.");
      })
      .catch(() => setError("Failed to load report."));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <SignalIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">{error}</p>
          <p className="mt-1 text-xs text-gray-400">This link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  const analysis = scan.llmAnalysis;
  const inputRef = scan.inputUrl ?? (scan.inputGithubRepo ? `github.com/${scan.inputGithubRepo}` : null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gray-900">
              <SignalIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-gray-400">Gitwork Pulse Report</p>
              <h1 className="text-xl font-semibold text-gray-900">{scan.projectName}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {/* Score hero */}
        <div className="overflow-hidden rounded-[16px] border border-gray-200 bg-white p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={scan.healthScore} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {analysis?.projectClassification.type && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {analysis.projectClassification.type}
                    {analysis.projectClassification.subtype ? ` · ${analysis.projectClassification.subtype}` : ""}
                  </span>
                )}
                {inputRef && (
                  <a
                    href={scan.inputUrl ?? `https://github.com/${scan.inputGithubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 hover:bg-gray-200"
                  >
                    {inputRef}
                  </a>
                )}
              </div>
              {analysis?.executiveSummary && (
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{analysis.executiveSummary}</p>
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

        {/* Web Vitals */}
        {scan.browserInsights && (
          <WebVitalsSection insights={scan.browserInsights} />
        )}

        {/* Health narrative */}
        {analysis?.healthNarrative && (
          <div className="rounded-[16px] border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Health summary</h2>
            <p className="text-sm leading-relaxed text-gray-600">{analysis.healthNarrative}</p>
          </div>
        )}

        {/* Check categories */}
        <div className="rounded-[16px] border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Check results by category</h2>
          <CategorySummary checks={scan.checks} />
        </div>

        {/* Critical gaps */}
        {analysis?.criticalGaps && analysis.criticalGaps.length > 0 && (
          <div className="rounded-[16px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Critical gaps to address</h2>
            <div className="space-y-3">
              {analysis.criticalGaps.slice(0, 5).map((gap, i) => (
                <div key={i} className="flex gap-3">
                  <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{gap.gap}</span>
                      <UrgencyBadge urgency={gap.urgency} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{gap.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        {analysis?.strengths && analysis.strengths.length > 0 && (
          <div className="rounded-[16px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">What&apos;s working well</h2>
            <div className="space-y-3">
              {analysis.strengths.slice(0, 4).map((s, i) => (
                <div key={i} className="flex gap-3">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {analysis?.scalingRoadmap && analysis.scalingRoadmap.length > 0 && (
          <div className="rounded-[16px] border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Recommended roadmap</h2>
            <div className="space-y-4">
              {analysis.scalingRoadmap.map((phase) => (
                <div key={phase.phase} className="flex gap-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                    {phase.phase}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{phase.title}</p>
                    <p className="text-xs text-gray-400">{phase.duration}</p>
                    <ul className="mt-1.5 space-y-0.5">
                      {phase.goals.slice(0, 3).map((g, i) => (
                        <li key={i} className="text-xs text-gray-500">· {g}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div className="rounded-[16px] border border-gray-900 bg-gray-900 p-6 text-center">
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
            Powered by{" "}
            <span className="font-medium text-gray-400">Gitwork Pulse</span>
            {" "}— from prompt to production.
          </p>
        </div>
      </div>
    </div>
  );
}
