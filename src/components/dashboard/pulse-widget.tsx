"use client";

import Link from "next/link";
import { usePulseStats } from "@/hooks/use-pulse";
import type { WidgetSize } from "@/components/app-overview";

export default function PulseWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = usePulseStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
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

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium text-[var(--text-2)]">Pulse</span>
          {stats.totalCriticalGaps > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              {stats.totalCriticalGaps} critical
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">
            {stats.avgHealthScore != null ? `${stats.avgHealthScore}` : "—"}
          </p>
          <p className="text-[11px] text-[var(--text-3)]">avg health</p>
        </div>
        <div className="flex gap-1">
          {(["green", "amber", "red"] as const).map((tier) => (
            <div
              key={tier}
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundColor:
                  tier === "green" ? "#22c55e" : tier === "amber" ? "#f59e0b" : "#ef4444",
                opacity: stats.healthTiers[tier] > 0 ? 1 : 0.2,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Pulse — Health</span>
        <Link href="/app/pulse" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-4xl font-bold tabular-nums text-[var(--text-1)]">
            {stats.avgHealthScore != null ? stats.avgHealthScore : "—"}
          </p>
          <p className="text-[11px] text-[var(--text-3)]">avg score</p>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {(["green", "amber", "red"] as const).map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <span className="w-10 text-right text-[11px] text-[var(--text-3)]">
                {pct(stats.healthTiers[tier])}%
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-1)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct(stats.healthTiers[tier])}%`,
                    backgroundColor:
                      tier === "green" ? "#22c55e" : tier === "amber" ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <span className="w-6 text-[11px] text-[var(--text-3)]">{stats.healthTiers[tier]}</span>
            </div>
          ))}
        </div>
        {stats.totalCriticalGaps > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.totalCriticalGaps}</p>
            <p className="text-[11px] text-[var(--text-3)]">critical</p>
          </div>
        )}
      </div>

      {size.rows >= 2 && stats.recentScans.length > 0 && (
        <div className="mt-1 flex-1 overflow-y-auto">
          <p className="mb-1.5 text-[11px] font-medium text-[var(--text-3)]">Recent scans</p>
          <div className="space-y-1">
            {stats.recentScans.slice(0, size.rows >= 3 ? 6 : 3).map((scan) => (
              <Link
                key={scan.id}
                href={`/app/pulse/${scan.id}`}
                className="flex items-center justify-between rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-1)]"
              >
                <span className="truncate text-xs text-[var(--text-1)]">{scan.projectName ?? "Untitled"}</span>
                {scan.healthScore != null && (
                  <span
                    className="ml-2 shrink-0 text-xs font-semibold tabular-nums"
                    style={{
                      color: scan.healthScore >= 75 ? "#22c55e" : scan.healthScore >= 50 ? "#f59e0b" : "#ef4444",
                    }}
                  >
                    {scan.healthScore}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
