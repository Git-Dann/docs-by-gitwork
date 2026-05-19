"use client";

import { SignalIcon } from "@heroicons/react/24/outline";
import { usePulseStats } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";

function StatCard({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "",
    green: "border-l-4 border-l-emerald-400",
    amber: "border-l-4 border-l-amber-400",
    red: "border-l-4 border-l-red-400",
  }[tone];

  return (
    <div className={cn("app-card p-5", toneClass)}>
      <p className="text-sm font-medium text-[var(--text-3)]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
        {value}
      </p>
      {caption ? <p className="mt-2 text-sm text-[var(--text-4)]">{caption}</p> : null}
    </div>
  );
}

function HealthBar({ green, amber, red }: { green: number; amber: number; red: number }) {
  const total = green + amber + red;
  if (total === 0) return null;

  const greenPct = Math.round((green / total) * 100);
  const amberPct = Math.round((amber / total) * 100);
  const redPct = 100 - greenPct - amberPct;

  return (
    <div className="app-card p-5">
      <p className="text-sm font-medium text-[var(--text-3)]">Health distribution</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full">
        {greenPct > 0 && <div className="bg-emerald-400" style={{ width: `${greenPct}%` }} />}
        {amberPct > 0 && <div className="bg-amber-400" style={{ width: `${amberPct}%` }} />}
        {redPct > 0 && <div className="bg-red-400" style={{ width: `${redPct}%` }} />}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-[var(--text-4)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          {green} healthy (75+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          {amber} moderate (50–74)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          {red} at risk (&lt;50)
        </span>
      </div>
    </div>
  );
}


export function PulseOverview() {
  const { data, isLoading } = usePulseStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[14px] bg-[var(--surface-1)]" />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-[14px] bg-[var(--surface-1)]" />
      </div>
    );
  }

  const stats = data;

  if (!stats || stats.totalScans === 0) return null;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total scans"
          value={String(stats.totalScans)}
          caption={`${stats.completedScans} completed`}
        />
        <StatCard
          label="Avg health score"
          value={stats.avgHealthScore !== null ? `${stats.avgHealthScore}/100` : "—"}
          caption={stats.completedScans > 0 ? `Across ${stats.completedScans} scans` : undefined}
          tone={
            stats.avgHealthScore === null
              ? "neutral"
              : stats.avgHealthScore >= 75
                ? "green"
                : stats.avgHealthScore >= 50
                  ? "amber"
                  : "red"
          }
        />
        <StatCard
          label="Critical gaps"
          value={String(stats.totalCriticalGaps)}
          caption="Across all completed scans"
          tone={stats.totalCriticalGaps > 10 ? "red" : stats.totalCriticalGaps > 4 ? "amber" : "neutral"}
        />
        <StatCard
          label="Awaiting follow-up"
          value={String(stats.awaitingFollowUp)}
          caption={stats.awaitingFollowUp > 0 ? "Completed scans with no proposal" : "All scans actioned"}
          tone={stats.awaitingFollowUp > 0 ? "amber" : "neutral"}
        />
      </div>

      {/* Health distribution bar */}
      <HealthBar
        green={stats.healthTiers.green}
        amber={stats.healthTiers.amber}
        red={stats.healthTiers.red}
      />
    </div>
  );
}
