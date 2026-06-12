"use client";

import Link from "next/link";
import { usePulseStats } from "@/hooks/use-pulse";
import type { WidgetSize } from "@/components/app-overview";

export default function PulseWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = usePulseStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const stats = data ?? {
    totalScans: 0,
    completedScans: 0,
    avgHealthScore: null,
    totalCriticalGaps: 0,
    healthTiers: { green: 0, amber: 0, red: 0 },
    recentScans: [],
  };

  const total = stats.healthTiers.green + stats.healthTiers.amber + stats.healthTiers.red;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const scoreColor =
    stats.avgHealthScore == null ? "text-[#0F172A]"
    : stats.avgHealthScore >= 75 ? "text-emerald-600"
    : stats.avgHealthScore >= 50 ? "text-amber-500"
    : "text-red-500";

  if (size === "sm") {
    const recent = stats.recentScans.slice(0, 2);
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
            06 // PULSE
          </span>
          <Link href="/app/pulse" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
            View all
          </Link>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
          {/* Top stats line — score + critical pill, mono-caps for density */}
          <div className="flex items-baseline gap-3 px-1">
            <p className={`text-2xl tabular-nums leading-none ${scoreColor}`} style={{ fontFamily: "var(--font-display)" }}>
              {stats.avgHealthScore != null ? stats.avgHealthScore : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
              avg health
            </p>
            {stats.totalCriticalGaps > 0 ? (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.08em] text-red-600" style={{ fontFamily: "var(--font-mono)" }}>
                {stats.totalCriticalGaps} critical
              </span>
            ) : null}
          </div>
          {/* Tier bars */}
          <div className="mt-2 flex gap-1 px-1">
            {(["green", "amber", "red"] as const).map((tier) => (
              <div
                key={tier}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    tier === "green" ? "#22c55e" : tier === "amber" ? "#f59e0b" : "#ef4444",
                  opacity: stats.healthTiers[tier] > 0 ? 1 : 0.15,
                }}
                title={`${stats.healthTiers[tier]} ${tier}`}
              />
            ))}
          </div>
          {/* Recent scans — top 2 with link to the scan */}
          {recent.length > 0 ? (
            <div className="mt-3 space-y-0.5">
              {recent.map((scan) => (
                <Link
                  key={scan.id}
                  href={`/app/pulse/${scan.id}`}
                  className="flex items-center justify-between rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <span className="truncate text-xs text-[#0F172A]">
                    {scan.projectName ?? "Untitled"}
                  </span>
                  {scan.healthScore != null ? (
                    <span
                      className="ml-2 shrink-0 text-[10px] tabular-nums"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color:
                          scan.healthScore >= 75 ? "#22c55e"
                          : scan.healthScore >= 50 ? "#f59e0b"
                          : "#ef4444",
                      }}
                    >
                      {scan.healthScore}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          06 // PULSE
        </span>
        <Link href="/app/pulse" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {/* Stats row */}
        <div className="flex items-center gap-4">
          <div>
            <p className={`text-3xl tabular-nums leading-none ${scoreColor}`} style={{ fontFamily: "var(--font-display)" }}>
              {stats.avgHealthScore != null ? stats.avgHealthScore : "—"}
            </p>
            <p className="mt-0.5 text-xs text-[#475569]">avg score</p>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            {(["green", "amber", "red"] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-2">
                <span className="w-8 text-right text-xs tabular-nums text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
                  {pct(stats.healthTiers[tier])}%
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct(stats.healthTiers[tier])}%`,
                      backgroundColor:
                        tier === "green" ? "#22c55e" : tier === "amber" ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="w-4 text-xs tabular-nums text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
                  {stats.healthTiers[tier]}
                </span>
              </div>
            ))}
          </div>

          {stats.totalCriticalGaps > 0 && (
            <div className="rounded-[6px] bg-red-50 px-2 py-1.5 text-center">
              <p className="text-xl tabular-nums leading-none text-red-600" style={{ fontFamily: "var(--font-display)" }}>
                {stats.totalCriticalGaps}
              </p>
              <p className="mt-0.5 text-xs text-red-400">critical</p>
            </div>
          )}
        </div>

        {/* Recent scans */}
        <div className="mt-3 flex-1 overflow-y-auto">
          {stats.recentScans.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[#94A3B8]">
              No scans yet
            </div>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-medium text-[#475569]">Recent scans</p>
              <div className="space-y-0.5">
                {stats.recentScans.slice(0, size === "lg" ? 7 : 4).map((scan) => (
                  <Link
                    key={scan.id}
                    href={`/app/pulse/${scan.id}`}
                    className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
                  >
                    <span className="truncate text-sm text-[#0F172A]">
                      {scan.projectName ?? "Untitled"}
                    </span>
                    {scan.healthScore != null && (
                      <span
                        className="ml-2 shrink-0 text-xs tabular-nums"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color:
                            scan.healthScore >= 75 ? "#22c55e"
                            : scan.healthScore >= 50 ? "#f59e0b"
                            : "#ef4444",
                        }}
                      >
                        {scan.healthScore}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
