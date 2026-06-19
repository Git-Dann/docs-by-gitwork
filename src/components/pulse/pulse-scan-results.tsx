"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowPathIcon,
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
  PlusIcon,
  QuestionMarkCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useCreatePulseScan, useSharePulseScan, useUnsharePulseScan, useRunFixAgent, useCreateMonitor, useRunBrowserAgent, useRunDiscoveryKit, useReanalysePulseScan, useGeneratePulseProposal, usePulseBenchmarks } from "@/hooks/use-pulse";
import { useBatchCreateTasks, useTasks } from "@/hooks/use-tasks";
import { usePermissions } from "@/hooks/use-permissions";
import type { FixAgentResult } from "@/lib/api";
import { cn } from "@/lib/format";
import type { PulseScanRecord, PulseScanCheckRecord, ProductionBlocker, ProductionReadinessItem, TechStackRecommendation, InfrastructureStack, DiscoveryKit, CompetitorData, BrowserAgentInsights, CodeAgentInsights, DeployAgentInsights } from "@/types/pulse";
import { AI_MATURITY_LABELS } from "@/types/pulse";
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
  // Match calculateHealthScore: a WARN earns half credit (it's "could be better",
  // not a hard failure) so a category of only warnings reads ~50, never 0.
  let earned = 0;
  for (const c of applicable) {
    if (c.status === "PASS") earned += 1;
    else if (c.status === "WARN") earned += 0.5;
  }
  return Math.round((earned / applicable.length) * 100);
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
                "flex items-center gap-3 rounded-[10px] border p-3",
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
          <div className="rounded-[10px] border border-[var(--border-2)] p-5">
            <p className="app-eyebrow mb-2">Summary</p>
            <p className="text-sm leading-relaxed text-[var(--text-2)]">{data.comparison.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {data.comparison.advantages.length > 0 && (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
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
              <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
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

          <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-5">
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
      <div className="rounded-[10px] border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] p-5">
        <p className="app-eyebrow mb-2">Opening statement</p>
        <p className="text-sm italic leading-7 text-[var(--text-1)]">&ldquo;{kit.openingStatement}&rdquo;</p>
      </div>

      {/* Wow finding */}
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-5">
        <div className="mb-1 flex items-center gap-2">
          <LightBulbIcon className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">Wow finding</p>
        </div>
        <p className="text-sm font-medium text-amber-900">{kit.wowFinding.finding}</p>
        <p className="mt-1.5 text-sm text-amber-700">{kit.wowFinding.impact}</p>
      </div>

      {/* Talking points */}
      {kit.talkingPoints.length > 0 && (
        <div className="rounded-[10px] border border-[var(--border-2)] p-5">
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
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <div className="mb-2 flex items-start gap-2">
                  <QuestionMarkCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-500)]" />
                  <p className="text-sm font-semibold text-[var(--text-1)]">{q.question}</p>
                </div>
                <p className="mb-2 pl-6 text-xs text-[var(--text-3)]">{q.context}</p>
                <div className="ml-6 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
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
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <p className="mb-2 text-sm font-medium text-red-700">&ldquo;{obj.objection}&rdquo;</p>
                <p className="text-sm text-[var(--text-2)]">{obj.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing anchor */}
      <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-5">
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
      {/* Infrastructure map — only show layers where something was detected */}
      {analysis.detectedStack && (() => {
        const detectedLayers = INFRA_LABELS.filter(({ key }) => Boolean(analysis.detectedStack[key]));
        return detectedLayers.length > 0 ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Infrastructure map</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {detectedLayers.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5"
                >
                  <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
                  <span className="text-xs font-semibold text-[var(--text-1)]">{analysis.detectedStack[key]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-5 text-center">
            <p className="text-sm font-semibold text-[var(--text-2)]">Stack could not be detected from URL alone</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Provide a GitHub repo URL for code-level stack detection — framework, database, auth provider, and more.
            </p>
          </div>
        );
      })()}

      {/* Detected raw signals (fallback for old scans) */}
      {!analysis.detectedStack && detectedStack.length > 0 && (
        <div className="rounded-[10px] border border-[var(--border-2)] p-4">
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
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
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
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
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
    <div className={cn("flex flex-col items-center gap-1 rounded-[10px] border p-3", ring)}>
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
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-5">
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
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-5">
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
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-5">
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

type AgentStatus = "completed" | "running" | "available" | "error" | "na";

interface AgentSlot {
  id: string;
  label: string;
  description: string;
  status: AgentStatus;
  summary?: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = {
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
    running:   { label: "Running…",  className: "bg-blue-100 text-blue-700" },
    available: { label: "Not run",   className: "bg-[var(--surface-2)] text-[var(--text-3)]" },
    error:     { label: "Error",     className: "bg-red-100 text-red-700" },
    na:        { label: "N/A",       className: "bg-[var(--surface-1)] text-[var(--text-4)]" },
  }[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", config.className)}>
      {config.label}
    </span>
  );
}

function AgentCard({ slot }: { slot: AgentSlot }) {
  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-[10px] border p-4 transition-colors",
      slot.status === "completed" ? "border-[var(--border-2)] bg-white"
      : slot.status === "error"     ? "border-red-200 bg-red-50"
      : slot.status === "na"        ? "border-[var(--border-1)] bg-[var(--surface-1)] opacity-60"
      : "border-[var(--border-2)] bg-[var(--surface-1)]",
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-1)]">{slot.label}</p>
        <AgentStatusBadge status={slot.status} />
      </div>
      <p className="text-xs text-[var(--text-3)]">{slot.summary ?? slot.description}</p>
      {slot.actionLabel && slot.onAction && slot.status !== "na" && slot.status !== "running" && (
        <button
          type="button"
          onClick={slot.onAction}
          disabled={slot.loading}
          className="mt-auto self-start rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
        >
          {slot.loading ? "Running…" : slot.actionLabel}
        </button>
      )}
    </div>
  );
}

function AgentPanel({
  scan,
  fixResult,
  fixError,
  onAutoFix,
  fixing,
  canRunFixAgent,
  onMonitor,
  creatingMonitor,
  monitorWebhookUrl,
  onDiscoverySuccess,
}: {
  scan: PulseScanRecord;
  fixResult: FixAgentResult | null;
  fixError: string | null;
  onAutoFix: () => void;
  fixing: boolean;
  canRunFixAgent: boolean;
  onMonitor: () => void;
  creatingMonitor: boolean;
  monitorWebhookUrl: string | null;
  onDiscoverySuccess: () => void;
}) {
  const { mutateAsync: runBrowser, isPending: runningBrowser } = useRunBrowserAgent();
  const { mutateAsync: runDiscovery, isPending: runningDiscovery } = useRunDiscoveryKit();
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [agentsOpen, setAgentsOpen] = useState(false);

  const checksTotal = scan.checks.filter((c) => c.status !== "SKIPPED").length;
  const checksFail = scan.checks.filter((c) => c.status === "FAIL").length;
  const checksPass = scan.checks.filter((c) => c.status === "PASS").length;

  const slots: AgentSlot[] = [
    // Infrastructure
    {
      id: "infra",
      label: "Infrastructure",
      description: "HTTP checks, security headers, SEO, and platform signals",
      status: "completed",
      summary: `${checksTotal} checks — ${checksPass} passed, ${checksFail} failed`,
    },
    // Code Intelligence
    {
      id: "code",
      label: "Code Intelligence",
      description: "GitHub GraphQL — vulnerabilities, branch protection, PR culture",
      status: scan.inputType === "GITHUB_REPO"
        ? (scan.codeInsights ? "completed" : "error")
        : "available",
      summary: scan.codeInsights
        ? `${scan.codeInsights.vulnerabilities.length === 0 ? "No vulnerabilities" : `${scan.codeInsights.vulnerabilities.length} vuln${scan.codeInsights.vulnerabilities.length !== 1 ? "s" : ""}`} · ${scan.codeInsights.commitVelocity !== null ? `${scan.codeInsights.commitVelocity} commits/wk` : "commit data"}`
        : scan.inputType === "GITHUB_REPO"
          ? "GraphQL query failed — check your GitHub token has repo read access"
          : "Rescan with a GitHub repo URL to unlock vulnerability scanning, branch protection, and commit history analysis",
      actionLabel: scan.inputType !== "GITHUB_REPO" ? "Start repo scan" : undefined,
      onAction: scan.inputType !== "GITHUB_REPO" ? () => { window.location.href = "/app/pulse"; } : undefined,
    },
    // Browser & Performance
    {
      id: "browser",
      label: "Browser & Performance",
      description: "Lighthouse via PageSpeed Insights — Core Web Vitals, accessibility, SEO scores",
      status: browserError ? "error"
        : scan.browserInsights ? "completed"
        : (scan.inputType === "URL" || (scan.inputType === "GITHUB_REPO" && scan.codeInsights?.homepageUrl))
          ? "available"
          : "na",
      summary: browserError ? browserError
        : scan.browserInsights
          ? `Performance ${scan.browserInsights.performanceScore ?? "?"}  ·  Accessibility ${scan.browserInsights.accessibilityScore ?? "?"}  ·  SEO ${scan.browserInsights.seoScore ?? "?"}`
          : scan.inputType === "URL" || (scan.inputType === "GITHUB_REPO" && scan.codeInsights?.homepageUrl)
            ? "Run Lighthouse analysis on the live site"
            : "No URL available for this scan",
      actionLabel: scan.browserInsights ? "Re-run analysis" : browserError ? "Retry" : "Run analysis",
      onAction: async () => {
        setBrowserError(null);
        try { await runBrowser(scan.id); }
        catch (err) {
          const msg = err instanceof Error ? err.message : "Browser analysis failed.";
          // Improve common PSI error messages
          const friendly = msg.includes("No data") || msg.includes("unreachable")
            ? "PageSpeed could not reach the URL — confirm it is publicly accessible (no login required) and not behind a firewall. Add a GOOGLE_PSI_API_KEY env var to avoid rate limits."
            : msg;
          setBrowserError(friendly);
        }
      },
      loading: runningBrowser,
    },
    // Deploy Intelligence
    {
      id: "deploy",
      label: "Deploy Intelligence",
      description: "Hosting & deployment intelligence — CDN layer, platform detection, build health",
      status: (() => {
        const di = scan.deployInsights;
        if (!di) return "na" as const;
        if (di.recentDeployments !== null) return "completed" as const;
        if (di.platform) return "completed" as const; // platform detected but no logs
        return "na" as const;
      })(),
      summary: (() => {
        const di = scan.deployInsights;
        if (!di?.platform) return "Hosting platform not identified from HTTP headers";
        const platformName: Record<string, string> = {
          vercel: "Vercel", netlify: "Netlify", railway: "Railway", other: "External hosting",
        };
        const name = platformName[di.platform] ?? di.platform;
        if (di.recentDeployments === null) return `${name} detected — deployment logs not available`;
        return `${name} · ${di.recentDeployments} deployments · ${di.avgBuildMs !== null ? `${Math.round(di.avgBuildMs / 1000)}s avg build` : "build data unavailable"}`;
      })(),
    },
    // AI Synthesis
    {
      id: "ai",
      label: "AI Synthesis",
      description: "LLM analysis — project classification, gaps, roadmap",
      status: scan.llmAnalysis ? "completed" : scan.aiError ? "error" : "available",
      summary: scan.llmAnalysis
        ? `${scan.llmAnalysis.projectClassification.type}${scan.llmAnalysis.projectClassification.subtype ? ` · ${scan.llmAnalysis.projectClassification.subtype}` : ""} · ${scan.llmAnalysis.criticalGaps.length} critical gap${scan.llmAnalysis.criticalGaps.length !== 1 ? "s" : ""}`
        : scan.aiError ?? "AI synthesis did not run",
    },
    // Discovery Prep
    {
      id: "discovery",
      label: "Discovery Prep",
      description: "AI-generated call guide — questions, objections, pricing anchor",
      status: discoveryError ? "error"
        : scan.discoveryKit ? "completed"
        : scan.llmAnalysis && scan.inputType !== "FREE_TEXT" ? "available"
        : "na",
      summary: discoveryError ? discoveryError
        : scan.discoveryKit
          ? `${scan.discoveryKit.questions.length} questions · pricing £${scan.discoveryKit.pricingAnchor.low.toLocaleString()}–£${scan.discoveryKit.pricingAnchor.high.toLocaleString()}`
          : scan.llmAnalysis && scan.inputType !== "FREE_TEXT"
            ? "Generate a tailored discovery call briefing"
            : "Requires AI synthesis to complete first",
      actionLabel: scan.discoveryKit ? "Regenerate" : discoveryError ? "Retry" : "Generate",
      onAction: async () => {
        setDiscoveryError(null);
        try {
          await runDiscovery(scan.id);
          onDiscoverySuccess();
        } catch (err) {
          setDiscoveryError(err instanceof Error ? err.message : "Discovery kit generation failed. Check your AI provider settings.");
        }
      },
      loading: runningDiscovery,
    },
    // Auto-fix
    {
      id: "fix",
      label: "Auto-fix",
      description: "AI reads your repo files and opens a GitHub PR with targeted fixes",
      status: fixError ? "error" : fixResult ? "completed" : "available",
      summary: fixError
        ? fixError
        : fixResult
          ? fixResult.summary
          : scan.inputType === "GITHUB_REPO"
            ? `Fix the ${scan.checks.filter((c) => c.status === "FAIL").length} failing checks automatically`
            : "Rescan with a GitHub repo URL — AI will read your code and open a PR fixing failing checks",
      actionLabel: fixError ? "Retry"
        : fixResult?.prUrl ? "View PR"
        : scan.inputType === "GITHUB_REPO" ? "Run fix agent"
        : "Start repo scan",
      onAction: fixResult?.prUrl
        ? () => window.open(fixResult.prUrl!, "_blank")
        : scan.inputType !== "GITHUB_REPO"
          ? () => { window.location.href = "/app/pulse"; }
          : onAutoFix,
      loading: fixing,
    },
    // Monitor
    {
      id: "monitor",
      label: "Monitor",
      description: "Webhook triggered re-scan on every new deployment — alerts on score drops",
      status: monitorWebhookUrl ? "completed" : "available",
      summary: monitorWebhookUrl
        ? `Webhook active — register in your CI/CD pipeline`
        : "Get alerted when your health score drops after a deploy",
      actionLabel: monitorWebhookUrl ? undefined : "Set up monitor",
      onAction: onMonitor,
      loading: creatingMonitor,
    },
  ];

  // High-risk: the fix-agent opens GitHub PRs — hide that slot unless the role holds pulse.fixAgent.
  const visibleSlots = slots.filter((slot) => slot.id !== "fix" || canRunFixAgent);

  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-4">
      <button
        type="button"
        onClick={() => setAgentsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          {agentsOpen ? <ChevronDownIcon className="h-4 w-4 text-[var(--text-4)]" /> : <ChevronRightIcon className="h-4 w-4 text-[var(--text-4)]" />}
          <span className="text-sm font-semibold text-[var(--text-1)]">Scan agents</span>
          <span className="text-xs text-[var(--text-4)]">
            · {visibleSlots.filter((s) => s.status === "completed").length}/{visibleSlots.filter((s) => s.status !== "na").length} run
          </span>
        </span>
        {!agentsOpen && (
          <span className="text-xs font-medium text-[var(--brand-600)]">Run more checks →</span>
        )}
      </button>
      {agentsOpen && (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleSlots.map((slot) => (
          <AgentCard key={slot.id} slot={slot} />
        ))}
      </div>
      )}
      {agentsOpen && monitorWebhookUrl && (
        <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3">
          <span className="text-xs text-[var(--text-3)]">Webhook URL:</span>
          <code className="flex-1 truncate rounded bg-[var(--surface-1)] px-2 py-1 font-mono text-[11px] text-[var(--text-2)]">
            {monitorWebhookUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(monitorWebhookUrl)}
            className="text-xs text-[var(--brand-600)] hover:underline"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function AiUnavailable({ aiError }: { aiError: string | null }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-8 text-center">
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

// ── Wave 2A: Priority Action Plan ────────────────────────────────────────────

type PriorityActionItem = {
  type: "blocker" | "gap" | "opp";
  title: string;
  tab: Tab;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM";
  effort?: "S" | "M" | "L" | "XL";
};

function PriorityActionPlan({
  llm,
  onTabChange,
  clientId,
  scanId,
}: {
  llm: NonNullable<PulseScanRecord["llmAnalysis"]>;
  onTabChange: (tab: Tab) => void;
  clientId: string | null;
  scanId: string;
}) {
  const { mutateAsync: batchCreate, isPending: pushing } = useBatchCreateTasks();
  const [pushedTiers, setPushedTiers] = useState<Record<string, string>>({});
  const [pushingTier, setPushingTier] = useState<string | null>(null);

  async function pushTier(
    tierKey: string,
    items: PriorityActionItem[],
    priority: "HIGH" | "MEDIUM" | "LOW",
  ) {
    if (!clientId || !items.length) return;
    setPushingTier(tierKey);
    try {
      const res = await batchCreate({
        clientId,
        tasks: items.map((item) => ({
          title: item.title,
          priority,
          metadata: { source: "pulse_scan", pulseScanId: scanId, pulsePlanTier: tierKey },
        })),
      });
      setPushedTiers((s) => ({
        ...s,
        [tierKey]:
          res.created > 0
            ? `Added ${res.created}${res.skipped ? ` · ${res.skipped} already on board` : ""}`
            : "Already on board",
      }));
    } catch {
      setPushedTiers((s) => ({ ...s, [tierKey]: "Failed — retry" }));
    } finally {
      setPushingTier(null);
    }
  }

  const blockers = (llm.productionBlockers as ProductionBlocker[]) ?? [];

  const fixNow: PriorityActionItem[] = [
    ...blockers
      .filter((b) => b.urgency === "CRITICAL")
      .map((b): PriorityActionItem => ({ type: "blocker", title: b.blocker, tab: "readiness", urgency: "CRITICAL" })),
    ...llm.criticalGaps
      .filter((g) => g.urgency === "CRITICAL")
      .map((g): PriorityActionItem => ({ type: "gap", title: g.gap, tab: "gaps", urgency: "CRITICAL" })),
  ];

  const thisSprint: PriorityActionItem[] = [
    ...blockers
      .filter((b) => b.urgency === "HIGH")
      .map((b): PriorityActionItem => ({ type: "blocker", title: b.blocker, tab: "readiness", urgency: "HIGH" })),
    ...llm.criticalGaps
      .filter((g) => g.urgency === "HIGH")
      .map((g): PriorityActionItem => ({ type: "gap", title: g.gap, tab: "gaps", urgency: "HIGH" })),
    ...llm.buildOpportunities
      .filter((o) => o.businessValue === "HIGH" && (o.estimatedEffort === "S" || o.estimatedEffort === "M"))
      .map((o): PriorityActionItem => ({ type: "opp", title: o.title, tab: "opportunities", effort: o.estimatedEffort })),
  ];

  const nextSprint: PriorityActionItem[] = [
    ...llm.criticalGaps
      .filter((g) => g.urgency === "MEDIUM")
      .map((g): PriorityActionItem => ({ type: "gap", title: g.gap, tab: "gaps", urgency: "MEDIUM" })),
    ...llm.buildOpportunities
      .filter((o) => o.businessValue === "HIGH" && o.estimatedEffort !== "S" && o.estimatedEffort !== "M")
      .map((o): PriorityActionItem => ({ type: "opp", title: o.title, tab: "opportunities", effort: o.estimatedEffort })),
    ...llm.buildOpportunities
      .filter((o) => o.businessValue === "MEDIUM" && (o.estimatedEffort === "S" || o.estimatedEffort === "M"))
      .slice(0, 3)
      .map((o): PriorityActionItem => ({ type: "opp", title: o.title, tab: "opportunities", effort: o.estimatedEffort })),
  ];

  const totalActions = fixNow.length + thisSprint.length + nextSprint.length;
  if (totalActions === 0) return null;

  const tiers = [
    { key: "fix-now",     label: "Fix now",     priority: "HIGH" as const,   items: fixNow.slice(0, 5),     dotColor: "#ef4444", borderCls: "border-red-200 bg-red-50 hover:bg-red-100",   textCls: "text-red-900",   tagCls: "bg-red-100 text-red-700" },
    { key: "this-sprint", label: "This sprint", priority: "MEDIUM" as const, items: thisSprint.slice(0, 5), dotColor: "#f59e0b", borderCls: "border-amber-200 bg-amber-50 hover:bg-amber-100", textCls: "text-amber-900", tagCls: "bg-amber-100 text-amber-700" },
    { key: "next-sprint", label: "Next sprint", priority: "LOW" as const,    items: nextSprint.slice(0, 5), dotColor: "#3b82f6", borderCls: "border-blue-200 bg-blue-50 hover:bg-blue-100",   textCls: "text-blue-900",  tagCls: "bg-blue-100 text-blue-700" },
  ].filter(({ items }) => items.length > 0);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{"12 // PRIORITY ACTION PLAN"}</span>
        <span className="widget-header-right">{totalActions} action{totalActions !== 1 ? "s" : ""}</span>
      </div>
      <div className="widget-body">
        <div className="grid gap-5 sm:grid-cols-3">
          {tiers.map(({ key, label, priority, items, dotColor, borderCls, textCls, tagCls }) => (
            <div key={key}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="widget-data-label">{label} · {items.length}</p>
                {clientId && (
                  pushedTiers[key] ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                      <CheckCircleIcon className="h-3 w-3" />
                      {pushedTiers[key]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pushing}
                      onClick={() => pushTier(key, items, priority)}
                      className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--border-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                      title="Create a task on this client's board for every item in this tier"
                    >
                      {pushingTier === key ? (
                        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <PlusIcon className="h-2.5 w-2.5" />
                      )}
                      Push to board
                    </button>
                  )
                )}
              </div>
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onTabChange(item.tab)}
                    className={cn("flex w-full items-start gap-2.5 rounded-[8px] border px-3 py-2.5 text-left transition", borderCls)}
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                    <p className={cn("flex-1 text-xs leading-5", textCls)}>{item.title}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.type === "blocker" && (
                        <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", tagCls)}>
                          BLOCKER
                        </span>
                      )}
                      {item.effort && <PulseEffortBadge effort={item.effort} />}
                      {item.urgency && item.type === "gap" && <PulseUrgencyBadge urgency={item.urgency} />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PulseScanResults({ scan }: { scan: PulseScanRecord }) {
  const router = useRouter();
  const { canRunFixAgent } = usePermissions();
  const { data: benchmarkData } = usePulseBenchmarks(scan.id, scan.status === "COMPLETED");
  const benchmark = benchmarkData?.benchmarks ?? null;
  const { mutateAsync: createScan, isPending: rescanning } = useCreatePulseScan();
  const { mutateAsync: shareScan, isPending: sharing } = useSharePulseScan();
  const { mutateAsync: unshareScan, isPending: unsharing } = useUnsharePulseScan();
  const { mutateAsync: runFix, isPending: fixing } = useRunFixAgent();
  const { mutateAsync: addMonitor, isPending: creatingMonitor } = useCreateMonitor();
  const { mutateAsync: reanalyse, isPending: reanalysing } = useReanalysePulseScan();
  const { mutateAsync: generateProposal, isPending: generatingProposal } = useGeneratePulseProposal();
  const [proposalGenError, setProposalGenError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(scan.shareToken);
  const [isShared, setIsShared] = useState(scan.isShared);
  const [fixResult, setFixResult] = useState<FixAgentResult | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [monitorWebhookUrl, setMonitorWebhookUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [reanalyseContext, setReanalyseContext] = useState("");
  const [reanalyseError, setReanalyseError] = useState<string | null>(null);
  const [showReanalyseInput, setShowReanalyseInput] = useState(false);
  const [discoveryExpanded, setDiscoveryExpanded] = useState(false);
  const [checkStatusFilter, setCheckStatusFilter] = useState<"ALL" | "FAIL" | "WARN" | "PASS">("ALL");
  const [checksSortBySeverity, setChecksSortBySeverity] = useState(false);

  // Scan → Action: "+ Task" on failing checks creates a Portal task on the linked
  // client's board. We read the client's tasks to show "Added" for checks that
  // already have a task (idempotent across reloads).
  const { mutateAsync: createCheckTasks } = useBatchCreateTasks();
  const { data: clientTasks } = useTasks(
    scan.clientId ? { clientId: scan.clientId } : {},
    { enabled: Boolean(scan.clientId) },
  );
  const [addedCheckKeys, setAddedCheckKeys] = useState<Set<string>>(new Set());
  const [pendingCheckKey, setPendingCheckKey] = useState<string | null>(null);

  const existingPulseCheckKeys = new Set<string>();
  for (const t of clientTasks ?? []) {
    const meta = t.metadata as Record<string, unknown> | null;
    if (meta?.["source"] === "pulse_scan" && typeof meta["pulseCheckKey"] === "string") {
      existingPulseCheckKeys.add(meta["pulseCheckKey"] as string);
    }
  }

  async function addCheckTask(check: PulseScanCheckRecord) {
    if (!scan.clientId) return;
    setPendingCheckKey(check.checkKey);
    try {
      await createCheckTasks({
        clientId: scan.clientId,
        tasks: [
          {
            title: `[Pulse] ${check.label}`,
            description: [check.detail, check.evidence].filter(Boolean).join("\n\n") || undefined,
            priority: check.status === "FAIL" ? "HIGH" : "MEDIUM",
            metadata: {
              source: "pulse_scan",
              pulseScanId: scan.id,
              pulseCheckKey: check.checkKey,
              pulseCategory: check.category,
            },
          },
        ],
      });
      setAddedCheckKeys((s) => new Set(s).add(check.checkKey));
    } catch {
      /* swallow — button stays actionable */
    } finally {
      setPendingCheckKey(null);
    }
  }

  // Keep local share state in sync when the scan is re-fetched externally
  useEffect(() => {
    setShareToken(scan.shareToken);
    setIsShared(scan.isShared);
  }, [scan.shareToken, scan.isShared]);

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

  // ── Adaptive visibility ──────────────────────────────────────────────────────
  // Only surface widgets relevant to THIS product: a described idea has no checks
  // or live-site signals; a GitHub-only scan has no web vitals / screenshot; a URL
  // scan can prompt to add a repo. Server-side platform filtering already trims
  // irrelevant check categories — this trims the overview widgets to match.
  const isUrlScan = scan.inputType === "URL";
  const hasRunChecks = scan.checks.some((c) => c.status !== "SKIPPED");
  const showChecksGrid = hasRunChecks;                                  // 05
  const showTechStack = !!(scan.techStack && scan.techStack.length > 0); // 06
  const showWebVitals = !!scan.browserInsights || isUrlScan;             // 07 (data, or an actionable prompt on URL scans)
  const showCodeIntel = !!scan.codeInsights;                            // 09
  const showDeployIntel = !!scan.deployInsights;                        // 10

  // Detect incomplete AI analysis — key fields empty despite no hard error
  const isAnalysisIncomplete =
    !scan.aiError &&
    llm !== null &&
    llm !== undefined &&
    llm.criticalGaps.length === 0 &&
    llm.buildOpportunities.length === 0 &&
    (!llm.proposalHook || llm.proposalHook.trim() === "") &&
    (!llm.executiveSummary || llm.executiveSummary.trim() === "");

  const showReanalyseBanner = Boolean(scan.aiError) || isAnalysisIncomplete;

  async function handleReanalyse() {
    setReanalyseError(null);
    try {
      await reanalyse({ scanId: scan.id, context: reanalyseContext.trim() || undefined });
      setReanalyseContext("");
      setShowReanalyseInput(false);
    } catch (err) {
      setReanalyseError(err instanceof Error ? err.message : "Regeneration failed. Please try again.");
    }
  }

  const reportUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/report/${shareToken}` : null;

  async function handleShare() {
    setShareError(null);
    try {
      const result = await shareScan(scan.id);
      setShareToken(result.shareToken);
      setIsShared(true);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to generate share link.");
    }
  }

  async function handleUnshare() {
    setShareError(null);
    try {
      await unshareScan(scan.id);
      setShareToken(null);
      setIsShared(false);
      setCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to revoke share link.");
    }
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
    setFixError(null);
    try {
      const result = await runFix(scan.id);
      setFixResult(result);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : "Fix agent failed. Check your configuration and try again.");
    }
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

  // D3 — re-scan with the AI's suggested competitor benchmarks (max 3, per validator).
  const [benchmarking, setBenchmarking] = useState(false);
  async function handleBenchmarkSuggestions() {
    const urls = (llm?.competitorSuggestions ?? [])
      .map((s) => s.url.trim())
      .filter((u) => /^https?:\/\//i.test(u) || /\./.test(u))
      .slice(0, 3);
    if (urls.length === 0) return;
    setBenchmarking(true);
    try {
      const result = await createScan({
        projectName: scan.projectName,
        inputType: scan.inputType,
        inputUrl: scan.inputUrl ?? undefined,
        inputGithubRepo: scan.inputGithubRepo ?? undefined,
        inputDescription: scan.inputDescription ?? undefined,
        clientId: scan.clientId ?? undefined,
        competitorUrls: urls,
      });
      router.push(`/app/pulse/${result.scan.id}`);
    } finally {
      setBenchmarking(false);
    }
  }

  async function handleGenerateProposal() {
    setProposalGenError(null);
    try {
      const result = await generateProposal(scan.id);
      router.push(`/app/docs/${result.proposalId}`);
    } catch (err) {
      setProposalGenError(err instanceof Error ? err.message : "Failed to generate proposal.");
    }
  }

  const readinessByCategory = llm ? groupReadinessByCategory(llm.productionReadinessChecklist ?? []) : new Map();
  const missingCount = (llm?.productionBlockers?.length ?? 0) + (llm?.productionReadinessChecklist?.filter((i) => i.status === "MISSING").length ?? 0);

  const tabs: Array<{ id: Tab; label: string; count?: number; badgeColor?: "red" }> = [
    { id: "overview", label: "Overview" },
    { id: "readiness", label: "Readiness", count: missingCount },
    { id: "checks", label: "Health Checks", count: scan.checks.filter((c) => c.status === "FAIL").length, badgeColor: "red" as const },
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
            {scan.status === "COMPLETED" && llm && (
              scan.generatedProposalId ? (
                <Link href={`/app/docs/${scan.generatedProposalId}`}>
                  <Button variant="secondary" size="sm" leadingIcon={<DocumentTextIcon className="h-4 w-4" />}>
                    View proposal
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateProposal}
                  loading={generatingProposal}
                  leadingIcon={<DocumentTextIcon className="h-4 w-4" />}
                >
                  Generate proposal
                </Button>
              )
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
          {shareError && (
            <p className="text-[11px] text-red-600">{shareError}</p>
          )}
          {proposalGenError && (
            <p className="text-[11px] text-red-600">{proposalGenError}</p>
          )}
        </div>
      </div>

      {/* Agent panel */}
      {scan.status === "COMPLETED" && (
        <AgentPanel
          scan={scan}
          fixResult={fixResult}
          fixError={fixError}
          onAutoFix={handleAutoFix}
          fixing={fixing}
          canRunFixAgent={canRunFixAgent}
          onMonitor={handleMonitor}
          creatingMonitor={creatingMonitor}
          monitorWebhookUrl={monitorWebhookUrl}
          onDiscoverySuccess={() => setActiveTab("discovery")}
        />
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
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  tab.badgeColor === "red" ? "bg-red-100 text-red-700" : "bg-[var(--surface-2)] text-[var(--text-3)]",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* AI analysis banner — shown when AI failed or returned incomplete results */}
      {showReanalyseBanner && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {scan.aiError ? (
                <>
                  <p className="font-semibold">AI analysis unavailable</p>
                  <p className="mt-0.5 text-amber-700">{scan.aiError}</p>
                  <p className="mt-0.5 text-amber-700">Technical checks and scores above are accurate.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">AI analysis returned incomplete results</p>
                  <p className="mt-0.5 text-amber-700">Key narrative sections are empty. Regenerating may produce a better result.</p>
                </>
              )}
            </div>
            <button
              onClick={() => setShowReanalyseInput((v) => !v)}
              className="shrink-0 rounded-[8px] border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-50"
              disabled={reanalysing || scan.status === "RUNNING"}
            >
              {reanalysing ? "Regenerating…" : "Regenerate AI Analysis"}
            </button>
          </div>

          {showReanalyseInput && (
            <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
              <label className="block text-xs font-medium text-amber-800">
                Optional context — helps the AI produce a better result
              </label>
              <textarea
                value={reanalyseContext}
                onChange={(e) => setReanalyseContext(e.target.value)}
                placeholder="e.g. This is a B2B SaaS product for construction teams. The main concern is GDPR compliance and scalability."
                rows={3}
                className="w-full rounded-[8px] border border-amber-300 bg-white px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {reanalyseError && (
                <p className="text-xs text-red-600">{reanalyseError}</p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleReanalyse}
                  disabled={reanalysing}
                  size="sm"
                  className="bg-amber-700 text-white hover:bg-amber-800"
                >
                  {reanalysing ? "Regenerating…" : "Run Regeneration"}
                </Button>
                <button
                  onClick={() => { setShowReanalyseInput(false); setReanalyseError(null); }}
                  className="text-xs text-amber-700 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ OVERVIEW TAB — BENTO DASHBOARD ═══════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-3">

          {/* F5 — Launch Readiness verdict: a single go/no-go derived from health + blockers */}
          {scan.status === "COMPLETED" && scan.healthScore !== null && (() => {
            const score = scan.healthScore;
            const criticalBlockers = (llm?.productionBlockers ?? []).filter((b) => b.urgency === "CRITICAL").length;
            const failing = scan.checks.filter((c) => c.status === "FAIL").length;
            const ready = score >= 80 && criticalBlockers === 0;
            const nearly = !ready && score >= 55 && criticalBlockers <= 2;
            const verdict = ready ? "Launch-ready" : nearly ? "Nearly there" : "Not launch-ready";
            const tone = ready ? "#10b981" : nearly ? "#f59e0b" : "#ef4444";
            const bg = ready ? "bg-emerald-50" : nearly ? "bg-amber-50" : "bg-red-50";
            const gate = criticalBlockers > 0
              ? `${criticalBlockers} critical blocker${criticalBlockers !== 1 ? "s" : ""} to clear`
              : failing > 0
                ? `${failing} failing check${failing !== 1 ? "s" : ""} to resolve`
                : "no hard blockers remaining";
            return (
              <div className={cn("flex items-center justify-between gap-4 rounded-[12px] px-5 py-4", bg)}>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: tone }}>
                    <span className="font-serif text-lg font-bold text-white tabular-nums">{score}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: tone }}>{verdict}</p>
                    <p className="text-xs text-[var(--text-3)]">Launch readiness · {gate}</p>
                  </div>
                </div>
                <span className="widget-data-label hidden sm:block">{score}% ready</span>
              </div>
            );
          })()}

          {/* 01 // PROJECT HEALTH */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">01 // PROJECT HEALTH</span>
            </div>
            <div className="widget-body">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {scan.healthScore !== null && (
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <ScoreRing score={scan.healthScore} size={96} />
                    {scan.previousHealthScore !== null && scan.healthScore !== scan.previousHealthScore && (
                      <span className={cn(
                        "rounded-[6px] px-2 py-0.5 text-xs font-bold tabular-nums",
                        scan.healthScore > scan.previousHealthScore ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
                      )}>
                        {scan.healthScore > scan.previousHealthScore ? "+" : ""}{scan.healthScore - scan.previousHealthScore} vs last
                      </span>
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap gap-5 border-b border-[var(--border-2)] pb-4">
                    {[
                      { count: scan.checks.filter((c) => c.status === "PASS").length,         label: "Passing",      color: "text-emerald-600" },
                      { count: scan.checks.filter((c) => c.status === "WARN").length,         label: "Warnings",     color: "text-amber-600" },
                      { count: scan.checks.filter((c) => c.status === "FAIL").length,         label: "Failed",       color: "text-red-600" },
                      { count: scan.checks.filter((c) => c.status !== "SKIPPED").length,      label: "Total checks", color: "text-[var(--text-1)]" },
                    ].map(({ count, label, color }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className={cn("widget-stat-sm", color)}>{count}</span>
                        <span className="widget-data-label">{label}</span>
                      </div>
                    ))}
                  </div>
                  {(llm?.projectClassification || llm?.aiMaturityScore != null) && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {llm?.projectClassification && (
                        <span className="inline-flex items-center rounded-[6px] bg-[var(--surface-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-600)]">
                          {llm.projectClassification.type}
                        </span>
                      )}
                      {llm?.projectClassification?.subtype && (
                        <span className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                          {llm.projectClassification.subtype}
                        </span>
                      )}
                      {llm?.aiMaturityScore != null && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-semibold",
                            llm.aiMaturityScore >= 3
                              ? "bg-emerald-50 text-emerald-700"
                              : llm.aiMaturityScore >= 2
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-600",
                          )}
                          title="AI Maturity Score — how production-ready this AI-powered product is"
                        >
                          AI L{llm.aiMaturityScore} — {AI_MATURITY_LABELS[llm.aiMaturityScore]}
                        </span>
                      )}
                    </div>
                  )}
                  {llm?.executiveSummary ? (
                    <p className="text-sm leading-7 text-[var(--text-2)]">{llm.executiveSummary}</p>
                  ) : !llm ? (
                    <AiUnavailable aiError={scan.aiError} />
                  ) : null}
                  {llm?.proposalHook && (
                    <div className="mt-4 rounded-[6px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-4 py-3">
                      <p className="widget-data-label mb-1">Discovery call opener</p>
                      <p className="text-sm italic leading-6 text-[var(--text-1)]">&ldquo;{llm.proposalHook}&rdquo;</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Blockers · Gaps · Quick Wins */}
          {llm && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

              {/* 02 // PRODUCTION BLOCKERS */}
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">02 // PRODUCTION BLOCKERS</span>
                  {(llm.productionBlockers as ProductionBlocker[])?.filter((b) => b.urgency === "CRITICAL").length > 0 && (
                    <span className="widget-header-right" style={{ color: "#dc2626" }}>
                      {(llm.productionBlockers as ProductionBlocker[]).filter((b) => b.urgency === "CRITICAL").length} critical
                    </span>
                  )}
                </div>
                <div className="widget-body-compact space-y-2.5">
                  {!llm.productionBlockers || (llm.productionBlockers as ProductionBlocker[]).length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-sm text-emerald-700">No blockers found</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0.5 border-b border-[var(--border-2)] pb-2.5">
                        <span className={cn("widget-stat-sm", (llm.productionBlockers as ProductionBlocker[]).some((b) => b.urgency === "CRITICAL") ? "text-red-600" : "text-amber-600")}>
                          {(llm.productionBlockers as ProductionBlocker[]).length}
                        </span>
                        <span className="widget-data-label">Blockers</span>
                      </div>
                      {(llm.productionBlockers as ProductionBlocker[]).slice(0, 4).map((blocker, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <XCircleIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", blocker.urgency === "CRITICAL" ? "text-red-500" : "text-orange-400")} />
                          <p className="text-xs leading-5 text-[var(--text-2)]">{blocker.blocker}</p>
                        </div>
                      ))}
                      {(llm.productionBlockers as ProductionBlocker[]).length > 4 && (
                        <button type="button" onClick={() => setActiveTab("readiness")} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                          +{(llm.productionBlockers as ProductionBlocker[]).length - 4} more →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 03 // CRITICAL GAPS */}
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">03 // CRITICAL GAPS</span>
                  {llm.criticalGaps.length > 0 && (
                    <span className="widget-header-right">{llm.criticalGaps.length} total</span>
                  )}
                </div>
                <div className="widget-body-compact space-y-2.5">
                  {llm.criticalGaps.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-sm text-emerald-700">No critical gaps</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0.5 border-b border-[var(--border-2)] pb-2.5">
                        <span className="widget-stat-sm text-red-600">
                          {llm.criticalGaps.filter((g) => g.urgency === "CRITICAL" || g.urgency === "HIGH").length}
                        </span>
                        <span className="widget-data-label">High priority</span>
                      </div>
                      {llm.criticalGaps.slice(0, 4).map((gap, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <ExclamationTriangleIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", gap.urgency === "CRITICAL" ? "text-red-500" : gap.urgency === "HIGH" ? "text-orange-500" : "text-amber-500")} />
                          <p className="text-xs leading-5 text-[var(--text-2)]">{gap.gap}</p>
                        </div>
                      ))}
                      {llm.criticalGaps.length > 4 && (
                        <button type="button" onClick={() => setActiveTab("gaps")} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                          +{llm.criticalGaps.length - 4} more →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 04 // QUICK WINS */}
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">04 // QUICK WINS</span>
                </div>
                <div className="widget-body-compact space-y-2.5">
                  {(() => {
                    const wins = llm.buildOpportunities.filter((o) => o.businessValue === "HIGH" && (o.estimatedEffort === "S" || o.estimatedEffort === "M"));
                    const list = wins.length > 0 ? wins : llm.buildOpportunities;
                    if (list.length === 0) return <p className="py-1 text-sm text-[var(--text-3)]">No opportunities identified.</p>;
                    return (
                      <>
                        <div className="flex flex-col gap-0.5 border-b border-[var(--border-2)] pb-2.5">
                          <span className="widget-stat-sm text-emerald-600">{list.length}</span>
                          <span className="widget-data-label">{wins.length > 0 ? "High value · low effort" : "Opportunities"}</span>
                        </div>
                        {list.slice(0, 4).map((opp, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <LightBulbIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-500)]" />
                            <p className="text-xs leading-5 text-[var(--text-2)]">{opp.title}</p>
                          </div>
                        ))}
                        {list.length > 4 && (
                          <button type="button" onClick={() => setActiveTab("opportunities")} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                            +{list.length - 4} more →
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 05 // AUTOMATED CHECKS */}
          {showChecksGrid && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">05 // AUTOMATED CHECKS</span>
              <span className="widget-header-right">{scan.checks.filter((c) => c.status !== "SKIPPED").length} checks run</span>
            </div>
            <div className="widget-body">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from(checksByCategory.entries()).map(([category, checks]) => {
                  const applicable = checks.filter((c) => c.status !== "SKIPPED");
                  if (!applicable.length) return null;
                  const total  = applicable.length;
                  const score  = categoryScore(checks);
                  const passed = applicable.filter((c) => c.status === "PASS").length;
                  const failed = applicable.filter((c) => c.status === "FAIL").length;
                  const warned = applicable.filter((c) => c.status === "WARN").length;
                  const scoreTextColor = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600";
                  const pct = (n: number) => `${(n / total) * 100}%`;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => { setActiveTab("checks"); toggleCategory(category); }}
                      className="flex flex-col gap-2.5 rounded-[10px] border border-[var(--border-2)] p-3 text-left transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]"
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className={cn("font-serif text-3xl font-bold leading-none tabular-nums", scoreTextColor)}>{score}</span>
                        <span className="widget-data-label">{passed}/{total}</span>
                      </div>
                      {/* Segmented composition bar: pass (green) · warn (amber) · fail (red) */}
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-2)]">
                        {passed > 0 && <div style={{ width: pct(passed), backgroundColor: "#10b981" }} />}
                        {warned > 0 && <div style={{ width: pct(warned), backgroundColor: "#f59e0b" }} />}
                        {failed > 0 && <div style={{ width: pct(failed), backgroundColor: "#ef4444" }} />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold leading-4 text-[var(--text-1)]">{category}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium leading-4 tabular-nums">
                          {failed > 0 && <span className="text-red-600">{failed} fail</span>}
                          {warned > 0 && <span className="text-amber-600">{warned} warn</span>}
                          {passed > 0 && <span className="text-emerald-600">{passed} pass</span>}
                          {failed === 0 && warned === 0 && (
                            <span className="text-emerald-600">All {total} passing</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Row: Tech Stack · Web Vitals */}
          {(showTechStack || showWebVitals) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

            {/* 06 // TECH STACK */}
            {showTechStack && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">06 // TECH STACK</span>
                {scan.techStack && scan.techStack.length > 0 && (
                  <span className="widget-header-right">{scan.techStack.length} detected</span>
                )}
              </div>
              <div className="widget-body-compact">
                {scan.techStack && scan.techStack.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {scan.techStack.map((t) => (
                      <span key={t} className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="py-1 text-sm text-[var(--text-3)]">No tech stack detected. Add a GitHub repo URL for code-level detection.</p>
                )}
                {llm?.techStackAnalysis?.assessment && (
                  <p className="mt-3 border-t border-[var(--border-2)] pt-3 text-xs leading-5 text-[var(--text-3)]">{llm.techStackAnalysis.assessment}</p>
                )}
              </div>
            </div>
            )}

            {/* 07 // WEB VITALS */}
            {showWebVitals && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">07 // WEB VITALS</span>
                {scan.browserInsights && <span className="widget-header-right">Lighthouse · mobile</span>}
              </div>
              <div className="widget-body-compact">
                {scan.browserInsights ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      <VitalScore label="Perf"  score={scan.browserInsights.performanceScore} />
                      <VitalScore label="A11y"  score={scan.browserInsights.accessibilityScore} />
                      <VitalScore label="SEO"   score={scan.browserInsights.seoScore} />
                      <VitalScore label="BP"    score={scan.browserInsights.bestPracticesScore} />
                    </div>
                    {(scan.browserInsights.lcp !== null || scan.browserInsights.fcp !== null) && (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {scan.browserInsights.lcp !== null && <VitalMetric label="LCP" value={scan.browserInsights.lcp >= 1000 ? `${(scan.browserInsights.lcp / 1000).toFixed(1)} s` : `${scan.browserInsights.lcp} ms`} status={scan.browserInsights.lcp <= 2500 ? "PASS" : scan.browserInsights.lcp <= 4000 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.fcp !== null && <VitalMetric label="FCP" value={scan.browserInsights.fcp >= 1000 ? `${(scan.browserInsights.fcp / 1000).toFixed(1)} s` : `${scan.browserInsights.fcp} ms`} status={scan.browserInsights.fcp <= 1800 ? "PASS" : scan.browserInsights.fcp <= 3000 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.tbt !== null && <VitalMetric label="TBT" value={scan.browserInsights.tbt >= 1000 ? `${(scan.browserInsights.tbt / 1000).toFixed(1)} s` : `${scan.browserInsights.tbt} ms`} status={scan.browserInsights.tbt <= 200 ? "PASS" : scan.browserInsights.tbt <= 600 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.cls !== null && <VitalMetric label="CLS" value={scan.browserInsights.cls.toFixed(3)} status={scan.browserInsights.cls <= 0.1 ? "PASS" : scan.browserInsights.cls <= 0.25 ? "WARN" : "FAIL"} />}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-1 text-sm text-[var(--text-3)]">
                    {scan.inputType === "URL"
                      ? "Run the Browser & Performance agent (above) to capture Lighthouse scores + Core Web Vitals."
                      : "Web vitals need a live URL — they're not available for this scan type."}
                  </p>
                )}
              </div>
            </div>
            )}
          </div>
          )}

          {/* 08 // BUILD ROADMAP */}
          {llm && llm.scalingRoadmap.length > 0 && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">08 // BUILD ROADMAP</span>
                <span className="widget-header-right">{llm.scalingRoadmap.length} phases</span>
              </div>
              <div className="widget-body">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {llm.scalingRoadmap.map((phase, i) => (
                    <div key={phase.phase} className="flex flex-1 items-start gap-3 sm:flex-col sm:gap-0">
                      <div className="flex items-center sm:mb-3 sm:w-full">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-gray-900 text-xs font-bold text-white">
                          {phase.phase}
                        </div>
                        {i < llm.scalingRoadmap.length - 1 && (
                          <div className="ml-3 hidden h-px flex-1 bg-[var(--border-2)] sm:block" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 sm:pr-4">
                        <p className="text-xs font-semibold text-[var(--text-1)]">{phase.title}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--text-4)]">{phase.duration}</p>
                        <ul className="mt-1.5 space-y-0.5">
                          {phase.goals.slice(0, 2).map((goal, gi) => (
                            <li key={gi} className="text-[11px] leading-4 text-[var(--text-3)]">· {goal}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Row: Code Intelligence · Deploy Intelligence */}
          {(scan.codeInsights || scan.deployInsights) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {/* 09 // CODE INTELLIGENCE */}
              {showCodeIntel && (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">09 // CODE INTELLIGENCE</span>
                  {scan.codeInsights && <span className="widget-header-right">GitHub GraphQL</span>}
                </div>
                <div className="widget-body-compact">
                  {scan.codeInsights ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                        <p className="widget-data-label mb-1">Vulnerabilities</p>
                        {scan.codeInsights.vulnerabilities.length === 0 ? (
                          <p className="text-sm font-semibold text-emerald-600">None</p>
                        ) : (
                          <p className="text-sm font-semibold text-red-600">
                            {scan.codeInsights.vulnerabilities.filter((v) => v.severity === "CRITICAL").length}C · {scan.codeInsights.vulnerabilities.filter((v) => v.severity === "HIGH").length}H
                          </p>
                        )}
                      </div>
                      <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                        <p className="widget-data-label mb-1">Branch protection</p>
                        <p className={cn("text-sm font-semibold", scan.codeInsights.branchProtected ? "text-emerald-600" : "text-red-600")}>
                          {scan.codeInsights.branchProtected ? (scan.codeInsights.requiresReviews ? "Protected + reviews" : "Protected") : "None"}
                        </p>
                      </div>
                      {scan.codeInsights.commitVelocity !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Velocity</p>
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {scan.codeInsights.commitVelocity} <span className="text-xs font-normal text-[var(--text-3)]">commits/wk</span>
                          </p>
                        </div>
                      )}
                      {scan.codeInsights.prReviewRate !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">PR reviews</p>
                          <p className={cn("text-sm font-semibold", scan.codeInsights.prReviewRate >= 0.7 ? "text-emerald-600" : scan.codeInsights.prReviewRate >= 0.3 ? "text-amber-600" : "text-red-600")}>
                            {Math.round(scan.codeInsights.prReviewRate * 100)}%
                          </p>
                        </div>
                      )}
                      {(() => {
                        const secrets = scan.codeInsights.exposedSecrets ?? [];
                        return (
                          <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">Exposed secrets</p>
                            {secrets.length === 0 ? (
                              <p className="text-sm font-semibold text-emerald-600">None</p>
                            ) : (
                              <p className="text-sm font-semibold text-red-600" title={secrets.map((s) => `${s.type} in ${s.file}`).join("\n")}>
                                {secrets.length} found
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {scan.codeInsights.uniqueContributors !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Contributors</p>
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {scan.codeInsights.uniqueContributors}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[6px] border border-dashed border-[var(--border-2)] p-4 text-center">
                      <p className="text-xs font-medium text-[var(--text-3)]">No GitHub repo provided</p>
                      <p className="mt-0.5 text-xs text-[var(--text-4)]">Add a repo URL for code-level insights</p>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 10 // DEPLOY INTELLIGENCE */}
              {showDeployIntel && (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">10 // DEPLOY INTELLIGENCE</span>
                  {scan.deployInsights?.platform && (
                    <span className="widget-header-right capitalize">{scan.deployInsights.platform}</span>
                  )}
                </div>
                <div className="widget-body-compact">
                  {scan.deployInsights && (scan.deployInsights.platform || scan.deployInsights.recentDeployments !== null) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {scan.deployInsights.recentDeployments !== null && scan.deployInsights.failedDeployments !== null && (() => {
                        const rate = (scan.deployInsights.recentDeployments! - scan.deployInsights.failedDeployments!) / scan.deployInsights.recentDeployments!;
                        return (
                          <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">Success rate</p>
                            <p className={cn("text-sm font-semibold", rate >= 0.9 ? "text-emerald-600" : rate >= 0.7 ? "text-amber-600" : "text-red-600")}>
                              {scan.deployInsights.recentDeployments! - scan.deployInsights.failedDeployments!}/{scan.deployInsights.recentDeployments}
                            </p>
                          </div>
                        );
                      })()}
                      {scan.deployInsights.avgBuildMs !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Avg build</p>
                          <p className={cn("text-sm font-semibold",
                            scan.deployInsights.avgBuildMs < 60_000 ? "text-emerald-600"
                            : scan.deployInsights.avgBuildMs < 180_000 ? "text-amber-600"
                            : "text-red-600",
                          )}>
                            {Math.round(scan.deployInsights.avgBuildMs / 1000)}s
                          </p>
                        </div>
                      )}
                      {scan.deployInsights.buildWarnings.length > 0 && (
                        <div className="col-span-2 rounded-[6px] bg-amber-50 p-2.5">
                          <p className="widget-data-label mb-1" style={{ color: "#92400e" }}>Build warnings</p>
                          <p className="text-sm font-semibold text-amber-700">{scan.deployInsights.buildWarnings.length}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[6px] border border-dashed border-[var(--border-2)] p-4 text-center">
                      <p className="text-xs font-medium text-[var(--text-3)]">No deploy data available</p>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {/* 11 // DISCOVERY KIT */}
          {scan.discoveryKit && (
            <div className="widget-card">
              <button
                type="button"
                className="widget-header w-full text-left"
                onClick={() => setDiscoveryExpanded((v) => !v)}
              >
                <span className="widget-header-label">{"11 // DISCOVERY KIT"}</span>
                <span className="widget-header-right flex items-center gap-1.5">
                  {scan.discoveryKit.questions.length} questions · £{scan.discoveryKit.pricingAnchor.low.toLocaleString()}–£{scan.discoveryKit.pricingAnchor.high.toLocaleString()}
                  <ChevronDownIcon className={cn("h-3 w-3 transition-transform", discoveryExpanded && "rotate-180")} />
                </span>
              </button>
              {discoveryExpanded ? (
                <div className="widget-body">
                  <DiscoveryTab kit={scan.discoveryKit} />
                </div>
              ) : (
                <div className="widget-body-compact">
                  <p className="text-sm italic leading-6 text-[var(--text-1)]">&ldquo;{scan.discoveryKit.openingStatement}&rdquo;</p>
                  <p className="mt-2 text-xs text-[var(--text-4)]">Expand to see questions, objections, and pricing anchor</p>
                </div>
              )}
            </div>
          )}

          {/* 12 // PRIORITY ACTION PLAN */}
          {llm && <PriorityActionPlan llm={llm} onTabChange={setActiveTab} clientId={scan.clientId} scanId={scan.id} />}

          {/* 13 // SUGGESTED BENCHMARKS — AI-discovered competitors to scan against */}
          {!scan.competitorData && (llm?.competitorSuggestions?.length ?? 0) > 0 && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{"13 // SUGGESTED BENCHMARKS"}</span>
                <span className="widget-header-right">AI-discovered</span>
              </div>
              <div className="widget-body space-y-3">
                <p className="text-xs text-[var(--text-3)]">
                  Likely competitors in this vertical. Re-scan to benchmark this project&apos;s health score against them.
                </p>
                <div className="space-y-1.5">
                  {llm!.competitorSuggestions!.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--text-1)]">
                          {c.name || c.url.replace(/^https?:\/\//, "")}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-3)]">{c.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={handleBenchmarkSuggestions} loading={benchmarking} className="w-full">
                  Benchmark against these →
                </Button>
              </div>
            </div>
          )}

          {/* 14 // INDUSTRY BENCHMARKS — Wave E3: rank vs same-type scans in this workspace */}
          {benchmark && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{"14 // INDUSTRY BENCHMARKS"}</span>
                <span className="widget-header-right">vs {benchmark.peerCount} {benchmark.projectType} scan{benchmark.peerCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="widget-body">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="widget-data-label mb-1">Your percentile</p>
                    <p className={cn(
                      "font-serif text-4xl font-bold leading-none tabular-nums",
                      benchmark.percentile >= 75 ? "text-emerald-600" : benchmark.percentile >= 40 ? "text-amber-600" : "text-red-600",
                    )}>
                      {benchmark.percentile}<span className="text-lg">th</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[var(--text-3)]">
                      {benchmark.percentile >= 50
                        ? `Ahead of ${benchmark.percentile}% of ${benchmark.projectType} projects you've scanned`
                        : `Behind the typical ${benchmark.projectType} project — room to climb`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="widget-data-label mb-1">Score</p>
                    <p className="text-sm text-[var(--text-2)] tabular-nums">
                      you <span className="font-semibold text-[var(--text-1)]">{benchmark.yourScore}</span> · median {benchmark.median} · best {benchmark.best}
                    </p>
                  </div>
                </div>
                {/* Position bar: median marker + your marker on a 0–100 scale */}
                <div className="relative mt-4 h-2 w-full rounded-full bg-[var(--border-2)]">
                  <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-[var(--text-4)]" style={{ left: `${benchmark.median}%` }} title={`Median ${benchmark.median}`} />
                  <div
                    className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full"
                    style={{ left: `${benchmark.yourScore}%`, backgroundColor: benchmark.percentile >= 75 ? "#10b981" : benchmark.percentile >= 40 ? "#f59e0b" : "#ef4444" }}
                    title={`You ${benchmark.yourScore}`}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--text-4)]"><span>0</span><span>median</span><span>100</span></div>
              </div>
            </div>
          )}

          {/* 15 // VISUAL QUALITY — Wave D1 vision-AI score + F4 axe-core accessibility */}
          {scan.visualInsights && (scan.visualInsights.visualQualityScore !== null || (scan.visualInsights.a11yViolations ?? null) !== null) && (() => {
            const v = scan.visualInsights!;
            const tone = (n: number | null) => n === null ? "text-[var(--text-3)]" : n >= 75 ? "text-emerald-600" : n >= 50 ? "text-amber-600" : "text-red-600";
            const sub: Array<[string, number | null]> = [
              ["Value prop", v.valuePropClarity],
              ["CTA", v.ctaProminence],
              ["Trust", v.trustSignals],
            ];
            const hasVision = v.visualQualityScore !== null;
            const a11y = v.a11yViolations ?? null;
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{"15 // VISUAL QUALITY"}</span>
                  <span className="widget-header-right">AI vision · above the fold</span>
                </div>
                <div className="widget-body">
                  {hasVision && (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="widget-data-label mb-1">Visual polish</p>
                          <p className={cn("font-serif text-4xl font-bold leading-none tabular-nums", tone(v.visualQualityScore))}>
                            {v.visualQualityScore}<span className="text-lg text-[var(--text-4)]">/100</span>
                          </p>
                        </div>
                        {v.mobileFriendly !== null && (
                          <span className={cn(
                            "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-semibold",
                            v.mobileFriendly ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                          )}>
                            {v.mobileFriendly ? "Mobile-ready" : "Mobile issues"}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {sub.map(([label, n]) => (
                          <div key={label} className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">{label}</p>
                            <p className={cn("text-sm font-semibold tabular-nums", tone(n))}>{n ?? "—"}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {a11y !== null && (
                    <div className={cn("rounded-[6px] bg-[var(--surface-1)] p-2.5", hasVision && "mt-2")}>
                      <p className="widget-data-label mb-1">Accessibility (axe-core)</p>
                      <p className={cn("text-sm font-semibold tabular-nums", a11y === 0 ? "text-emerald-600" : (v.a11ySerious ?? 0) > 0 ? "text-red-600" : "text-amber-600")}>
                        {a11y === 0 ? "No violations" : `${a11y} violation${a11y !== 1 ? "s" : ""}${(v.a11ySerious ?? 0) > 0 ? ` · ${v.a11ySerious} serious` : ""}`}
                      </p>
                    </div>
                  )}
                  {v.visualNarrative && (
                    <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">{v.visualNarrative}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 16 // ENGAGEMENT ESTIMATE — F3: indicative effort/cost/timeline to production */}
          {llm?.engagementEstimate && (llm.engagementEstimate.weeksHigh > 0 || llm.engagementEstimate.priceHigh > 0) && (() => {
            const e = llm.engagementEstimate!;
            const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
            const weeks = e.weeksLow && e.weeksHigh && e.weeksLow !== e.weeksHigh ? `${e.weeksLow}–${e.weeksHigh}` : `${e.weeksHigh || e.weeksLow}`;
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{"16 // ENGAGEMENT ESTIMATE"}</span>
                  <span className="widget-header-right">{e.confidence} confidence · indicative</span>
                </div>
                <div className="widget-body">
                  {e.summary && <p className="mb-4 text-sm leading-6 text-[var(--text-2)]">{e.summary}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[8px] bg-[var(--surface-1)] p-3">
                      <p className="widget-data-label mb-1">Timeline</p>
                      <p className="font-serif text-3xl font-bold leading-none tabular-nums text-[var(--text-1)]">
                        {weeks}<span className="text-base font-normal text-[var(--text-3)]"> wks</span>
                      </p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--surface-1)] p-3">
                      <p className="widget-data-label mb-1">Indicative cost</p>
                      <p className="font-serif text-3xl font-bold leading-none tabular-nums text-[var(--text-1)]">
                        {e.priceHigh > 0 ? `${gbp(e.priceLow)}–${gbp(e.priceHigh)}` : "—"}
                      </p>
                    </div>
                  </div>
                  {e.phases.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {e.phases.map((p, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-[8px] border border-[var(--border-2)] px-3 py-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand-soft)] text-[10px] font-bold text-[var(--brand-600)]">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[var(--text-1)]">{p.name}{p.weeks > 0 ? ` · ${p.weeks} wk${p.weeks !== 1 ? "s" : ""}` : ""}</p>
                            {p.outcome && <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-3)]">{p.outcome}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] leading-4 text-[var(--text-4)]">
                    Indicative only — generate a proposal to refine scope, rates and a fixed quote.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* 17 // INTAKE & RISK — F2: stage, market, feasibility, regulatory landmines */}
          {llm?.intakeAssessment && (() => {
            const a = llm.intakeAssessment!;
            const stageTone: Record<string, string> = {
              IDEA: "bg-purple-50 text-purple-700",
              PROTOTYPE: "bg-amber-50 text-amber-700",
              MVP: "bg-blue-50 text-blue-700",
              PRODUCTION: "bg-emerald-50 text-emerald-700",
            };
            const sevTone: Record<string, string> = {
              HIGH: "border-red-200 bg-red-50 text-red-700",
              MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
              LOW: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]",
            };
            const rows: Array<[string, string]> = [
              ["Market signal", a.marketSignal],
              ["Feasibility", a.feasibility],
              ["Riskiest assumption", a.riskiestAssumption],
            ];
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{"17 // INTAKE & RISK"}</span>
                  {a.stage && (
                    <span className={cn("inline-flex items-center rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", stageTone[a.stage] ?? "bg-[var(--surface-1)] text-[var(--text-2)]")}>
                      {a.stage}
                    </span>
                  )}
                </div>
                <div className="widget-body space-y-3">
                  {a.regulatoryFlags.length > 0 && (
                    <div>
                      <p className="widget-data-label mb-1.5">Regulatory landmines</p>
                      <div className="space-y-1.5">
                        {a.regulatoryFlags.map((f, i) => (
                          <div key={i} className={cn("rounded-[8px] border px-3 py-2", sevTone[f.severity] ?? sevTone.LOW)}>
                            <p className="text-xs font-semibold">{f.area}</p>
                            <p className="mt-0.5 text-[11px] leading-4 opacity-90">{f.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {rows.filter(([, v]) => v).map(([label, v]) => (
                    <div key={label}>
                      <p className="widget-data-label mb-0.5">{label}</p>
                      <p className="text-sm leading-6 text-[var(--text-2)]">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {activeTab === "checks" && (() => {
        const failCount = scan.checks.filter((c) => c.status === "FAIL").length;
        const warnCount = scan.checks.filter((c) => c.status === "WARN").length;
        const passCount = scan.checks.filter((c) => c.status === "PASS").length;

        let entries = Array.from(checksByCategory.entries());
        if (checkStatusFilter !== "ALL") {
          entries = entries.filter(([, checks]) => checks.some((c) => c.status === checkStatusFilter));
        }
        if (checksSortBySeverity) {
          entries = [...entries].sort(([, a], [, b]) => {
            const aFail = a.filter((c) => c.status === "FAIL").length;
            const bFail = b.filter((c) => c.status === "FAIL").length;
            if (aFail !== bFail) return bFail - aFail;
            return b.filter((c) => c.status === "WARN").length - a.filter((c) => c.status === "WARN").length;
          });
        }

        return (
          <div className="space-y-3">
            {/* Filter chips + sort toggle */}
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "FAIL", "WARN", "PASS"] as const).map((f) => {
                const count = f === "ALL" ? scan.checks.filter((c) => c.status !== "SKIPPED").length : f === "FAIL" ? failCount : f === "WARN" ? warnCount : passCount;
                const isActive = checkStatusFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCheckStatusFilter(f)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      isActive && f === "FAIL" ? "border-red-300 bg-red-100 text-red-700"
                      : isActive && f === "WARN" ? "border-amber-300 bg-amber-100 text-amber-700"
                      : isActive && f === "PASS" ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                      : isActive ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    {f === "ALL" ? "All" : f === "FAIL" ? "Failing" : f === "WARN" ? "Warnings" : "Passing"} ({count})
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setChecksSortBySeverity((v) => !v)}
                className={cn(
                  "ml-auto rounded-[6px] border px-3 py-1 text-xs font-medium transition",
                  checksSortBySeverity
                    ? "border-gray-700 bg-gray-900 text-white"
                    : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                )}
              >
                {checksSortBySeverity ? "Severity ↓" : "Sort: Category"}
              </button>
            </div>

            {/* Category list */}
            <div className="space-y-2">
              {entries.map(([category, checks]) => {
                const applicable = checks.filter((c) => c.status !== "SKIPPED");
                if (!applicable.length) return null;
                const score = categoryScore(checks);
                const failed = checks.filter((c) => c.status === "FAIL").length;
                const warned = checks.filter((c) => c.status === "WARN").length;
                const passed = checks.filter((c) => c.status === "PASS").length;
                const hasIssues = failed > 0 || warned > 0;
                const isExpanded = expandedCategories.has(category) || checkStatusFilter !== "ALL";
                const visibleChecks = applicable.filter((c) => checkStatusFilter === "ALL" || c.status === checkStatusFilter);

                return (
                  <div key={category} className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
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
                        {visibleChecks.map((check) => (
                          <div key={check.id} className={cn(
                            "flex items-start gap-3 px-4 py-3",
                            check.status === "FAIL" ? "bg-red-50" : "bg-[var(--surface-1)]",
                          )}>
                            <span className="mt-0.5 text-base">
                              <PulseCheckStatusIcon status={check.status} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                              {check.detail && (
                                <p className="mt-0.5 text-xs text-[var(--text-3)]">{check.detail}</p>
                              )}
                            </div>
                            {scan.clientId && (check.status === "FAIL" || check.status === "WARN") && (() => {
                              const added = addedCheckKeys.has(check.checkKey) || existingPulseCheckKeys.has(check.checkKey);
                              const pending = pendingCheckKey === check.checkKey;
                              return (
                                <button
                                  type="button"
                                  disabled={added || pending}
                                  onClick={() => addCheckTask(check)}
                                  className={cn(
                                    "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-default",
                                    added
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-[var(--border-2)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                                  )}
                                  title={added ? "On this client's task board" : "Add to this client's task board"}
                                >
                                  {pending ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  ) : added ? (
                                    <CheckCircleIcon className="h-3 w-3" />
                                  ) : (
                                    <PlusIcon className="h-3 w-3" />
                                  )}
                                  {added ? "Added" : "Task"}
                                </button>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {activeTab === "gaps" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "gaps" && llm && (
        <div className="space-y-3">
          {llm.criticalGaps.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No critical gaps identified.</p>
          )}
          {llm.criticalGaps.map((gap, i) => (
            <div
              key={i}
              className="rounded-[10px] border border-[var(--border-2)] p-4"
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
            <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
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
          {llm.productionBlockers && llm.productionBlockers.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-1)]">Launch blockers</p>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {(llm.productionBlockers as ProductionBlocker[]).filter((b) => b.urgency === "CRITICAL").length} critical
                </span>
              </div>
              <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-red-200">
                {(llm.productionBlockers as ProductionBlocker[]).map((blocker, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <XCircleIcon className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      blocker.urgency === "CRITICAL" ? "text-red-500" : "text-orange-400",
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text-1)]">{blocker.blocker}</p>
                        {blocker.recommendedService && (
                          <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-xs font-medium text-[var(--brand-700)]">
                            {blocker.recommendedService}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">{blocker.why}</p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      blocker.urgency === "CRITICAL" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700",
                    )}>
                      {blocker.urgency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                <div className="divide-y divide-[var(--border-2)] rounded-[10px] border border-[var(--border-2)]">
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
