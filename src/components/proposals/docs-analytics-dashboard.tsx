/**
 * Cross-document analytics dashboard (Phase 1) — /app/docs/analytics.
 *
 * Consumes GET /api/documents/analytics (the same endpoint the iOS analytics screen uses): the
 * funnel (documents → shared → viewed → sent → accepted/declined), open + win rates, average
 * time-to-first-open, the most-viewed-documents leaderboard, and the most-read section types
 * across every shared document. Filterable by document type and time window.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatDuration,
  formatRate,
  useWorkspaceDocAnalytics,
} from "@/hooks/use-document-analytics";

const TYPE_OPTIONS = ["ALL", "PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "OTHER"] as const;
const RANGE_OPTIONS: Array<{ label: string; days?: number }> = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All" },
];

export function DocsAnalyticsDashboard() {
  const [documentType, setDocumentType] = useState<string>("ALL");
  const [rangeIdx, setRangeIdx] = useState(3); // default All-time
  const days = RANGE_OPTIONS[rangeIdx].days;

  const { data, isPending, error } = useWorkspaceDocAnalytics({ documentType, days });

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)]">
            Type
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="app-select"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "All documents" : t}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
          {RANGE_OPTIONS.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                i === rangeIdx
                  ? "bg-[var(--brand-700)] text-white"
                  : "bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm font-medium text-[var(--danger-500)]">{(error as Error).message}</p>
      ) : null}

      {isPending && !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Documents" value={String(data.totals.documents)} />
            <Kpi label="Shared" value={String(data.totals.shared)} />
            <Kpi
              label="Open rate"
              value={formatRate(data.rates.openRate)}
              sub={`${data.totals.viewed} opened`}
            />
            <Kpi label="Sent" value={String(data.totals.sent)} />
            <Kpi
              label="Win rate"
              value={formatRate(data.rates.winRate)}
              sub={`${data.totals.accepted}✓ / ${data.totals.declined}✕`}
              tone={data.rates.winRate != null && data.rates.winRate >= 0.5 ? "good" : undefined}
            />
            <Kpi label="Avg to open" value={formatDuration(data.rates.avgTimeToFirstOpenMs)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Top documents */}
            <section className="widget-card overflow-hidden">
              <div className="widget-header">
                <span className="widget-header-label">MOST-VIEWED DOCUMENTS</span>
              </div>
              <div className="p-2">
                {data.topDocuments.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--text-3)]">No views recorded in this window.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left font-mono text-[10px] uppercase tracking-[1px] text-[var(--text-3)]">
                        <th className="px-3 py-2 font-semibold">Document</th>
                        <th className="px-3 py-2 text-right font-semibold">Views</th>
                        <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Last opened</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topDocuments.map((d) => (
                        <tr key={d.id} className="border-t border-[var(--border-2)]">
                          <td className="px-3 py-2">
                            <Link
                              href={`/app/docs/${d.id}`}
                              className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]"
                            >
                              {d.title}
                            </Link>
                            <div className="text-[11px] text-[var(--text-3)]">
                              {[d.documentNumber, d.clientName, d.status].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--text-2)]">{d.views}</td>
                          <td className="hidden px-3 py-2 text-right text-[11px] text-[var(--text-3)] sm:table-cell">
                            {d.lastViewedAt ? new Date(d.lastViewedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Top sections */}
            <section className="widget-card overflow-hidden">
              <div className="widget-header">
                <span className="widget-header-label">MOST-READ SECTIONS</span>
              </div>
              <div className="p-5">
                {data.topSections.length === 0 ? (
                  <p className="text-sm text-[var(--text-3)]">No section engagement yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topSections.map((s) => {
                      const max = data.topSections[0]?.totalDwellMs || 1;
                      const pct = Math.max(3, Math.round((s.totalDwellMs / max) * 100));
                      return (
                        <li key={s.sectionKey}>
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="truncate text-[var(--text-2)]">{s.sectionKey}</span>
                            <span className="shrink-0 tabular-nums text-[var(--text-3)]">
                              {formatDuration(s.totalDwellMs)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-1)]">
                            <div
                              className="h-full rounded-full bg-[var(--brand-500,#6366f1)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* Status breakdown */}
          {data.byStatus.length > 0 && (
            <section className="widget-card overflow-hidden">
              <div className="widget-header">
                <span className="widget-header-label">BY STATUS</span>
              </div>
              <div className="flex flex-wrap gap-2 p-5">
                {data.byStatus.map((s) => (
                  <span
                    key={s.status}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1 text-xs text-[var(--text-2)]"
                  >
                    {s.status}
                    <span className="tabular-nums font-semibold text-[var(--text-1)]">{s.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-[var(--text-3)]">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "good" ? "text-[var(--success-500)]" : "text-[var(--text-1)]"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{sub}</p> : null}
    </div>
  );
}
