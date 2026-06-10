"use client";

import { cn } from "@/lib/format";
import type { SupportPerformanceMetrics } from "@/types/support";

type Health = "good" | "ok" | "bad" | "neutral";

const HEALTH_CLASS: Record<Health, string> = {
  good: "text-emerald-600",
  ok: "text-amber-600",
  bad: "text-red-500",
  neutral: "text-[var(--text-1)]",
};

const HEALTH_DOT: Record<Health, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-500",
  bad: "bg-red-400",
  neutral: "bg-[var(--text-4)]",
};

/** ms → compact human duration: 45s · 42m · 3.2h · 1.4d */
function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)}h`;
  const d = h / 24;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)}d`;
}

// Benchmark thresholds (industry 2026): FRT <1h best-in-class, <4h good;
// resolution rate 70%+ good, 80%+ strong; SLA compliance 90%+ target.
function frtHealth(ms: number | null): Health {
  if (ms === null) return "neutral";
  const h = ms / 3600_000;
  if (h <= 1) return "good";
  if (h <= 4) return "ok";
  return "bad";
}

function resolutionRateHealth(pct: number): Health {
  if (pct >= 80) return "good";
  if (pct >= 70) return "ok";
  return "bad";
}

function slaHealth(pct: number | null): Health {
  if (pct === null) return "neutral";
  if (pct >= 90) return "good";
  if (pct >= 75) return "ok";
  return "bad";
}

function resolutionTimeHealth(ms: number | null): Health {
  if (ms === null) return "neutral";
  const h = ms / 3600_000;
  if (h <= 24) return "good";
  if (h <= 72) return "ok";
  return "bad";
}

function StatCard({
  label,
  value,
  sub,
  health,
}: {
  label: string;
  value: string;
  sub?: string;
  health: Health;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_DOT[health])} />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]">
          {label}
        </span>
      </div>
      <p className={cn("mt-1 text-xl font-semibold leading-none", HEALTH_CLASS[health])}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[var(--text-4)]">{sub}</p>}
    </div>
  );
}

/**
 * A row of support-desk KPI cards (first response, resolution, SLA), colour-graded
 * against industry benchmarks. Pure presentational — pass it computed metrics.
 */
export function PerformanceStrip({
  metrics,
  className,
}: {
  metrics: SupportPerformanceMetrics;
  className?: string;
}) {
  const m = metrics;
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6", className)}>
      <StatCard
        label="Tickets"
        value={m.totalTickets.toLocaleString()}
        sub={`${m.openCount} open`}
        health="neutral"
      />
      <StatCard
        label="Avg first reply"
        value={formatDuration(m.avgFirstResponseMs)}
        sub={m.medianFirstResponseMs !== null ? `${formatDuration(m.medianFirstResponseMs)} median` : undefined}
        health={frtHealth(m.avgFirstResponseMs)}
      />
      <StatCard
        label={`SLA ≤${m.slaTargetHours}h`}
        value={m.slaFrtCompliancePct !== null ? `${m.slaFrtCompliancePct}%` : "—"}
        sub={m.respondedCount > 0 ? `${m.respondedCount} replied` : "no replies yet"}
        health={slaHealth(m.slaFrtCompliancePct)}
      />
      <StatCard
        label="Avg resolution"
        value={formatDuration(m.avgResolutionMs)}
        sub={m.medianResolutionMs !== null ? `${formatDuration(m.medianResolutionMs)} median` : undefined}
        health={resolutionTimeHealth(m.avgResolutionMs)}
      />
      <StatCard
        label="Resolution rate"
        value={`${m.resolutionRate}%`}
        sub={`${m.resolvedCount} resolved`}
        health={resolutionRateHealth(m.resolutionRate)}
      />
      <StatCard
        label="Responded"
        value={m.totalTickets > 0 ? `${Math.round((m.respondedCount / m.totalTickets) * 100)}%` : "—"}
        sub={`${m.respondedCount}/${m.totalTickets}`}
        health="neutral"
      />
    </div>
  );
}
