"use client";

import type { CompetitorData } from "@/types/pulse";
import { cn } from "@/lib/format";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export function CompetitorsTab({ data, mainScore }: { data: CompetitorData; mainScore: number }) {
  const all: Array<{ label: string; score: number; isMain: boolean; detail?: typeof data.scans[number] }> = [
    { label: "Your project", score: mainScore, isMain: true },
    ...data.scans.map((c) => ({ label: c.url, score: c.healthScore, isMain: false, detail: c })),
  ].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      {/* Scoreboard */}
      <div>
        <p className="app-eyebrow mb-3">Score comparison</p>
        <div className="space-y-2">
          {all.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-[10px] border p-3",
                entry.isMain ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)]" : "border-[var(--border-2)] bg-white",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                #{i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", entry.isMain ? "text-[var(--brand-700)]" : "text-[var(--text-1)]")}>
                  {entry.isMain ? "Your project" : entry.label}
                </p>
                {!entry.isMain && entry.detail && (
                  <p className="text-[11px] text-[var(--text-4)]">
                    {entry.detail.checksPass}P · {entry.detail.checksWarn}W · {entry.detail.checksFail}F
                    {entry.detail.techStack.length > 0 && ` · ${entry.detail.techStack.slice(0, 3).join(", ")}`}
                  </p>
                )}
              </div>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                entry.score >= 75 ? "text-emerald-600" : entry.score >= 50 ? "text-amber-600" : "text-red-600",
              )}>
                {entry.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI comparison */}
      {data.comparison && (
        <>
          <div className="rounded-[10px] border border-[var(--border-2)] p-5">
            <p className="app-eyebrow mb-2">Summary</p>
            <p className="text-sm leading-relaxed text-[var(--text-2)]">{data.comparison.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {data.comparison.advantages.length > 0 && (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-sm font-semibold text-emerald-800">Where you lead</p>
                <ul className="space-y-1.5">
                  {data.comparison.advantages.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                      <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.comparison.gaps.length > 0 && (
              <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
                <p className="mb-2 text-sm font-semibold text-red-800">Where they lead</p>
                <ul className="space-y-1.5">
                  {data.comparison.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-5">
            <p className="mb-1.5 text-sm font-semibold text-amber-800">How to overtake them</p>
            <p className="text-sm text-amber-700">{data.comparison.recommendation}</p>
          </div>
        </>
      )}
    </div>
  );
}
