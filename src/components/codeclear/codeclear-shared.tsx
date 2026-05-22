"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  PlayCircleIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/format";
import {
  analysisStateLabel,
  CANDIDATE_SIGNAL_SOURCES,
  statusLabel,
  tierLabel,
  type CandidateSignalSource,
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
  TIER_2: "border-amber-200 bg-amber-50 text-amber-700",
  TIER_3: "border-rose-200 bg-rose-50 text-rose-700",
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
  selected = true,
}: {
  label: string;
  tone?: "neutral" | "brand" | "success" | "stack";
  selected?: boolean;
}) {
  const stackPalette = [
    "border-sky-200 bg-sky-50 text-sky-700",
    "border-violet-200 bg-violet-50 text-violet-700",
    "border-emerald-200 bg-emerald-50 text-emerald-700",
    "border-amber-200 bg-amber-50 text-amber-700",
    "border-rose-200 bg-rose-50 text-rose-700",
    "border-cyan-200 bg-cyan-50 text-cyan-700",
  ];
  const hash = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "brand"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : tone === "stack"
              ? selected
                ? stackPalette[hash % stackPalette.length]
                : "border-[var(--border-2)] bg-white text-[var(--text-4)]"
            : "border-[var(--border-2)] bg-white text-[var(--text-3)]",
      )}
    >
      {label}
    </span>
  );
}

export function SignalSourcePill({
  source,
  active = true,
}: {
  source: CandidateSignalSource;
  active?: boolean;
}) {
  const label =
    CANDIDATE_SIGNAL_SOURCES.find((entry) => entry.value === source)?.label ?? source;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition",
        active
          ? "border-[rgba(63,98,255,0.2)] bg-[rgba(63,98,255,0.08)] text-[var(--brand-700)]"
          : "border-[var(--border-2)] bg-white text-[var(--text-4)]",
      )}
    >
      {label}
    </span>
  );
}

export function CodeClearTierPanel({
  tier,
  className,
}: {
  tier: CodeClearTier;
  className?: string;
}) {
  const tone =
    tier === "TIER_1"
      ? "border-emerald-300 bg-[linear-gradient(180deg,#f3fff7_0%,#dcfce7_100%)] text-emerald-700"
      : tier === "TIER_2"
        ? "border-amber-300 bg-[linear-gradient(180deg,#fffdf1_0%,#fef3c7_100%)] text-amber-700"
        : "border-rose-300 bg-[linear-gradient(180deg,#fff5f5_0%,#ffe4e6_100%)] text-rose-700";

  const number = tier === "TIER_1" ? "1" : tier === "TIER_2" ? "2" : "3";

  return (
    <div
      className={cn(
        "flex h-[89px] w-[94px] flex-col items-center justify-center rounded-[10px] border px-3 py-1 shadow-[var(--shadow-xs)]",
        tone,
        className,
      )}
    >
      <p className="text-[12px] font-medium leading-[18px]">Tier</p>
      <p className="mt-0.5 text-[48px] font-bold leading-[47px] tracking-[-0.96px]">{number}</p>
    </div>
  );
}

export function CodeClearActionButton({
  children,
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="primary"
      size="sm"
      className={cn(
        "h-8 rounded-[6px] border border-[var(--border-1)] bg-[linear-gradient(167.64deg,#72edf2_0%,#5151e5_100%)] px-[10px] py-[6px] text-[14px] font-semibold leading-[20px] text-white shadow-[var(--shadow-skeuomorphic)] hover:bg-[linear-gradient(167.64deg,#72edf2_0%,#5151e5_100%)] hover:text-white",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

export function SignalSourceIcons({
  sources,
  className,
}: {
  sources: CandidateSignalSource[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-[var(--text-4)]", className)}>
      {sources.map((source) => (
        <span
          key={source}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-2)] bg-white"
          title={CANDIDATE_SIGNAL_SOURCES.find((entry) => entry.value === source)?.label ?? source}
        >
          <SourceIcon source={source} />
        </span>
      ))}
    </div>
  );
}

function SourceIcon({ source }: { source: CandidateSignalSource }) {
  if (source === "GITHUB") {
    return (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.33 2.74-1.05 2.74-1.05.56 1.4.21 2.44.11 2.7.64.72 1.02 1.63 1.02 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.85 0 .28.18.61.69.5A10.17 10.17 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
      </svg>
    );
  }

  if (source === "LINKEDIN") {
    return (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true">
        <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3A1.97 1.97 0 0 0 3.25 5c0 1.09.88 1.97 1.97 1.97h.03c1.1 0 2-.88 2-1.97A1.98 1.98 0 0 0 5.25 3ZM20.75 13.02c0-3.47-1.85-5.08-4.33-5.08-1.99 0-2.88 1.1-3.38 1.86V8.5H9.66c.05.86 0 11.5 0 11.5h3.38v-6.42c0-.34.02-.68.12-.92.27-.68.87-1.39 1.88-1.39 1.33 0 1.86 1.05 1.86 2.59V20h3.38v-6.98Z" />
      </svg>
    );
  }

  if (source === "PORTFOLIO") {
    return <GlobeAltIcon className="h-4.5 w-4.5" />;
  }

  if (source === "CV") {
    return <DocumentTextIcon className="h-4.5 w-4.5" />;
  }

  if (source === "REFERENCE") {
    return <UserGroupIcon className="h-4.5 w-4.5" />;
  }

  return <SparklesIcon className="h-4.5 w-4.5" />;
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
  prefix = "Updated",
}: {
  updatedAt: string;
  recheckDueAt?: string | null;
  prefix?: string;
}) {
  return (
    <div className="space-y-1 text-xs text-[var(--text-4)]">
      <p>
        {prefix === "Never run" ? "Never run" : `${prefix} ${formatDate(updatedAt)}`}
      </p>
      {recheckDueAt ? <p>Re-check {formatDate(recheckDueAt)}</p> : null}
    </div>
  );
}
