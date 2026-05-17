"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowPathIcon,
  BellIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  LightBulbIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useCreatePulseScan, useSharePulseScan, useUnsharePulseScan, useRunFixAgent, useCreateMonitor } from "@/hooks/use-pulse";
import type { FixAgentResult } from "@/lib/api";
import { cn } from "@/lib/format";
import type { PulseScanRecord, PulseScanCheckRecord, ProductionReadinessItem, TechStackRecommendation, InfrastructureStack, DiscoveryKit, CompetitorData, BrowserAgentInsights, CodeAgentInsights, DeployAgentInsights } from "@/types/pulse";
import {
  ScoreRing,
  PulseCheckStatusIcon,
  PulseUrgencyBadge,
  PulseEffortBadge,
  PulseValueBadge,
} from "@/components/pulse/pulse-shared";

function groupChecksByCategory(checks: PulseScanCheckRecord[]) {
  const map = new Map<string, PulseScanCheckRecord[]>();
  for (const check of checks) {
    const list = map.get(check.category) ?? [];
    list.push(check);
    map.set(check.category, list);
  }
  return map;
}

function categoryScore(checks: PulseScanCheckRecord[]): number {
  const applicable = checks.filter((c) => c.status !== "SKIPPED");
  if (!applicable.length) return 0;
  const passing = applicable.filter((c) => c.status === "PASS").length;
  return Math.round((passing / applicable.length) * 100);
}

type Tab = "overview" | "checks" | "gaps" | "opportunities" | "roadmap" | "readiness" | "stack" | "discovery" | "competitors";

