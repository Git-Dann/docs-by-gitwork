/**
 * Per-document engagement panel (Phase 1) — lives in the editor's right rail "Insights" tab.
 *
 * Surfaces the data from GET /api/documents/[id]/analytics: visitor counts, time-to-open, the
 * per-section dwell heatmap (which parts of the doc the client actually read), device/location
 * splits, and the recent-visits list. Polls every 30s via useDocumentAnalytics.
 */

"use client";

import {
  ClockIcon,
  CursorArrowRaysIcon,
  GlobeAltIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import {
  formatDuration,
  useDocumentAnalytics,
} from "@/hooks/use-document-analytics";

export function DocumentAnalyticsPanel({ documentId }: { documentId: string }) {
  const { data, isPending, error } = useDocumentAnalytics(documentId);

  if (error) {
    return (
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">ENGAGEMENT</span>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm font-medium text-[var(--danger-500)]">{(error as Error).message}</p>
        </div>
      </section>
    );
  }

  if (isPending || !data) {
    return (
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">ENGAGEMENT</span>
        </div>
        <div className="space-y-3 p-5 sm:p-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-[var(--surface-1)]" />
          ))}
        </div>
      </section>
    );
  }

  if (data.totalViews === 0) {
    return (
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">ENGAGEMENT</span>
          {data.isShared ? <span className="widget-header-right">SHARED</span> : null}
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm text-[var(--text-3)]">
            {data.isShared
              ? "No opens yet. The moment the client opens the link, every view, section read, and accept will show up here."
              : "Not shared yet. Mint a share link from the header to start tracking opens, time-on-section, and acceptance."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">ENGAGEMENT</span>
        <span className="widget-header-right">
          {data.uniqueVisitors} VISITOR{data.uniqueVisitors === 1 ? "" : "S"}
        </span>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Headline stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<CursorArrowRaysIcon className="h-4 w-4" />} label="Opens" value={String(data.totalViews)} />
          <Stat
            icon={<UserGroupIcon className="h-4 w-4" />}
            label="Unique"
            value={String(data.uniqueVisitors)}
            sub={data.returningVisitors > 0 ? `${data.returningVisitors} returning` : undefined}
          />
          <Stat
            icon={<ClockIcon className="h-4 w-4" />}
            label="Avg time"
            value={formatDuration(data.avgDurationMs)}
          />
          <Stat
            icon={<ClockIcon className="h-4 w-4" />}
            label="To first open"
            value={data.timeToFirstOpenMs != null ? formatDuration(data.timeToFirstOpenMs) : "—"}
          />
        </div>

        {/* Conversion */}
        {(data.acceptedAt || data.declinedAt) && (
          <div
            className={`rounded-[8px] border px-3 py-2 text-sm ${
              data.acceptedAt
                ? "border-[var(--success-500)]/30 bg-[var(--success-50)] text-[var(--text-2)]"
                : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]"
            }`}
          >
            {data.acceptedAt
              ? `✅ Accepted ${new Date(data.acceptedAt).toLocaleDateString()}`
              : `Declined ${new Date(data.declinedAt!).toLocaleDateString()}`}
          </div>
        )}

        {/* Per-section dwell heatmap */}
        {data.sections.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)]">
              Most-read sections
            </p>
            <ul className="space-y-2">
              {data.sections.slice(0, 8).map((s) => (
                <li key={s.sectionKey}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-[var(--text-2)]">
                      {s.sectionTitle || s.sectionKey}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--text-3)]">
                      {formatDuration(s.totalDwellMs)}
                      {s.avgScrollPct != null ? ` · ${s.avgScrollPct}% seen` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-1)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand-500,#6366f1)]"
                      style={{ width: `${Math.max(3, s.sharePct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Device + location splits */}
        {(data.devices.length > 0 || data.locations.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {data.devices.slice(0, 3).map((d) => (
              <Chip key={`dev-${d.key}`}>{`${d.key} · ${d.count}`}</Chip>
            ))}
            {data.locations.slice(0, 3).map((l) => (
              <Chip key={`loc-${l.key}`}>
                <GlobeAltIcon className="mr-1 inline h-3 w-3" />
                {`${l.key} · ${l.count}`}
              </Chip>
            ))}
          </div>
        )}

        {/* Recent visits */}
        {data.recentVisits.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)]">
              Recent visits
            </p>
            <ul className="space-y-1.5">
              {data.recentVisits.slice(0, 6).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
                  <span className="truncate">
                    {v.visitorLabel}
                    {v.device ? ` · ${v.device}` : ""}
                    {v.browser ? ` · ${v.browser}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {v.durationMs ? formatDuration(v.durationMs) : "—"} ·{" "}
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border-2)] bg-white p-3">
      <div className="flex items-center gap-1.5 text-[var(--text-3)]">
        {icon}
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-1)]">{value}</p>
      {sub ? <p className="text-[10px] text-[var(--text-3)]">{sub}</p> : null}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">
      {children}
    </span>
  );
}
