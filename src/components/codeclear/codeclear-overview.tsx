"use client";

import {
  ArrowPathIcon,
  ArrowRightIcon,
  BeakerIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  PlayCircleIcon,
  PlusIcon,
  SparklesIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCodeClearCandidates, useCodeClearStats } from "@/hooks/use-codeclear";
import { cn, formatDate } from "@/lib/format";
import { statusLabel } from "@/types/codeclear";
import {
  CodeClearAnalysisBadge,
  CodeClearScoreBadge,
  CodeClearStatusBadge,
  CodeClearTabs,
  EmptyState,
  MetricCard,
  StackPill,
} from "@/components/codeclear/codeclear-shared";

// Human-readable labels for activity event types
const EVENT_META: Record<string, { label: string; icon: typeof SparklesIcon; tone: string }> = {
  SOURCED: {
    label: "Candidate added to pipeline",
    icon: UserPlusIcon,
    tone: "text-sky-600 bg-sky-50 border-sky-200",
  },
  STATUS_CHANGE: {
    label: "Pipeline stage updated",
    icon: ArrowPathIcon,
    tone: "text-slate-600 bg-slate-50 border-slate-200",
  },
  RECHECK_FLAGGED: {
    label: "Flagged for re-check",
    icon: ClockIcon,
    tone: "text-amber-600 bg-amber-50 border-amber-200",
  },
  GITHUB_ANALYSIS_STARTED: {
    label: "GitHub scan started",
    icon: PlayCircleIcon,
    tone: "text-sky-600 bg-sky-50 border-sky-200",
  },
  GITHUB_ANALYSIS_COMPLETED: {
    label: "GitHub scan completed",
    icon: CheckCircleIcon,
    tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  GITHUB_ANALYSIS_FAILED: {
    label: "GitHub scan failed",
    icon: ExclamationTriangleIcon,
    tone: "text-rose-600 bg-rose-50 border-rose-200",
  },
  ANALYSIS_APPLIED: {
    label: "Analysis applied to score draft",
    icon: SparklesIcon,
    tone: "text-violet-600 bg-violet-50 border-violet-200",
  },
  SCORE_FINALIZED: {
    label: "Score finalized",
    icon: CheckCircleIcon,
    tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  NOTE_ADDED: {
    label: "Note added",
    icon: PencilSquareIcon,
    tone: "text-slate-600 bg-slate-50 border-slate-200",
  },
  PLACED: {
    label: "Placed with client",
    icon: CheckCircleIcon,
    tone: "text-violet-600 bg-violet-50 border-violet-200",
  },
};

function getEventMeta(eventType: string) {
  return (
    EVENT_META[eventType] ?? {
      label: eventType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      icon: ArrowPathIcon,
      tone: "text-slate-600 bg-slate-50 border-slate-200",
    }
  );
}

export function CodeClearOverview() {
  const statsQuery = useCodeClearStats();
  const spotlightQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 6,
    sortBy: "overallScore",
    sortDir: "desc",
  });
  const allCandidatesQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 100,
    sortBy: "createdAt",
    sortDir: "desc",
  });

  const stats = statsQuery.data;
  const spotlight = spotlightQuery.data?.items ?? [];
  const allCandidates = allCandidatesQuery.data?.items ?? [];

  const stageTotal = (stats?.byStatus ?? []).reduce((sum, e) => sum + e.count, 0);

  // Derived: signal coverage
  const scanned = allCandidates.filter(
    (c) => c.analysisState === "COMPLETE" || c.analysisState === "DRAFT_UPDATED",
  ).length;
  const coveragePct =
    allCandidates.length > 0 ? Math.round((scanned / allCandidates.length) * 100) : null;

  // Derived: how many are actively scanning right now
  const scanning = allCandidates.filter((c) => c.analysisState === "RUNNING").length;

  const neverScanned = allCandidates.filter((c) => c.analysisState === "NEVER_RUN").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CodeClearTabs />
        <div className="flex items-center gap-2">
          <Link href="/app/codeclear/pipeline">
            <Button type="button" variant="secondary" size="sm" trailingIcon={<ArrowRightIcon className="h-3.5 w-3.5" />}>
              Open pipeline
            </Button>
          </Link>
          <Link href="/app/codeclear/candidates">
            <Button type="button" variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />}>
              Add candidate
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {(neverScanned > 0 || (stats?.recheckDue ?? 0) > 0) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {neverScanned > 0 ? (
            <Link
              href="/app/codeclear/pipeline"
              className="flex flex-1 items-center gap-3 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300"
            >
              <BeakerIcon className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold text-amber-700">
                {neverScanned} candidate{neverScanned > 1 ? "s" : ""} still need source validation
                <span className="ml-1.5 font-normal text-amber-600">— go to pipeline to request more signal</span>
              </p>
              <ArrowRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" />
            </Link>
          ) : null}
          {(stats?.recheckDue ?? 0) > 0 ? (
            <Link
              href="/app/codeclear/candidates?status=RECHECK_DUE"
              className="flex flex-1 items-center gap-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 transition hover:border-rose-300"
            >
              <ClockIcon className="h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-sm font-semibold text-rose-700">
                {stats!.recheckDue} re-check{stats!.recheckDue > 1 ? "s" : ""} overdue
                <span className="ml-1.5 font-normal text-rose-600">— review these candidates</span>
              </p>
              <ArrowRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-rose-500" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Top metrics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total candidates"
          value={String(stats?.total ?? 0)}
          caption="Across all pipeline stages"
        />
        <MetricCard
          label="Avg score (this month)"
          value={stats?.avgThis != null ? `${stats.avgThis}/100` : "—"}
          caption={
            stats?.avgLast != null
              ? `Last month: ${stats.avgLast}/100`
              : "No prior month data yet"
          }
        />
        <MetricCard
          label="Pass rate (65+)"
          value={stats?.passRateThis != null ? `${stats.passRateThis}%` : "—"}
          caption="Verified candidates scoring 65 or above this month"
        />
        <MetricCard
          label="Signal coverage"
          value={coveragePct !== null ? `${coveragePct}%` : "—"}
          caption={
            scanning > 0
              ? `${scanning} live source run${scanning > 1 ? "s" : ""} in progress`
              : `${scanned} of ${allCandidates.length} profiles scored from live signal`
          }
        />
      </div>

      <section className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-lg font-semibold text-[var(--text-1)]">Integration direction</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              CodeClear should read as a licensable validation layer, not only an internal GitHub scanner. The strongest version combines test results, identity checks, repo signal, interview notes, references, and delivery context into one clear score.
            </p>
          </div>
          <Link href="/app/codeclear/pipeline">
            <Button type="button" variant="secondary" size="sm">
              Open signal pipeline
            </Button>
          </Link>
        </div>
      </section>

      {/* Stage distribution + Activity */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="app-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--text-1)]">Stage distribution</p>
              <p className="mt-1 text-sm text-[var(--text-4)]">
                Where candidates sit in the pipeline right now.
              </p>
            </div>
            <Link href="/app/codeclear/pipeline" className="text-sm font-semibold text-[var(--brand-700)]">
              Open pipeline →
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(stats?.byStatus ?? []).map((entry) => {
              const pct = stageTotal > 0 ? (entry.count / stageTotal) * 100 : 0;
              return (
                <div
                  key={entry.status}
                  className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4"
                >
                  <CodeClearStatusBadge status={entry.status} />
                  <p className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                    {entry.count}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--text-4)]">{statusLabel(entry.status)}</p>
                  {/* Progress bar showing proportion of total */}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand-500),var(--brand-700))] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-4)]">
                    {pct.toFixed(0)}% of pipeline
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent activity */}
        <section className="app-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--text-1)]">Recent activity</p>
              <p className="mt-1 text-sm text-[var(--text-4)]">Latest events across the pipeline.</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {(stats?.recentActivity ?? []).length ? (
              stats?.recentActivity.map((entry) => {
                const meta = getEventMeta(entry.eventType);
                const Icon = meta.icon;

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                        meta.tone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {entry.candidate?.name ?? "Candidate"}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--text-3)]">{meta.label}</p>
                      <p className="mt-1.5 text-xs text-[var(--text-4)]">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-sm text-[var(--text-4)]">No activity yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* Candidate spotlight */}
      <section className="app-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[var(--text-1)]">Candidate spotlight</p>
            <p className="mt-1 text-sm text-[var(--text-4)]">
              Top profiles by score — verified and draft combined.
            </p>
          </div>
          <Link href="/app/codeclear/candidates" className="text-sm font-semibold text-[var(--brand-700)]">
            View all →
          </Link>
        </div>

        {spotlight.length ? (
          <div className="mt-5 overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-left">Candidate</th>
                  <th className="text-left">Stack</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">GitHub scan</th>
                  <th className="text-left">Score</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {spotlight.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <Link
                        href={`/app/codeclear/candidates?candidate=${candidate.id}`}
                        className="block"
                      >
                        <p className="font-semibold text-[var(--text-1)]">{candidate.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-4)]">
                          @{candidate.githubHandle}
                        </p>
                      </Link>
                    </td>
                    <td>
                      <StackPill label={candidate.primaryStack} tone="brand" />
                    </td>
                    <td>
                      <CodeClearStatusBadge status={candidate.status} />
                    </td>
                    <td>
                      <CodeClearAnalysisBadge state={candidate.analysisState} />
                    </td>
                    <td>
                      <CodeClearScoreBadge
                        value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
                      />
                    </td>
                    <td className="text-right">
                      {candidate.status === "CODECLEAR_COMPLETE" ? (
                        <Link
                          href="/app/proposals?new=1"
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand-700)] shadow-[var(--shadow-xs)] transition hover:border-[var(--brand-500)] hover:bg-[var(--surface-brand-soft)]"
                        >
                          <DocumentTextIcon className="h-3.5 w-3.5" />
                          Create Doc
                        </Link>
                      ) : (
                        <span className="text-xs text-[var(--text-4)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No CodeClear candidates yet"
              body="Seed or create candidates to start reviewing the pipeline."
            />
          </div>
        )}
      </section>
    </div>
  );
}
