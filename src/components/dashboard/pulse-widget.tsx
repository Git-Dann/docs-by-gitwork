"use client";

import Link from "next/link";
import { BoltIcon } from "@heroicons/react/24/solid";
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
    stats.avgHealthScore == null ? "text-[var(--text-1)]"
    : stats.avgHealthScore >= 75 ? "text-emerald-600"
    : stats.avgHealthScore >= 50 ? "text-amber-500"
    : "text-red-500";

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            <BoltIcon className="h-2.5 w-2.5" />
            Pulse
          </span>
          {stats.totalCriticalGaps > 0 && (
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600">
              {stats.totalCriticalGaps} critical
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
            {stats.avgHealthScore != null ? stats.avgHealthScore : "—"}
          </p>
          <p className="text-xs text-[var(--text-3)]">avg health</p>
        </div>
        <div className="flex gap-1">
          {(["green", "amber", "red"] as const).map((tier) => (
            <div
              key={tier}
              className="h-1 flex-1 rounded-full"
              style={{
                backgroundColor:
                  tier === "green" ? "#22c55e" : tier === "amber" ? "#f59e0b" : "#ef4444",
                opacity: stats.healthTiers[tier] > 0 ? 1 : 0.15,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
          <BoltIcon className="h-2.5 w-2.5" />
          Pulse
        </span>
        <Link href="/app/pulse" className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-4">
        <div>
          <p className={`text-3xl font-bold tabular-nums leading-none ${scoreColor}`}>
            {stats.avgHealthScore != null ? stats.avgHealthScore : "—"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">avg score</p>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          {(["green", "amber", "red"] as const).map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <span className="w-8 text-right text-xs tabular-nums text-[var(--text-3)]">
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
              <span className="w-4 text-xs tabular-nums text-[var(--text-3)]">
                {stats.healthTiers[tier]}
              </span>
            </div>
          ))}
        </div>

        {stats.totalCriticalGaps > 0 && (
          <div className="rounded-[6px] bg-red-50 px-2 py-1.5 text-center">
            <p className="text-xl font-bold tabular-nums leading-none text-red-600">
              {stats.totalCriticalGaps}
            </p>
            <p className="mt-0.5 text-xs text-red-400">critical</p>
          </div>
        )}
      </div>

      {/* Recent scans */}
      <div className="mt-3 flex-1 overflow-y-auto">
          {stats.recentScans.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-3)]">
              No scans yet
            </div>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-3)]">Recent scans</p>
              <div className="space-y-0.5">
                {stats.recentScans.slice(0, size === "lg" ? 7 : 4).map((scan) => (
                  <Link
                    key={scan.id}
                    href={`/app/pulse/${scan.id}`}
                    className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
                  >
                    <span className="truncate text-sm text-[var(--text-1)]">
                      {scan.projectName ?? "Untitled"}
                    </span>
                    {scan.healthScore != null && (
                      <span
                        className="ml-2 shrink-0 text-xs font-semibold tabular-nums"
                        style={{
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
  );
}