function CompetitorsTab({ data, mainScore }: { data: CompetitorData; mainScore: number }) {
  const all: Array<{ label: string; score: number; isMain: boolean; detail?: typeof data.scans[number] }> = [
    { label: "Your project", score: mainScore, isMain: true },
    ...data.scans.map((c) => ({ label: c.url, score: c.healthScore, isMain: false, detail: c })),
  ].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      {/* Scoreboard */}
      <div>
        <p className="app-eyebrow mb-3">Score comparison</p>
        <div className="space-y-2">
          {all.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-[12px] border p-3",
                entry.isMain ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)]" : "border-[var(--border-2)] bg-white",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                #{i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", entry.isMain ? "text-[var(--brand-700)]" : "text-[var(--text-1)]")}>
                  {entry.isMain ? "Your project" : entry.label}
                </p>
                {!entry.isMain && entry.detail && (
                  <p className="text-[11px] text-[var(--text-4)]">
                    {entry.detail.checksPass}P · {entry.detail.checksWarn}W · {entry.detail.checksFail}F
                    {entry.detail.techStack.length > 0 && ` · ${entry.detail.techStack.slice(0, 3).join(", ")}`}
                  </p>
                )}
              </div>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                entry.score >= 75 ? "text-emerald-600" : entry.score >= 50 ? "text-amber-600" : "text-red-600",
              )}>
                {entry.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI comparison */}
      {data.comparison && (
        <>
          <div className="rounded-[14px] border border-[var(--border-2)] p-5">
            <p className="app-eyebrow mb-2">Summary</p>
            <p className="text-sm leading-relaxed text-[var(--text-2)]">{data.comparison.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {data.comparison.advantages.length > 0 && (
              <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-sm font-semibold text-emerald-800">Where you lead</p>
                <ul className="space-y-1.5">
                  {data.comparison.advantages.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                      <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.comparison.gaps.length > 0 && (
              <div className="rounded-[12px] border border-red-200 bg-red-50 p-4">
                <p className="mb-2 text-sm font-semibold text-red-800">Where they lead</p>
                <ul className="space-y-1.5">
                  {data.comparison.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-5">
            <p className="mb-1.5 text-sm font-semibold text-amber-800">How to overtake them</p>
            <p className="text-sm text-amber-700">{data.comparison.recommendation}</p>
          </div>
        </>
      )}
    </div>
  );
}

function DiscoveryTab({ kit }: { kit: DiscoveryKit }) {
  return (
    <div className="space-y-6">
      {/* Opening statement */}
      <div className="rounded-[14px] border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] p-5">
        <p className="app-eyebrow mb-2">Opening statement</p>
        <p className="text-sm italic leading-7 text-[var(--text-1)]">&ldquo;{kit.openingStatement}&rdquo;</p>
      </div>

      {/* Wow finding */}
      <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-5">
        <div className="mb-1 flex items-center gap-2">
          <LightBulbIcon className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">Wow finding</p>
        </div>
        <p className="text-sm font-medium text-amber-900">{kit.wowFinding.finding}</p>
        <p className="mt-1.5 text-sm text-amber-700">{kit.wowFinding.impact}</p>
      </div>

      {/* Talking points */}
      {kit.talkingPoints.length > 0 && (
        <div className="rounded-[14px] border border-[var(--border-2)] p-5">
          <p className="app-eyebrow mb-3">Call talking points</p>
          <ul className="space-y-2">
            {kit.talkingPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-2)]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tailored questions */}
      {kit.questions.length > 0 && (
        <div>
          <p className="app-eyebrow mb-3">Discovery questions</p>
          <div className="space-y-3">
            {kit.questions.map((q, i) => (
              <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
                <div className="mb-2 flex items-start gap-2">
                  <QuestionMarkCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-500)]" />
                  <p className="text-sm font-semibold text-[var(--text-1)]">{q.question}</p>
                </div>
                <p className="mb-2 pl-6 text-xs text-[var(--text-3)]">{q.context}</p>
                <div className="ml-6 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Follow-up: </span>
                  <span className="text-xs italic text-[var(--text-3)]">{q.followUp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anticipated objections */}
      {kit.anticipatedObjections.length > 0 && (
        <div>
          <p className="app-eyebrow mb-3">Anticipated objections</p>
          <div className="space-y-3">
            {kit.anticipatedObjections.map((obj, i) => (
              <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
                <p className="mb-2 text-sm font-medium text-red-700">&ldquo;{obj.objection}&rdquo;</p>
                <p className="text-sm text-[var(--text-2)]">{obj.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing anchor */}
      <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-5">
        <div className="mb-2 flex items-center gap-2">
          <CurrencyDollarIcon className="h-4 w-4 text-emerald-700" />
          <p className="text-sm font-semibold text-emerald-800">Pricing anchor</p>
        </div>
        <p className="text-xl font-bold tabular-nums text-emerald-900">
          ${kit.pricingAnchor.low.toLocaleString()} – ${kit.pricingAnchor.high.toLocaleString()}
        </p>
        <p className="mt-1.5 text-sm text-emerald-700">{kit.pricingAnchor.rationale}</p>
      </div>
    </div>
  );
}

function ReadinessStatusIcon({ status }: { status: ProductionReadinessItem["status"] }) {
  if (status === "DONE") return <CheckCircleIcon className="h-4 w-4 text-emerald-500" />;
  if (status === "PARTIAL") return <MinusCircleIcon className="h-4 w-4 text-amber-500" />;
  return <XCircleIcon className="h-4 w-4 text-red-500" />;
}

function groupReadinessByCategory(items: ProductionReadinessItem[]) {
  const map = new Map<string, ProductionReadinessItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

function StackPriorityBadge({ priority }: { priority: TechStackRecommendation["priority"] }) {
  const styles =
    priority === "HIGH"
      ? "bg-red-50 text-red-700"
      : priority === "MEDIUM"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-50 text-slate-600";
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", styles)}>
      {priority}
    </span>
  );
}

const INFRA_LABELS: { key: keyof InfrastructureStack; label: string }[] = [
  { key: "frontend",       label: "Frontend" },
  { key: "backend",        label: "Backend" },
  { key: "database",       label: "Database" },
  { key: "hosting",        label: "Hosting" },
  { key: "auth",           label: "Auth" },
  { key: "payments",       label: "Payments" },
  { key: "email",          label: "Email" },
  { key: "storage",        label: "Storage" },
  { key: "caching",        label: "Caching" },
  { key: "backgroundJobs", label: "Background jobs" },
  { key: "search",         label: "Search" },
  { key: "monitoring",     label: "Monitoring" },
  { key: "analytics",      label: "Analytics" },
  { key: "cicd",           label: "CI/CD" },
];

function StackTab({
  analysis,
  detectedStack,
}: {
  analysis: NonNullable<import("@/types/pulse").PulseAnalysisOutput["techStackAnalysis"]>;
  detectedStack: string[];
}) {
  return (
    <div className="space-y-6">
      {/* Infrastructure map */}
      {analysis.detectedStack && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Infrastructure map</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {INFRA_LABELS.map(({ key, label }) => {
              const value = analysis.detectedStack[key];
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5",
                    value
                      ? "border-[var(--border-2)] bg-white"
                      : "border-dashed border-[var(--border-2)] bg-[var(--surface-1)]",
                  )}
                >
                  <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
                  {value ? (
                    <span className="text-xs font-semibold text-[var(--text-1)]">{value}</span>
                  ) : (
                    <span className="text-xs text-[var(--text-4)]">Not detected</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detected raw signals (fallback for old scans) */}
      {!analysis.detectedStack && detectedStack.length > 0 && (
        <div className="rounded-[12px] border border-[var(--border-2)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">Detected signals</p>
          <div className="flex flex-wrap gap-2">
            {detectedStack.map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assessment */}
      <div className="rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">Stack assessment</p>
        <p className="text-sm leading-relaxed text-[var(--text-2)]">{analysis.assessment}</p>
      </div>

      {/* Missing for production */}
      {analysis.missingForProduction.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Missing for production</p>
          <div className="flex flex-wrap gap-2">
            {analysis.missingForProduction.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
              >
                <XCircleIcon className="h-3 w-3" />
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Recommendations</p>
          <div className="space-y-3">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)]">{rec.area}</p>
                      {rec.current && (
                        <span className="rounded border border-[var(--border-2)] px-1.5 py-0.5 text-xs text-[var(--text-4)]">
                          current: {rec.current}
                        </span>
                      )}
                      <span className="text-xs font-medium text-[var(--brand-600)]">→ {rec.recommended}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-3)]">{rec.reason}</p>
                  </div>
                  <StackPriorityBadge priority={rec.priority} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VitalScore({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const color =
    score === null ? "text-[var(--text-4)]"
    : score >= 90 ? "text-emerald-600"
    : score >= 50 ? "text-amber-600"
    : "text-red-600";
  const ring =
    score === null ? "border-[var(--border-2)]"
    : score >= 90 ? "border-emerald-300"
    : score >= 50 ? "border-amber-300"
    : "border-red-300";
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-[12px] border p-3", ring)}>
      <span className={cn("text-xl font-bold tabular-nums", color)}>
        {score !== null ? score : "—"}
      </span>
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-[var(--text-4)]">
        {label}
      </span>
    </div>
  );
}

function VitalMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "PASS" | "WARN" | "FAIL";
}) {
  const color =
    status === "PASS" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : status === "WARN" ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";
  return (
    <div className={cn("flex items-center justify-between rounded-[10px] border px-3 py-2", color)}>
      <span className="text-xs font-medium">{label}</span>
      <span className="font-mono text-xs font-bold">{value}</span>
    </div>
  );
}

function CodeInsightsCard({ insights }: { insights: NonNullable<CodeAgentInsights> }) {
  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-1)]">Code Intelligence</p>
        <span className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-4)]">
          GitHub GraphQL
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Vulnerabilities */}
        <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Vulnerabilities</p>
          {insights.vulnerabilities.length === 0 ? (
            <p className="mt-1 text-sm font-semibold text-emerald-600">None found</p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-red-600">
              {insights.vulnerabilities.filter((v) => v.severity === "CRITICAL").length} critical,{" "}
              {insights.vulnerabilities.filter((v) => v.severity === "HIGH").length} high
            </p>
          )}
        </div>
        {/* Branch protection */}
        <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Branch protection</p>
          <p className={cn("mt-1 text-sm font-semibold", insights.branchProtected ? "text-emerald-600" : "text-red-600")}>
            {insights.branchProtected ? (insights.requiresReviews ? "Protected + reviews" : "Protected") : "Not protected"}
          </p>
        </div>
        {/* PR reviews */}
        {insights.prReviewRate !== null && (
          <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">PR reviews</p>
            <p className={cn("mt-1 text-sm font-semibold",
              insights.prReviewRate >= 0.7 ? "text-emerald-600"
              : insights.prReviewRate >= 0.3 ? "text-amber-600"
              : "text-red-600"
            )}>
              {Math.round(insights.prReviewRate * 100)}% reviewed
            </p>
          </div>
        )}
        {/* Commit velocity */}
        {insights.commitVelocity !== null && (
          <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Velocity</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-1)]">
              {insights.commitVelocity} commits/wk
              {insights.uniqueContributors !== null && (
                <span className="ml-1 text-xs font-normal text-[var(--text-3)]">· {insights.uniqueContributors} {insights.uniqueContributors === 1 ? "contributor" : "contributors"}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeployInsightsCard({ insights }: { insights: NonNullable<DeployAgentInsights> }) {
  if (!insights.platform && insights.recentDeployments === null) return null;
  const successRate = insights.recentDeployments && insights.failedDeployments !== null
    ? (insights.recentDeployments - insights.failedDeployments) / insights.recentDeployments
    : null;

  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-1)]">Deploy Intelligence</p>
        <span className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-4)]">
          {insights.platform === "vercel" ? "Vercel" : insights.platform ?? "Deploy"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {successRate !== null && insights.recentDeployments !== null && (
          <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Success rate</p>
            <p className={cn("mt-1 text-sm font-semibold",
              successRate >= 0.9 ? "text-emerald-600"
              : successRate >= 0.7 ? "text-amber-600"
              : "text-red-600"
            )}>
              {insights.recentDeployments - (insights.failedDeployments ?? 0)}/{insights.recentDeployments} deployments
            </p>
          </div>
        )}
        {insights.avgBuildMs !== null && (
          <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Avg build time</p>
            <p className={cn("mt-1 text-sm font-semibold",
              insights.avgBuildMs < 60_000 ? "text-emerald-600"
              : insights.avgBuildMs < 180_000 ? "text-amber-600"
              : "text-red-600"
            )}>
              {Math.round(insights.avgBuildMs / 1000)}s
            </p>
          </div>
        )}
        {insights.buildWarnings.length > 0 && (
          <div className="rounded-[10px] bg-[var(--surface-1)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Build warnings</p>
            <p className="mt-1 text-sm font-semibold text-amber-600">
              {insights.buildWarnings.length} warning{insights.buildWarnings.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
      {insights.buildWarnings.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-[var(--border-2)] pt-3">
          {insights.buildWarnings.slice(0, 3).map((w, i) => (
            <p key={i} className="truncate text-xs text-[var(--text-3)]">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function WebVitalsCard({ insights }: { insights: BrowserAgentInsights }) {
  const lcpMs = insights.lcp;
  const fcpMs = insights.fcp;
  const tbtMs = insights.tbt;
  const cls = insights.cls;

  const lcpStatus = lcpMs === null ? "FAIL" : lcpMs <= 2500 ? "PASS" : lcpMs <= 4000 ? "WARN" : "FAIL";
  const fcpStatus = fcpMs === null ? "FAIL" : fcpMs <= 1800 ? "PASS" : fcpMs <= 3000 ? "WARN" : "FAIL";
  const tbtStatus = tbtMs === null ? "FAIL" : tbtMs <= 200 ? "PASS" : tbtMs <= 600 ? "WARN" : "FAIL";
  const clsStatus = cls === null ? "FAIL" : cls <= 0.1 ? "PASS" : cls <= 0.25 ? "WARN" : "FAIL";

  const formatMs = (ms: number | null) => ms !== null ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`) : "—";

  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-1)]">Core Web Vitals</p>
        <span className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-4)]">
          Lighthouse · mobile
        </span>
      </div>

      {/* 4-score grid */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        <VitalScore label="Performance" score={insights.performanceScore} />
        <VitalScore label="Accessibility" score={insights.accessibilityScore} />
        <VitalScore label="SEO" score={insights.seoScore} />
        <VitalScore label="Best practices" score={insights.bestPracticesScore} />
      </div>

      {/* Individual metrics */}
      {(lcpMs !== null || fcpMs !== null || tbtMs !== null || cls !== null) && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {lcpMs !== null && <VitalMetric label="LCP" value={formatMs(lcpMs)} status={lcpStatus} />}
          {fcpMs !== null && <VitalMetric label="FCP" value={formatMs(fcpMs)} status={fcpStatus} />}
          {tbtMs !== null && <VitalMetric label="TBT" value={formatMs(tbtMs)} status={tbtStatus} />}
          {cls !== null && <VitalMetric label="CLS" value={cls.toFixed(3)} status={clsStatus} />}
        </div>
      )}

      {insights.cruxCategory && (
        <p className="mt-3 text-xs text-[var(--text-4)]">
          Chrome UX Report (real users):{" "}
          <span className={cn(
            "font-semibold",
            insights.cruxCategory === "FAST" ? "text-emerald-600"
            : insights.cruxCategory === "AVERAGE" ? "text-amber-600"
            : "text-red-600",
          )}>
            {insights.cruxCategory.toLowerCase()}
          </span>
        </p>
      )}
    </div>
  );
}

function AiUnavailable({ aiError }: { aiError: string | null }) {
  return (
    <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-8 text-center">
      <p className="text-sm font-semibold text-[var(--text-2)]">AI analysis not available</p>
      {aiError ? (
        <p className="mt-2 text-sm text-[var(--text-3)]">{aiError}</p>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Configure an AI provider in <strong>Settings → Integrations</strong> to see this section.
        </p>
      )}
    </div>
  );
}

export function PulseScanResults({ scan }: { scan: PulseScanRecord }) {
  const router = useRouter();
  const { mutateAsync: createScan, isPending: rescanning } = useCreatePulseScan();
  const { mutateAsync: shareScan, isPending: sharing } = useSharePulseScan();
  const { mutateAsync: unshareScan, isPending: unsharing } = useUnsharePulseScan();
  const { mutateAsync: runFix, isPending: fixing } = useRunFixAgent();
  const { mutateAsync: addMonitor, isPending: creatingMonitor } = useCreateMonitor();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(scan.shareToken);
  const [isShared, setIsShared] = useState(scan.isShared);
  const [fixResult, setFixResult] = useState<FixAgentResult | null>(null);
  const [monitorWebhookUrl, setMonitorWebhookUrl] = useState<string | null>(null);

  function toggleCategory(category: string) {
    setExpandedCategories((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const llm = scan.llmAnalysis;
  const checksByCategory = groupChecksByCategory(scan.checks);

  const reportUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/report/${shareToken}` : null;

  async function handleShare() {
    const result = await shareScan(scan.id);
    setShareToken(result.shareToken);
    setIsShared(true);
  }

  async function handleUnshare() {
    await unshareScan(scan.id);
    setShareToken(null);
    setIsShared(false);
    setCopied(false);
  }

  function handleCopy() {
    if (!reportUrl) return;
    navigator.clipboard.writeText(reportUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleMonitor() {
    const result = await addMonitor({
      projectName: scan.projectName,
      inputType: scan.inputType,
      inputUrl: scan.inputUrl ?? undefined,
      inputGithubRepo: scan.inputGithubRepo ?? undefined,
      clientId: scan.clientId ?? undefined,
    });
    setMonitorWebhookUrl(result.monitor.webhookUrl);
  }

  async function handleAutoFix() {
    const result = await runFix(scan.id);
    setFixResult(result);
  }

  async function handleRescan() {
    const result = await createScan({
      projectName: scan.projectName,
      inputType: scan.inputType,
      inputUrl: scan.inputUrl ?? undefined,
      inputGithubRepo: scan.inputGithubRepo ?? undefined,
      inputDescription: scan.inputDescription ?? undefined,
      clientId: scan.clientId ?? undefined,
    });
    router.push(`/app/pulse/${result.scan.id}`);
  }

  const readinessByCategory = llm ? groupReadinessByCategory(llm.productionReadinessChecklist ?? []) : new Map();
  const missingCount = llm?.productionReadinessChecklist?.filter((i) => i.status === "MISSING").length ?? 0;

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "readiness", label: "Readiness", count: missingCount },
    { id: "checks", label: "Health Checks", count: scan.checks.filter((c) => c.status !== "SKIPPED").length },
    { id: "gaps", label: "Gaps", count: llm?.criticalGaps.length },
    { id: "opportunities", label: "Opportunities", count: llm?.buildOpportunities.length },
    { id: "roadmap", label: "Roadmap", count: llm?.scalingRoadmap.length },
    { id: "stack", label: "Tech Stack", count: llm?.techStackAnalysis?.recommendations.length },
    ...(scan.competitorData ? [{ id: "competitors" as Tab, label: "Competitors", count: scan.competitorData.scans.length }] : []),
    ...(scan.discoveryKit ? [{ id: "discovery" as Tab, label: "Discovery" }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-5">
          {scan.healthScore !== null && (
            <div className="relative">
              <ScoreRing score={scan.healthScore} size={100} />
              {scan.previousHealthScore !== null && scan.healthScore !== scan.previousHealthScore && (
                <span className={cn(
                  "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  scan.healthScore > scan.previousHealthScore
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700",
                )}>
                  {scan.healthScore > scan.previousHealthScore ? "+" : ""}{scan.healthScore - scan.previousHealthScore}
                </span>
              )}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-[var(--text-1)]">{scan.projectName}</h2>
              {llm?.projectClassification && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-500)] bg-[var(--surface-brand)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-700)]">
                  {llm.projectClassification.type}
                  {llm.projectClassification.subtype && (
                    <span className="font-normal opacity-70">· {llm.projectClassification.subtype}</span>
                  )}
                </span>
              )}
            </div>
            {scan.inputUrl && (
              <a
                href={scan.inputUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--brand-600)] hover:underline"
              >
                {scan.inputUrl}
              </a>
            )}
            {scan.inputGithubRepo && (
              <p className="text-sm text-[var(--text-3)]">github.com/{scan.inputGithubRepo}</p>
            )}
            {scan.techStack && scan.techStack.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scan.techStack.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="tertiary"
              size="sm"
              onClick={handleRescan}
              loading={rescanning}
              leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Re-scan
            </Button>
            <Link href={`/app/pulse/${scan.id}/report`} target="_blank" rel="noopener noreferrer">
              <Button variant="tertiary" size="sm" leadingIcon={<DocumentTextIcon className="h-4 w-4" />}>
                Report
              </Button>
            </Link>
            {scan.status === "COMPLETED" && scan.inputType === "GITHUB_REPO" && !fixResult && (
              <Button
                variant="tertiary"
                size="sm"
                onClick={handleAutoFix}
                loading={fixing}
                leadingIcon={<WrenchScrewdriverIcon className="h-4 w-4" />}
              >
                {fixing ? "Fixing…" : "Auto-fix"}
              </Button>
            )}
            {scan.status === "COMPLETED" && !monitorWebhookUrl && (
              <Button
                variant="tertiary"
                size="sm"
                onClick={handleMonitor}
                loading={creatingMonitor}
                leadingIcon={<BellIcon className="h-4 w-4" />}
              >
                Monitor
              </Button>
            )}
            {scan.status === "COMPLETED" && (
              isShared ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCopy}
                  leadingIcon={copied ? <ClipboardDocumentCheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                >
                  {copied ? "Copied!" : "Copy link"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleShare}
                  loading={sharing}
                  leadingIcon={<LinkIcon className="h-4 w-4" />}
                >
                  Share report
                </Button>
              )
            )}
          </div>
          {isShared && reportUrl && (
            <div className="flex items-center gap-2">
              <span className="max-w-[220px] truncate rounded border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-1 font-mono text-[11px] text-[var(--text-3)]">
                {reportUrl}
              </span>
              <button
                type="button"
                onClick={handleUnshare}
                disabled={unsharing}
                className="text-[11px] text-red-500 hover:underline disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          )}
          {monitorWebhookUrl && (
            <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                GitHub webhook URL
              </p>
              <div className="flex items-center gap-2">
                <code className="max-w-[260px] truncate font-mono text-[10px] text-[var(--text-3)]">
                  {monitorWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(monitorWebhookUrl)}
                  className="shrink-0 text-[10px] text-[var(--brand-600)] hover:underline"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-4)]">
                Add to GitHub → Settings → Webhooks. Send push events. Score drops &gt;10 pts create a GitHub Issue.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fix agent result banner */}
      {fixResult && (
        <div className={cn(
          "rounded-[14px] border p-4",
          fixResult.prUrl ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={cn("text-sm font-semibold", fixResult.prUrl ? "text-emerald-800" : "text-amber-800")}>
                {fixResult.prUrl ? "Pull request created" : "Fix agent complete"}
              </p>
              <p className={cn("mt-0.5 text-sm", fixResult.prUrl ? "text-emerald-700" : "text-amber-700")}>
                {fixResult.summary}
              </p>
            </div>
            {fixResult.prUrl && (
              <a
                href={fixResult.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-[8px] bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                View PR →
              </a>
            )}
          </div>
          {fixResult.proposedFixes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {fixResult.proposedFixes.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <code className="font-mono">{f.filePath}</code>
                  <span className="text-emerald-500">—</span>
                  <span className="truncate">{f.explanation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border-2)]">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition",
                activeTab === tab.id
                  ? "border-[var(--brand-600)] text-[var(--brand-700)]"
                  : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text-3)]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* AI error banner — shown when LLM failed but scan still completed */}
      {scan.aiError && (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">AI analysis unavailable:</span> {scan.aiError} Technical checks and scores above are accurate.
        </div>
      )}

      {/* Tab content */}
      {/* Web Vitals — shown on overview regardless of AI result */}
      {activeTab === "overview" && scan.browserInsights && (
        <WebVitalsCard insights={scan.browserInsights} />
      )}
      {activeTab === "overview" && scan.codeInsights && (
        <CodeInsightsCard insights={scan.codeInsights} />
      )}
      {activeTab === "overview" && scan.deployInsights && (
        <DeployInsightsCard insights={scan.deployInsights} />
      )}

      {activeTab === "overview" && !llm && (
        <AiUnavailable aiError={scan.aiError} />
      )}

      {activeTab === "overview" && llm && (
        <div className="space-y-6">

          {/* Project classification */}
          {llm.projectClassification && (
            <div className="rounded-[14px] border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="app-eyebrow mb-0.5">Project type detected</p>
                  <p className="text-base font-semibold text-[var(--text-1)]">
                    {llm.projectClassification.type}
                    {llm.projectClassification.subtype && (
                      <span className="ml-2 text-sm font-normal text-[var(--text-3)]">
                        — {llm.projectClassification.subtype}
                      </span>
                    )}
                  </p>
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  llm.projectClassification.confidence === "HIGH"
                    ? "bg-emerald-100 text-emerald-700"
                    : llm.projectClassification.confidence === "MEDIUM"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                )}>
                  {llm.projectClassification.confidence} confidence
                </span>
              </div>
              {llm.projectClassification.verticalInsights.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-700)]">
                    Vertical-specific recommendations
                  </p>
                  <ul className="space-y-1.5">
                    {llm.projectClassification.verticalInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                        <ArrowRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-500)]" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {llm.projectClassification.signals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--brand-500)] border-opacity-20 pt-3">
                  {llm.projectClassification.signals.map((signal, i) => (
                    <span key={i} className="rounded-full border border-[var(--brand-500)] border-opacity-30 bg-white px-2 py-0.5 text-xs text-[var(--brand-700)]">
                      {signal}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-[14px] border border-[var(--border-2)] p-5">
            <p className="app-eyebrow mb-2">Executive summary</p>
            <p className="text-sm leading-7 text-[var(--text-2)]">{llm.executiveSummary}</p>
          </div>

          {llm.strengths.length > 0 && (
            <div>
              <p className="app-eyebrow mb-3">Strengths</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {llm.strengths.map((s) => (
                  <div key={s.title} className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-medium text-emerald-800">{s.title}</p>
                    <p className="mt-1 text-sm text-emerald-700">{s.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {llm.proposalHook && (
            <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
              <p className="app-eyebrow mb-2">Discovery call opener</p>
              <p className="text-sm italic leading-7 text-[var(--text-1)]">&ldquo;{llm.proposalHook}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "checks" && (
        <div className="space-y-2">
          {Array.from(checksByCategory.entries()).map(([category, checks]) => {
            const applicable = checks.filter((c) => c.status !== "SKIPPED");
            if (!applicable.length) return null;
            const score = categoryScore(checks);
            const failed = checks.filter((c) => c.status === "FAIL").length;
            const warned = checks.filter((c) => c.status === "WARN").length;
            const passed = checks.filter((c) => c.status === "PASS").length;
            const isExpanded = expandedCategories.has(category);
            const hasIssues = failed > 0 || warned > 0;

            return (
              <div key={category} className="rounded-[12px] border border-[var(--border-2)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-colors"
                >
                  <span className="text-[var(--text-4)]">
                    {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-[var(--text-1)]">{category}</span>
                  <div className="flex items-center gap-2">
                    {failed > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{failed} failed</span>
                    )}
                    {warned > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{warned} warn</span>
                    )}
                    {!hasIssues && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{passed} passed</span>
                    )}
                    <span className={cn(
                      "text-xs font-semibold tabular-nums",
                      score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600",
                    )}>
                      {score}%
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-[var(--border-2)] border-t border-[var(--border-2)]">
                    {checks.filter((c) => c.status !== "SKIPPED").map((check) => (
                      <div key={check.id} className="flex items-start gap-3 bg-[var(--surface-1)] px-4 py-3">
                        <span className="mt-0.5 text-base">
                          <PulseCheckStatusIcon status={check.status} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                          {check.detail && (
                            <p className="mt-0.5 text-xs text-[var(--text-3)]">{check.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "gaps" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "gaps" && llm && (
        <div className="space-y-3">
          {llm.criticalGaps.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No critical gaps identified.</p>
          )}
          {llm.criticalGaps.map((gap, i) => (
            <div
              key={i}
              className="rounded-[12px] border border-[var(--border-2)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className={cn("mt-0.5 h-4 w-4 shrink-0", gap.urgency === "CRITICAL" ? "text-red-500" : gap.urgency === "HIGH" ? "text-orange-500" : "text-amber-500")} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-1)]">{gap.gap}</p>
                    <p className="mt-1 text-xs text-[var(--text-3)]">{gap.impact}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-4)]">
                    {gap.category}
                  </span>
                  <PulseUrgencyBadge urgency={gap.urgency} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "opportunities" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "opportunities" && llm && (
        <div className="space-y-3">
          {llm.buildOpportunities.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No build opportunities identified.</p>
          )}
          {llm.buildOpportunities.map((opp, i) => (
            <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">{opp.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-3)]">{opp.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-4)]">
                      {opp.category}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <PulseEffortBadge effort={opp.estimatedEffort} />
                  <PulseValueBadge value={opp.businessValue} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "readiness" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "readiness" && llm && (
        <div className="space-y-6">
          {(!llm.productionReadinessChecklist || llm.productionReadinessChecklist.length === 0) && (
            <p className="text-sm text-[var(--text-3)]">No readiness checklist available.</p>
          )}
          {Array.from(readinessByCategory.entries()).map(([category, items]) => {
            const done = items.filter((item: ProductionReadinessItem) => item.status === "DONE").length;
            return (
              <div key={category}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{category}</p>
                  <span className="text-xs text-[var(--text-4)]">{done}/{items.length} done</span>
                </div>
                <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-[var(--border-2)]">
                  {(items as ProductionReadinessItem[]).map((item: ProductionReadinessItem, i: number) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 shrink-0">
                        <ReadinessStatusIcon status={item.status} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium",
                          item.status === "DONE" ? "text-[var(--text-2)]" : "text-[var(--text-1)]",
                        )}>
                          {item.item}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">{item.notes}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        item.status === "DONE"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.status === "PARTIAL"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700",
                      )}>
                        {item.status === "DONE" ? "Done" : item.status === "PARTIAL" ? "Partial" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "stack" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "stack" && llm?.techStackAnalysis && (
        <StackTab analysis={llm.techStackAnalysis} detectedStack={scan.techStack ?? []} />
      )}

      {activeTab === "competitors" && scan.competitorData && scan.healthScore !== null && (
        <CompetitorsTab data={scan.competitorData} mainScore={scan.healthScore} />
      )}

      {activeTab === "discovery" && scan.discoveryKit && (
        <DiscoveryTab kit={scan.discoveryKit} />
      )}

      {activeTab === "roadmap" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "roadmap" && llm && (
        <div className="space-y-4">
          {llm.scalingRoadmap.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No roadmap generated.</p>
          )}
          {llm.scalingRoadmap.map((phase) => (
            <div key={phase.phase} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-500)] bg-[var(--brand-50)] text-sm font-bold text-[var(--brand-700)]">
                  {phase.phase}
                </div>
                <div className="mt-2 w-px flex-1 bg-[var(--border-2)]" />
              </div>
              <div className="pb-6">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{phase.title}</p>
                  <span className="text-xs text-[var(--text-4)]">· {phase.duration}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {phase.goals.map((goal, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-3)]">
                      <ArrowRightIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-4)]" />
                      {goal}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
