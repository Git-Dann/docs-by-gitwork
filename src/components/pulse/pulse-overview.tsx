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

// Small editorial stat — DM Serif figure over a mono data label, per DESIGN.md.
function MiniStat({
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
      <p className="widget-data-label truncate">{label}</p>
      <p
        className={cn("mt-1 text-[26px] font-normal leading-none tracking-[-0.01em] tabular-nums", tone)}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] leading-tight text-[var(--text-4)]">{sub}</p>}
    </div>
  );
}

// Thin health-distribution bar with a mono legend beneath.
function HealthSplit({ green, amber, red }: { green: number; amber: number; red: number }) {
  const total = green + amber + red;
  if (total === 0) return null;
  const g = Math.round((green / total) * 100);
  const a = Math.round((amber / total) * 100);
  const r = 100 - g - a;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        {g > 0 && <div className="bg-emerald-400" style={{ width: `${g}%` }} />}
        {a > 0 && <div className="bg-amber-400" style={{ width: `${a}%` }} />}
        {r > 0 && <div className="bg-red-400" style={{ width: `${r}%` }} />}
      </div>
      <p className="widget-data-label">
        <span className="text-emerald-600">{green} healthy</span>
        <span className="text-[var(--text-4)]"> · </span>
        <span className="text-amber-600">{amber} moderate</span>
        <span className="text-[var(--text-4)]"> · </span>
        <span className="text-red-600">{red} at risk</span>
      </p>
    </div>
  );
}

/**
 * `01 // PORTFOLIO` — the Pulse KPI card, first of the three-card top row (alongside Research
 * studies + Starters). Follows the DESIGN.md widget grammar: mono numbered header, an editorial
 * DM Serif hero figure (avg health) over the health bar, then a 2×2 mono/serif stat grid.
 */
export function PulseOverview() {
  const { data: stats, isLoading } = usePulseStats();
  const { data: portfolioData } = usePulsePortfolio();
  const { data: monitorsData } = useMonitors();

  if (isLoading) {
    return <div className="widget-card h-full min-h-[300px] animate-pulse" />;
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
    <article className="widget-card h-full">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>{" // PORTFOLIO"}
        </span>
        <span className="widget-header__status">
          {stats.totalScans} scan{stats.totalScans !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        {/* Hero figure — avg health over the distribution bar */}
        <div>
          <p className="widget-data-label">Avg health</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn("text-5xl font-normal leading-none tracking-[-0.02em] tabular-nums", healthTone(stats.avgHealthScore))}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stats.avgHealthScore !== null ? stats.avgHealthScore : "—"}
            </span>
            <span className="widget-data-label pb-1">/ 100</span>
            {improved + regressed > 0 && (
              <span className="widget-data-label ml-auto pb-1 normal-case tracking-normal">
                {improved > 0 && <span className="text-emerald-600">↑{improved}</span>}
                {improved > 0 && regressed > 0 && " "}
                {regressed > 0 && <span className="text-red-600">↓{regressed}</span>}
                <span className="ml-1 text-[var(--text-4)]">vs last</span>
              </span>
            )}
          </div>
          <div className="mt-4">
            <HealthSplit
              green={stats.healthTiers.green}
              amber={stats.healthTiers.amber}
              red={stats.healthTiers.red}
            />
          </div>
        </div>

        {/* 2×2 supporting stats, pinned to the bottom so cards line up */}
        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[var(--border-2)] pt-5">
          <MiniStat label="Total scans" value={String(stats.totalScans)} />
          <MiniStat
            label="Follow-up"
            value={String(stats.awaitingFollowUp)}
            tone={stats.awaitingFollowUp > 0 ? "text-amber-600" : "text-[var(--text-1)]"}
            sub={stats.awaitingFollowUp > 0 ? "awaiting review" : "clear"}
          />
          <MiniStat
            label="Regressed"
            value={String(regressed)}
            tone={regressed > 0 ? "text-red-600" : "text-[var(--text-1)]"}
            sub={regressed > 0 ? "need a look" : "none"}
          />
          <MiniStat
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
      </div>
    </article>
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
