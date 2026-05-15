"use client";

import Link from "next/link";
import { ArrowRightIcon, DocumentTextIcon, SignalIcon } from "@heroicons/react/24/outline";
import { usePulseStats } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanListItem } from "@/types/pulse";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";

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

function RecentScanRow({ scan }: { scan: PulseScanListItem }) {
  const healthColor =
    scan.healthScore === null
      ? "text-[var(--text-4)]"
      : scan.healthScore >= 75
        ? "text-emerald-600"
        : scan.healthScore >= 50
          ? "text-amber-600"
          : "text-red-600";

  return (
    <Link
      href={`/app/pulse/${scan.id}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--surface-1)] transition"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)]">
        <SignalIcon className="h-4 w-4 text-[var(--text-4)]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{scan.projectName}</p>
        {scan.clientName && (
          <p className="mt-0.5 text-xs text-[var(--text-4)]">{scan.clientName}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {scan.healthScore !== null && (
          <span className={cn("text-sm font-semibold tabular-nums", healthColor)}>
            {scan.healthScore}
          </span>
        )}
        <PulseScanStatusBadge status={scan.status} />
        {scan.generatedProposalId && (
          <DocumentTextIcon className="h-4 w-4 text-[var(--brand-500)]" title="Proposal generated" />
        )}
        <span className="hidden text-xs text-[var(--text-4)] sm:block">{formatDate(scan.createdAt)}</span>
        <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)]" />
      </div>
    </Link>
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
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
          ))}
        </div>
      </div>
    );
  }

  const stats = data;

  if (!stats || stats.totalScans === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[var(--border-2)] py-20 text-center">
        <SignalIcon className="mx-auto mb-3 h-9 w-9 text-[var(--text-4)]" />
        <p className="text-sm font-medium text-[var(--text-2)]">No scans yet</p>
        <p className="mt-1 text-sm text-[var(--text-4)]">
          Run your first Pulse scan to start validating client projects.
        </p>
      </div>
    );
  }

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
          label="Proposals drafted"
          value={String(stats.proposalsGenerated)}
          caption={stats.proposalsGenerated > 0 ? "Auto-generated from scans" : "None yet"}
        />
      </div>

      {/* Health distribution bar */}
      <HealthBar
        green={stats.healthTiers.green}
        amber={stats.healthTiers.amber}
        red={stats.healthTiers.red}
      />

      {/* Recent scans */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text-1)]">Recent scans</p>
          <Link
            href="/app/pulse/all"
            className="text-xs text-[var(--brand-600)] hover:underline"
          >
            View all
          </Link>
        </div>

        {stats.recentScans.length === 0 ? (
          <p className="text-sm text-[var(--text-4)]">No scans yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-[var(--border-2)] divide-y divide-[var(--border-2)]">
            {stats.recentScans.map((scan) => (
              <RecentScanRow key={scan.id} scan={scan} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
