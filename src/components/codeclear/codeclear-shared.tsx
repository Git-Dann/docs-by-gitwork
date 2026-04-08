"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, formatDate } from "@/lib/format";
import {
  analysisStateLabel,
  statusLabel,
  tierLabel,
  type CandidateAnalysisState,
  type PipelineStatus,
  type CodeClearTier,
} from "@/types/codeclear";

const statusTone: Record<PipelineStatus, string> = {
  SOURCED: "border-slate-200 bg-slate-50 text-slate-700",
  INVITED: "border-sky-200 bg-sky-50 text-sky-700",
  ASSESSMENT_IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-700",
  CODECLEAR_COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PLACED: "border-violet-200 bg-violet-50 text-violet-700",
  RECHECK_DUE: "border-rose-200 bg-rose-50 text-rose-700",
};

const tierTone: Record<CodeClearTier, string> = {
  TIER_1: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TIER_2: "border-sky-200 bg-sky-50 text-sky-700",
  TIER_3: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const analysisTone: Record<
  CandidateAnalysisState,
  { className: string; icon: typeof SparklesIcon }
> = {
  NEVER_RUN: {
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
    icon: SparklesIcon,
  },
  RUNNING: {
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: PlayCircleIcon,
  },
  DRAFT_UPDATED: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: ClockIcon,
  },
  COMPLETE: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircleIcon,
  },
  FAILED: {
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: ExclamationTriangleIcon,
  },
};

const tabItems = [
  { href: "/app/codeclear", label: "Overview" },
  { href: "/app/codeclear/candidates", label: "Candidates" },
  { href: "/app/codeclear/pipeline", label: "Pipeline" },
] as const;

export function CodeClearTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {tabItems.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition",
              active
                ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)] hover:text-[var(--text-1)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function CodeClearStatusBadge({
  status,
  className,
}: {
  status: PipelineStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusTone[status],
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function CodeClearTierBadge({
  tier,
  className,
}: {
  tier: CodeClearTier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tierTone[tier],
        className,
      )}
    >
      {tierLabel(tier)}
    </span>
  );
}

export function CodeClearAnalysisBadge({
  state,
  className,
}: {
  state: CandidateAnalysisState;
  className?: string;
}) {
  const tone = analysisTone[state];
  const Icon = tone.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {analysisStateLabel(state)}
    </span>
  );
}

export function CodeClearScoreBadge({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const score = typeof value === "number" ? value : null;
  const tone =
    score === null
      ? "border-zinc-200 bg-zinc-50 text-zinc-600"
      : score >= 80
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : score >= 65
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone,
        className,
      )}
    >
      {score === null ? "Pending" : `${score}/100`}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="app-card p-5">
      <p className="text-sm font-medium text-[var(--text-3)]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
        {value}
      </p>
      {caption ? <p className="mt-2 text-sm text-[var(--text-4)]">{caption}</p> : null}
    </div>
  );
}

export function StackPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "brand" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "brand"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-[var(--border-2)] bg-white text-[var(--text-3)]",
      )}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="app-card flex min-h-[180px] items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-[var(--text-1)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{body}</p>
      </div>
    </div>
  );
}

export function CandidateMeta({
  updatedAt,
  recheckDueAt,
}: {
  updatedAt: string;
  recheckDueAt?: string | null;
}) {
  return (
    <div className="space-y-1 text-xs text-[var(--text-4)]">
      <p>Updated {formatDate(updatedAt)}</p>
      {recheckDueAt ? <p>Re-check {formatDate(recheckDueAt)}</p> : null}
    </div>
  );
}
