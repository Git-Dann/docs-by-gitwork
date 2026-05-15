"use client";

import Link from "next/link";
import { ArrowRightIcon, SignalIcon } from "@heroicons/react/24/outline";
import { usePulseScans } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanListItem } from "@/types/pulse";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";

function HealthScorePill({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 75
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 50
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", color)}>
      {score}/100
    </span>
  );
}

function ScanRow({ scan }: { scan: PulseScanListItem }) {
  const inputLabel =
    scan.inputType === "URL"
      ? scan.inputUrl
      : scan.inputType === "GITHUB_REPO"
        ? `github.com/${scan.inputGithubRepo}`
        : "Description";

  return (
    <Link
      href={`/app/pulse/${scan.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--surface-1)] transition"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]">
        <SignalIcon className="h-5 w-5 text-[var(--text-4)]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{scan.projectName}</p>
        {inputLabel && (
          <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">{inputLabel}</p>
        )}
        {scan.clientName && (
          <p className="mt-0.5 text-xs text-[var(--text-3)]">{scan.clientName}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <HealthScorePill score={scan.healthScore} />
        <PulseScanStatusBadge status={scan.status} />
        <p className="hidden text-xs text-[var(--text-4)] sm:block">{formatDate(scan.createdAt)}</p>
        <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)]" />
      </div>
    </Link>
  );
}

export function PulseScanListView() {
  const { data, isLoading, error } = usePulseScans();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">Failed to load scans. Please refresh.</p>
    );
  }

  const scans = data?.scans ?? [];

  if (scans.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[var(--border-2)] py-16 text-center">
        <SignalIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
        <p className="text-sm font-medium text-[var(--text-2)]">No scans yet</p>
        <p className="mt-1 text-sm text-[var(--text-4)]">
          Run your first Pulse scan to validate a client project.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--border-2)] divide-y divide-[var(--border-2)]">
      {(scans as PulseScanListItem[]).map((scan) => (
        <ScanRow key={scan.id} scan={scan} />
      ))}
    </div>
  );
}
