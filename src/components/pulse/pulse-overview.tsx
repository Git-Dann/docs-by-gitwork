"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { usePulseStats } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";
import { PulseFrameworkCoverage } from "@/components/pulse/pulse-shared";

function healthTone(score: number | null): string {
  if (score === null) return "text-[var(--text-1)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

// One cell in the compact KPI strip.
function Stat({
  label,
  value,
  tone = "text-[var(--text-1)]",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="px-4 py-3 first:pl-0">
      <p className="text-xs font-medium text-[var(--text-4)]">{label}</p>
      <p className={cn("mt-1 text-2xl font-normal tracking-[-0.01em] tabular-nums", tone)} style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
    </div>
  );
}

// Thin inline health-distribution bar (replaces the full-width HealthBar card).
function HealthSplit({ green, amber, red }: { green: number; amber: number; red: number }) {
  const total = green + amber + red;
  if (total === 0) return null;
  const g = Math.round((green / total) * 100);
  const a = Math.round((amber / total) * 100);
  const r = 100 - g - a;
  return (
    <div className="flex min-w-[120px] flex-1 flex-col justify-center gap-1.5 px-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        {g > 0 && <div className="bg-emerald-400" style={{ width: `${g}%` }} />}
        {a > 0 && <div className="bg-amber-400" style={{ width: `${a}%` }} />}
        {r > 0 && <div className="bg-red-400" style={{ width: `${r}%` }} />}
      </div>
      <p className="text-[11px] text-[var(--text-4)]">
        <span className="text-emerald-600">{green} healthy</span> ·{" "}
        <span className="text-amber-600">{amber} moderate</span> ·{" "}
        <span className="text-red-600">{red} at risk</span>
      </p>
    </div>
  );
}

export function PulseOverview() {
  const { data: stats, isLoading } = usePulseStats();
  const [showFramework, setShowFramework] = useState(false);

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  if (!stats || stats.totalScans === 0) return null;

  return (
    <div className="space-y-3">
      {/* Slim KPI strip — the dashboard summary in one row, not five cards */}
      <div className="app-card flex flex-col gap-2 p-4 sm:flex-row sm:items-stretch sm:gap-0 sm:divide-x sm:divide-[var(--border-2)]">
        <div className="flex flex-1 divide-x divide-[var(--border-2)]">
          <Stat label="Total scans" value={String(stats.totalScans)} />
          <Stat
            label="Avg health"
            value={stats.avgHealthScore !== null ? `${stats.avgHealthScore}` : "—"}
            tone={healthTone(stats.avgHealthScore)}
          />
          <Stat
            label="Critical gaps"
            value={String(stats.totalCriticalGaps)}
            tone={stats.totalCriticalGaps > 10 ? "text-red-600" : stats.totalCriticalGaps > 4 ? "text-amber-600" : "text-[var(--text-1)]"}
          />
          <Stat
            label="Follow-up"
            value={String(stats.awaitingFollowUp)}
            tone={stats.awaitingFollowUp > 0 ? "text-amber-600" : "text-[var(--text-1)]"}
          />
        </div>
        <HealthSplit
          green={stats.healthTiers.green}
          amber={stats.healthTiers.amber}
          red={stats.healthTiers.red}
        />
      </div>

      {/* What Pulse checks — reference, tucked behind a disclosure */}
      <div>
        <button
          type="button"
          onClick={() => setShowFramework((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
        >
          What Pulse checks
          <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", showFramework && "rotate-180")} />
        </button>
        {showFramework && (
          <div className="app-card mt-2 p-5">
            <PulseFrameworkCoverage />
          </div>
        )}
      </div>
    </div>
  );
}
