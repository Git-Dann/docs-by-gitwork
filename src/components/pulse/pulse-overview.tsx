"use client";


import { useState } from "react";
import { usePulseStats } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";
import { PULSE_FRAMEWORK, PULSE_CHECK_TOTAL, PULSE_CATEGORY_TOTAL } from "@/config/pulse-framework";

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
      <p className="mt-3 text-[32px] font-normal tracking-[-0.01em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
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


function FrameworkCoverage() {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? PULSE_FRAMEWORK : PULSE_FRAMEWORK.slice(0, 9);
  return (
    <div className="app-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-3)]">Framework coverage</p>
        <p className="text-xs text-[var(--text-4)]">
          {PULSE_CHECK_TOTAL}+ checks · {PULSE_CATEGORY_TOTAL} categories
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((cat) => (
          <div
            key={cat.name}
            className={cn(
              "rounded-[8px] border px-3 py-2",
              cat.aiEra
                ? "border-[var(--brand-300)] bg-[var(--surface-brand-soft)]"
                : "border-[var(--border-2)] bg-[var(--surface-1)]",
            )}
            title={cat.blurb}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-[var(--text-1)]">{cat.name}</span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-[var(--text-3)]">{cat.count}</span>
            </div>
            {cat.aiEra && (
              <span className="mt-0.5 inline-block text-[9px] font-bold uppercase tracking-wide text-[var(--brand-600)]">
                New · AI-era
              </span>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs font-medium text-[var(--brand-600)] hover:underline"
      >
        {expanded ? "Show less" : `Show all ${PULSE_CATEGORY_TOTAL} categories`}
      </button>
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
            <div key={i} className="h-28 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
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

      {/* Framework coverage — what Pulse checks */}
      <FrameworkCoverage />
    </div>
  );
}
