"use client";

import Link from "next/link";
import { CodeBracketIcon } from "@heroicons/react/24/solid";
import { useCodeClearStats } from "@/hooks/use-codeclear";
import type { WidgetSize } from "@/components/app-overview";

const PIPELINE: Array<{ status: string; label: string; short: string; color: string }> = [
  { status: "SOURCED",                  label: "Sourced",    short: "Src", color: "#6366f1" },
  { status: "INVITED",                  label: "Invited",    short: "Inv", color: "#8b5cf6" },
  { status: "ASSESSMENT_IN_PROGRESS",   label: "Assessing",  short: "Ass", color: "#a855f7" },
  { status: "CODECLEAR_COMPLETE",       label: "Verified",   short: "Ver", color: "#22c55e" },
  { status: "PLACED",                   label: "Placed",     short: "Plc", color: "#0970C8" },
];

export default function CodeClearWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useCodeClearStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const stats = data ?? { total: 0, byStatus: [], avgThis: null, passRateThis: null, recheckDue: 0 };
  const countFor = (status: string) => stats.byStatus.find((s) => s.status === status)?.count ?? 0;

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            <CodeBracketIcon className="h-2.5 w-2.5" />
            Code
          </span>
          {stats.recheckDue > 0 && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              {stats.recheckDue} recheck
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
          <CodeBracketIcon className="h-2.5 w-2.5" />
          Code
        </span>
        <Link href="/app/codeclear" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* Pipeline bar chart */}
      <div className="mt-3 flex flex-1 items-end gap-2">
        {PIPELINE.map((stage) => {
          const count = countFor(stage.status);
          const heightPct = Math.max(6, Math.round((count / maxCount) * 100));
          return (
            <div key={stage.status} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold tabular-nums text-[var(--text-1)]">{count}</span>
              <div className="w-full overflow-hidden rounded-t-[4px] bg-[var(--surface-2)]" style={{ height: 56 }}>
                <div
                  className="w-full rounded-t-[4px] transition-all duration-500"
                  style={{
                    height: `${heightPct}%`,
                    marginTop: `${100 - heightPct}%`,
                    backgroundColor: stage.color,
                    opacity: count === 0 ? 0.25 : 1,
                  }}
                />
              </div>
              <span className="text-[10px] text-[var(--text-3)]">
                {size !== "sm" ? stage.label : stage.short}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border-1)] pt-2">
        {stats.passRateThis != null ? (
          <span className="text-[11px] text-[var(--text-3)]">
            Pass rate:{" "}
            <strong className="text-[var(--text-1)]">{Math.round(stats.passRateThis * 100)}%</strong>
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-3)]">{stats.total} total</span>
        )}
        {stats.recheckDue > 0 && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
            {stats.recheckDue} recheck due
          </span>
        )}
      </div>
    </div>
  );
}
