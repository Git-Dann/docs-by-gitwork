"use client";

import Link from "next/link";
import { useCodeClearStats } from "@/hooks/use-codeclear";
import type { WidgetSize } from "@/components/app-overview";

const PIPELINE: Array<{ status: string; label: string; short: string }> = [
  { status: "SOURCED", label: "Sourced", short: "Src" },
  { status: "INVITED", label: "Invited", short: "Inv" },
  { status: "ASSESSMENT_IN_PROGRESS", label: "Assessment", short: "Ass" },
  { status: "CODECLEAR_COMPLETE", label: "Verified", short: "Ver" },
  { status: "PLACED", label: "Placed", short: "Plc" },
];

export default function CodeClearWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useCodeClearStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const stats = data ?? { total: 0, byStatus: [], avgThis: null, passRateThis: null, recheckDue: 0 };

  const countFor = (status: string) =>
    stats.byStatus.find((s) => s.status === status)?.count ?? 0;

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium text-[var(--text-2)]">Code</span>
          {stats.recheckDue > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {stats.recheckDue} recheck
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{stats.total}</p>
          <p className="text-[11px] text-[var(--text-3)]">candidates</p>
        </div>
        {stats.passRateThis != null && (
          <p className="text-center text-[11px] text-[var(--text-3)]">
            {Math.round(stats.passRateThis * 100)}% pass rate
          </p>
        )}
      </div>
    );
  }

  const maxCount = Math.max(1, ...PIPELINE.map((s) => countFor(s.status)));

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Code — Pipeline</span>
        <Link href="/app/codeclear" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      <div className="flex flex-1 items-end gap-2">
        {PIPELINE.map((stage) => {
          const count = countFor(stage.status);
          const heightPct = Math.max(8, Math.round((count / maxCount) * 100));
          return (
            <div key={stage.status} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-[var(--text-1)]">{count}</span>
              <div className="w-full overflow-hidden rounded-t-[4px] bg-[var(--surface-1)]" style={{ height: 60 }}>
                <div
                  className="w-full rounded-t-[4px] bg-[var(--accent)] transition-all"
                  style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--text-3)]">
                {size.cols >= 2 ? stage.label : stage.short}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-1)] pt-2">
        {stats.passRateThis != null && (
          <span className="text-[11px] text-[var(--text-3)]">
            Pass rate: <strong className="text-[var(--text-1)]">{Math.round(stats.passRateThis * 100)}%</strong>
          </span>
        )}
        {stats.recheckDue > 0 && (
          <span className="text-[11px] font-medium text-amber-600">{stats.recheckDue} recheck due</span>
        )}
      </div>
    </div>
  );
}
