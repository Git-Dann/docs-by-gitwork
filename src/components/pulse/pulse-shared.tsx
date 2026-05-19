"use client";

import { cn } from "@/lib/format";
import type { PulseCheckStatus, PulseScanStatus, PulseUrgency, PulseBusinessValue, PulseEffort } from "@/types/pulse";

export function PulseScanStatusBadge({ status }: { status: PulseScanStatus }) {
  const styles: Record<PulseScanStatus, string> = {
    RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<PulseScanStatus, string> = {
    RUNNING: "Running…",
    COMPLETED: "Complete",
    FAILED: "Failed",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[status])}>
      {status === "RUNNING" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
      )}
      {labels[status]}
    </span>
  );
}

export function PulseCheckStatusIcon({ status }: { status: PulseCheckStatus }) {
  if (status === "PASS") return <span className="text-emerald-600" title="Pass">✓</span>;
  if (status === "WARN") return <span className="text-amber-500" title="Warning">⚠</span>;
  if (status === "FAIL") return <span className="text-red-600" title="Fail">✗</span>;
  return <span className="text-[var(--text-4)]" title="Skipped">—</span>;
}

export function PulseUrgencyBadge({ urgency }: { urgency: PulseUrgency }) {
  const styles: Record<PulseUrgency, string> = {
    CRITICAL: "bg-red-50 text-red-700 border-red-200",
    HIGH: "bg-orange-50 text-orange-700 border-orange-200",
    MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", styles[urgency])}>
      {urgency}
    </span>
  );
}

export function PulseEffortBadge({ effort }: { effort: PulseEffort }) {
  const styles: Record<PulseEffort, string> = {
    S: "bg-emerald-50 text-emerald-700 border-emerald-200",
    M: "bg-sky-50 text-sky-700 border-sky-200",
    L: "bg-amber-50 text-amber-700 border-amber-200",
    XL: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<PulseEffort, string> = {
    S: "Small",
    M: "Medium",
    L: "Large",
    XL: "X-Large",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", styles[effort])}>
      {labels[effort]}
    </span>
  );
}

export function PulseValueBadge({ value }: { value: PulseBusinessValue }) {
  const styles: Record<PulseBusinessValue, string> = {
    HIGH: "bg-emerald-50 text-emerald-700 border-emerald-200",
    MEDIUM: "bg-sky-50 text-sky-700 border-sky-200",
    LOW: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", styles[value])}>
      {value} value
    </span>
  );
}

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const color =
    score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : score >= 25 ? "#f97316" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-[var(--border-2)]"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-[var(--text-1)]" style={{ lineHeight: 1 }}>
          {score}
        </p>
        <p className="text-xs text-[var(--text-4)]">/100</p>
      </div>
    </div>
  );
}
