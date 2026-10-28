"use client";

import { cn } from "@/lib/format";

export function VitalScore({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const color =
    score === null ? "text-[var(--text-4)]"
    : score >= 90 ? "text-emerald-600"
    : score >= 50 ? "text-amber-600"
    : "text-red-600";
  const ring =
    score === null ? "border-[var(--border-2)]"
    : score >= 90 ? "border-emerald-300"
    : score >= 50 ? "border-amber-300"
    : "border-red-300";
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-[10px] border p-3", ring)}>
      <span className={cn("text-xl font-bold tabular-nums", color)}>
        {score !== null ? score : "—"}
      </span>
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-[var(--text-4)]">
        {label}
      </span>
    </div>
  );
}

export function VitalMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "PASS" | "WARN" | "FAIL";
}) {
  const color =
    status === "PASS" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : status === "WARN" ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";
  return (
    <div className={cn("flex items-center justify-between rounded-[10px] border px-3 py-2", color)}>
      <span className="text-xs font-medium">{label}</span>
      <span className="font-mono text-xs font-bold">{value}</span>
    </div>
  );
}
