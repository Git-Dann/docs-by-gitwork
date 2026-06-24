"use client";

import Link from "next/link";
import { useMonitors, useUpdateMonitor, useDeleteMonitor } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PulseMonitorsPanel() {
  const { data, isLoading } = useMonitors();
  const { mutate: update } = useUpdateMonitor();
  const { mutate: remove, isPending: removing, variables: removingId } = useDeleteMonitor();

  const monitors = data?.monitors ?? [];
  if (isLoading || monitors.length === 0) return null; // quietly absent until monitors exist

  return (
    <div className="app-card p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-[var(--text-1)]">Continuous monitoring</p>
        <p className="mt-0.5 text-xs text-[var(--text-4)]">
          Scheduled re-scans — alerts fire on a health drop or a new confirmed critical issue (e.g. RLS turned off).
        </p>
      </div>
      <div className="space-y-2">
        {monitors.map((m) => {
          const target = m.inputUrl ?? m.inputGithubRepo ?? m.projectName;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--border-2)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-1)]">{m.projectName}</p>
                <p className="truncate text-xs text-[var(--text-4)]">{target} · last run {timeAgo(m.lastRunAt)}</p>
              </div>
              {m.lastScanId ? (
                <Link href={`/app/pulse/${m.lastScanId}`} className={cn("text-sm font-bold tabular-nums", scoreTone(m.lastHealthScore))}>
                  {m.lastHealthScore ?? "—"}
                </Link>
              ) : (
                <span className="text-sm font-bold tabular-nums text-[var(--text-4)]">—</span>
              )}
              <select
                value={m.frequency}
                onChange={(e) => update({ monitorId: m.id, frequency: e.target.value as "DAILY" | "WEEKLY" | "OFF" })}
                className="app-select !h-8 !w-auto !py-0 text-xs"
                aria-label="Monitor frequency"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="OFF">Paused</option>
              </select>
              <button
                type="button"
                onClick={() => update({ monitorId: m.id, isActive: !m.isActive })}
                className={cn(
                  "rounded-[6px] border px-2 py-1 text-xs font-medium transition",
                  m.isActive ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[var(--border-2)] text-[var(--text-4)]",
                )}
              >
                {m.isActive ? "Active" : "Inactive"}
              </button>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={removing && removingId === m.id}
                className="text-xs text-[var(--text-4)] hover:text-red-600"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
