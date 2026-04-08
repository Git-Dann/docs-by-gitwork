"use client";

import Link from "next/link";
import { useCodeClearCandidates, useCodeClearStats } from "@/hooks/use-codeclear";
import { formatDate } from "@/lib/format";
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

export function CodeClearOverview() {
  const statsQuery = useCodeClearStats();
  const spotlightQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 6,
    sortBy: "overallScore",
    sortDir: "desc",
  });
  const stats = statsQuery.data;
  const spotlight = spotlightQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total candidates"
          value={String(stats?.total ?? 0)}
          caption="Workspace-wide CodeClear pipeline"
        />
        <MetricCard
          label="Average verified"
          value={stats?.avgThis != null ? `${stats.avgThis}` : "—"}
          caption={stats?.avgLast != null ? `Last month ${stats.avgLast}` : "No prior month data"}
        />
        <MetricCard
          label="Pass rate"
          value={stats?.passRateThis != null ? `${stats.passRateThis}%` : "—"}
          caption="Verified candidates scoring 65+ this month"
        />
        <MetricCard
          label="Re-check due"
          value={String(stats?.recheckDue ?? 0)}
          caption="Candidates needing another review soon"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="app-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--text-1)]">Stage distribution</p>
              <p className="mt-1 text-sm text-[var(--text-4)]">How the pipeline is moving today.</p>
            </div>
            <Link
              href="/app/codeclear/pipeline"
              className="text-sm font-semibold text-[var(--brand-700)]"
            >
              Open pipeline
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(stats?.byStatus ?? []).map((entry) => (
              <div
                key={entry.status}
                className="rounded-[16px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4"
              >
                <CodeClearStatusBadge status={entry.status} />
                <p className="mt-4 text-[26px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                  {entry.count}
                </p>
                <p className="mt-1 text-sm text-[var(--text-4)]">{statusLabel(entry.status)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="app-card p-6">
          <p className="text-lg font-semibold text-[var(--text-1)]">Recent activity</p>
          <div className="mt-5 space-y-3">
            {(stats?.recentActivity ?? []).length ? (
              stats?.recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[14px] border border-[var(--border-2)] px-4 py-3"
                >
                  <p className="text-sm font-semibold text-[var(--text-1)]">
                    {entry.candidate?.name ?? "Candidate"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-3)]">{entry.eventType}</p>
                  <p className="mt-2 text-xs text-[var(--text-4)]">{formatDate(entry.createdAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--text-4)]">No activity yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="app-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[var(--text-1)]">Candidate spotlight</p>
            <p className="mt-1 text-sm text-[var(--text-4)]">
              Highest-signal profiles and the latest draft states.
            </p>
          </div>
          <Link
            href="/app/codeclear/candidates"
            className="text-sm font-semibold text-[var(--brand-700)]"
          >
            View all
          </Link>
        </div>

        {spotlight.length ? (
          <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--border-2)]">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-left">Candidate</th>
                  <th className="text-left">Stack</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Analysis</th>
                  <th className="text-left">Score</th>
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
                        <p className="mt-1 text-sm text-[var(--text-4)]">@{candidate.githubHandle}</p>
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
