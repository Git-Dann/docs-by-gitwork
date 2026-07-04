"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { usePulseStats, usePulsePortfolio, useMonitors } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";
import { PulseFrameworkCoverage } from "@/components/pulse/pulse-shared";

function healthTone(score: number | null): string {
  if (score === null) return "text-[var(--text-1)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

// One cell in the compact KPI grid.
function Stat({
  label,
  value,
  tone = "text-[var(--text-1)]",
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-[var(--text-4)]">{label}</p>
      <p
        className={cn("mt-0.5 text-2xl font-normal tracking-[-0.01em] tabular-nums", tone)}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-[var(--text-4)]">{sub}</p>}
    </div>
  );
}

// Thin health-distribution bar, pinned to the bottom of the overview card.
function HealthSplit({ green, amber, red }: { green: number; amber: number; red: number }) {
  const total = green + amber + red;
  if (total === 0) return null;
  const g = Math.round((green / total) * 100);
  const a = Math.round((amber / total) * 100);
  const r = 100 - g - a;
  return (
    <div className="flex flex-col gap-1.5">
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

/**
 * Portfolio KPI card — the dashboard summary as one column of the three-card top row on the
 * Pulse landing page (alongside Research studies + Starters). Equal-height via `h-full` + the
 * health bar pinned to the bottom with `mt-auto`.
 */
export function PulseOverview() {
  const { data: stats, isLoading } = usePulseStats();
  const { data: portfolioData } = usePulsePortfolio();
  const { data: monitorsData } = useMonitors();

  if (isLoading) {
    return <div className="app-card h-full min-h-[220px] animate-pulse" />;
  }

  if (!stats || stats.totalScans === 0) return null;

  // Live movement derived from the client-grouped portfolio (no extra fetch on the
  // happy path — the dashboard already loads it).
  const portfolio = portfolioData?.portfolio ?? [];
  const regressed = portfolio.filter((e) => (e.delta ?? 0) < 0).length;
  const improved = portfolio.filter((e) => (e.delta ?? 0) > 0).length;

  const monitors = monitorsData?.monitors ?? [];
  const activeMonitors = monitors.filter((m) => m.isActive).length;
  const alertingMonitors = monitors.filter(
    (m) => m.isActive && m.lastHealthScore !== null && m.lastHealthScore < 50,
  ).length;

  return (
    <div className="app-card flex h-full flex-col p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-[var(--text-1)]">
          Portfolio <span className="font-normal text-[var(--text-4)]">· at a glance</span>
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-4)]">
          Health and follow-ups across every scanned project.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-4">
        <Stat label="Total scans" value={String(stats.totalScans)} />
        <Stat
          label="Avg health"
          value={stats.avgHealthScore !== null ? `${stats.avgHealthScore}` : "—"}
          tone={healthTone(stats.avgHealthScore)}
          sub={
            improved + regressed > 0 ? (
              <>
                {improved > 0 && <span className="text-emerald-600">↑{improved}</span>}
                {improved > 0 && regressed > 0 && " "}
                {regressed > 0 && <span className="text-red-600">↓{regressed}</span>}
                <span className="ml-1">vs last</span>
              </>
            ) : undefined
          }
        />
        <Stat
          label="Follow-up"
          value={String(stats.awaitingFollowUp)}
          tone={stats.awaitingFollowUp > 0 ? "text-amber-600" : "text-[var(--text-1)]"}
        />
        <Stat
          label="Regressed"
          value={String(regressed)}
          tone={regressed > 0 ? "text-red-600" : "text-[var(--text-1)]"}
          sub={regressed > 0 ? "need a look" : "none"}
        />
        <Stat
          label="Monitors"
          value={String(activeMonitors)}
          tone={alertingMonitors > 0 ? "text-red-600" : "text-[var(--text-1)]"}
          sub={
            alertingMonitors > 0 ? (
              <span className="text-red-600">{alertingMonitors} alerting</span>
            ) : activeMonitors > 0 ? (
              "watching"
            ) : (
              "none active"
            )
          }
        />
      </div>

      <div className="mt-auto pt-5">
        <HealthSplit
          green={stats.healthTiers.green}
          amber={stats.healthTiers.amber}
          red={stats.healthTiers.red}
        />
      </div>
    </div>
  );
}

/**
 * "What Pulse checks" reference, tucked behind a disclosure. Rendered below the three-card
 * top row so the row stays clean and equal-height.
 */
export function PulseChecksDisclosure() {
  const [showFramework, setShowFramework] = useState(false);
  return (
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
  );
}
