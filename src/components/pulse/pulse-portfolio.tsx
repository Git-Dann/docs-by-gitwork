"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, MagnifyingGlassIcon, XMarkIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { usePulsePortfolio } from "@/hooks/use-pulse";
import { cn, formatRelative } from "@/lib/format";
import type { PulsePortfolioEntry } from "@/types/pulse";
import { MiniSparkline, TrendDelta, HealthScorePill, MonitorDot, PulseEmptyState } from "@/components/pulse/pulse-shared";

// Shared grid template so header + rows align exactly.
const GRID_COLS = "1.5rem minmax(0,1fr) 5rem 3.5rem 4.5rem 2rem";

function PortfolioRow({ entry }: { entry: PulsePortfolioEntry }) {
  const atRisk = entry.worstScore !== null && entry.worstScore < 50;
  const href = entry.latestScanId ? `/app/pulse/${entry.latestScanId}` : "/app/pulse";

  return (
    <Link
      href={href}
      className={cn(
        "group flex sm:grid items-center gap-3 border-l-2 px-4 py-3.5 transition hover:bg-[var(--surface-1)]",
        atRisk ? "border-l-red-400" : entry.monitor?.alerting ? "border-l-red-400" : "border-l-transparent",
      )}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* Col 1 — monitor status dot */}
      <span className="flex items-center justify-center">
        <MonitorDot monitor={entry.monitor} />
      </span>

      {/* Col 2 — label + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-600)]">
            {entry.label}
          </p>
          {entry.running && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              <span className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
              scanning
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
          {entry.scanCount} scan{entry.scanCount !== 1 ? "s" : ""}
          {entry.lastScannedAt && <span> · {formatRelative(entry.lastScannedAt)}</span>}
          {entry.clientId === null && <span className="ml-1 text-[var(--text-4)]">· standalone</span>}
        </p>
        {/* Mobile meta */}
        <div className="mt-1.5 flex items-center gap-2 sm:hidden">
          <HealthScorePill score={entry.latestScore} />
          <TrendDelta delta={entry.delta} />
        </div>
      </div>

      {/* Col 3 — sparkline (desktop) */}
      <div className="hidden sm:flex sm:items-center">
        <MiniSparkline scores={entry.sparkline} />
      </div>

      {/* Col 4 — delta (desktop) */}
      <div className="hidden sm:flex sm:items-center">
        <TrendDelta delta={entry.delta} />
      </div>

      {/* Col 5 — score (desktop) */}
      <div className="hidden sm:flex sm:items-center">
        <HealthScorePill score={entry.latestScore} />
      </div>

      {/* Col 6 — chevron */}
      <span className="hidden sm:flex sm:items-center sm:justify-end text-[var(--text-4)] transition group-hover:text-[var(--brand-500)]">
        <ArrowRightIcon className="h-4 w-4" />
      </span>
    </Link>
  );
}

export function PulsePortfolioView() {
  const { data, isLoading, error } = usePulsePortfolio();
  const [search, setSearch] = useState("");

  const portfolio = useMemo(() => data?.portfolio ?? [], [data?.portfolio]);
  const filtered = useMemo(() => {
    if (!search.trim()) return portfolio;
    const q = search.trim().toLowerCase();
    return portfolio.filter((e) => e.label.toLowerCase().includes(q));
  }, [portfolio, search]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">Failed to load portfolio. Please refresh.</p>;
  }

  if (portfolio.length === 0) {
    return <PulseEmptyState />;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
        <input
          className="app-input pl-9 text-sm"
          placeholder="Search clients & projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No matches</p>
          <button type="button" onClick={() => setSearch("")} className="mt-2 text-sm text-[var(--brand-600)] hover:underline">
            Clear search
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
          {/* Header */}
          <div
            className="hidden sm:grid items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2.5"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <span />
            <span className="text-xs font-medium text-[var(--text-4)]">Client / project</span>
            <span className="text-xs font-medium text-[var(--text-4)]">Trend</span>
            <span className="text-xs font-medium text-[var(--text-4)]">Δ</span>
            <span className="text-xs font-medium text-[var(--text-4)]">Health</span>
            <span />
          </div>
          <div className="divide-y divide-[var(--border-2)]">
            {filtered.map((entry) => (
              <PortfolioRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-4)]">
        <BuildingOffice2Icon className="h-3.5 w-3.5" />
        {portfolio.length} {portfolio.length === 1 ? "client/project" : "clients & projects"} · sorted by attention (alerting & lowest score first)
      </p>
    </div>
  );
}
