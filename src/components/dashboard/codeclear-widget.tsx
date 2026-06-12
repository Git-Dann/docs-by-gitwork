"use client";

import Link from "next/link";
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
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
            04 // CODE
          </span>
          {stats.recheckDue > 0 && (
            <span className="text-xs font-medium text-amber-500">
              {stats.recheckDue} recheck
            </span>
          )}
        </div>
        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-3xl tabular-nums text-[#0F172A]" style={{ fontFamily: "var(--font-display)" }}>{stats.total}</p>
            <p className="text-xs text-[#475569]">developers</p>
          </div>
          {stats.passRateThis != null && (
            <p className="text-center text-xs text-[#475569]">
              {Math.round(stats.passRateThis * 100)}% pass rate
            </p>
          )}
        </div>
      </div>
    );
  }

  const maxCount = Math.max(1, ...PIPELINE.map((s) => countFor(s.status)));

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          04 // CODE
        </span>
        <Link href="/app/codeclear" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {/* Pipeline bar chart */}
        <div className="flex flex-1 items-end gap-2">
          {PIPELINE.map((stage) => {
            const count = countFor(stage.status);
            const heightPct = Math.max(6, Math.round((count / maxCount) * 100));
            return (
              <div key={stage.status} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-[#0F172A]" style={{ fontFamily: "var(--font-mono)" }}>{count}</span>
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
                <span className="text-xs text-[#475569]">
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between border-t border-[rgba(0,0,0,0.08)] pt-2">
          {stats.passRateThis != null ? (
            <span className="text-xs text-[#475569]">
              Pass rate:{" "}
              <strong className="text-[#0F172A]">{Math.round(stats.passRateThis * 100)}%</strong>
            </span>
          ) : (
            <span className="text-xs text-[#475569]">{stats.total} total</span>
          )}
          {stats.recheckDue > 0 && (
            <span className="text-xs font-medium text-amber-500">
              {stats.recheckDue} recheck due
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
