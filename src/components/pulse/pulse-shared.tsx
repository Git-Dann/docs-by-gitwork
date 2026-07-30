"use client";

import Link from "next/link";
import { PlusIcon, SignalIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PULSE_FRAMEWORK, PULSE_EXECUTABLE_CHECK_TOTAL, PULSE_EVIDENCE_REQUIREMENT_TOTAL, PULSE_CATEGORY_TOTAL, type PulseFrameworkCategory } from "@/config/pulse-framework";
import type { PulseCheckStatus, PulseScanStatus, PulseUrgency, PulseBusinessValue, PulseEffort } from "@/types/pulse";

// ── Framework coverage ─────────────────────────────────────────────────────────
// Categories grouped into four themes so "what Pulse checks" reads as a capability
// showcase, not a 23-cell spreadsheet. Reference material — shown on the empty state
// and behind a disclosure on the dashboard.

type FrameworkTheme = "AI-era" | "Security & compliance" | "Performance & quality" | "Growth & ops";

const THEME_ORDER: FrameworkTheme[] = ["AI-era", "Security & compliance", "Performance & quality", "Growth & ops"];

const THEME_BY_NAME: Record<string, FrameworkTheme> = {
  Security: "Security & compliance",
  "Legal & Compliance": "Security & compliance",
  Authentication: "Security & compliance",
  "Roles & Permissions": "Security & compliance",
  "Business Operations": "Security & compliance",
  Performance: "Performance & quality",
  Accessibility: "Performance & quality",
  "Mobile & Accessibility": "Performance & quality",
  SEO: "Performance & quality",
  "API Quality": "Performance & quality",
  Observability: "Performance & quality",
  "Code Quality": "Performance & quality",
};

function themeFor(cat: PulseFrameworkCategory): FrameworkTheme {
  if (cat.aiEra) return "AI-era";
  return THEME_BY_NAME[cat.name] ?? "Growth & ops";
}

export function PulseFrameworkCoverage() {
  const grouped = THEME_ORDER.map((theme) => {
    const cats = PULSE_FRAMEWORK.filter((c) => themeFor(c) === theme);
    const checks = cats.reduce((sum, c) => sum + c.count, 0);
    return { theme, cats, checks };
  }).filter((g) => g.cats.length > 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-2)] pb-3">
        <p className="text-sm font-semibold text-[var(--text-1)]">What Pulse checks</p>
        <p className="text-xs tabular-nums text-[var(--text-4)]">
          <span className="font-semibold text-[var(--text-2)]">{PULSE_EXECUTABLE_CHECK_TOTAL}</span> automated checks ·{" "}
          <span className="font-semibold text-[var(--text-2)]">{PULSE_EVIDENCE_REQUIREMENT_TOTAL}</span> evidence requirements ·{" "}
          <span className="font-semibold text-[var(--text-2)]">{PULSE_CATEGORY_TOTAL}</span> categories
        </p>
      </div>

      <div className="mt-4 space-y-5">
        {grouped.map(({ theme, cats, checks }) => (
          <div key={theme}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.12em]",
                  theme === "AI-era" ? "text-[var(--brand-600)]" : "text-[var(--text-4)]",
                )}
              >
                {theme}
              </span>
              <span className="h-px flex-1 bg-[var(--border-2)]" />
              <span className="text-[10px] tabular-nums text-[var(--text-4)]">{checks} checks</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {cats.map((cat) => (
                <div
                  key={cat.name}
                  className={cn(
                    "group/cat rounded-[8px] border px-2.5 py-2 text-left transition",
                    cat.aiEra
                      ? "border-[var(--brand-200)] bg-[var(--surface-brand-soft)] hover:border-[var(--brand-300)]"
                      : "border-[var(--border-2)] bg-[var(--surface-0)] hover:border-[var(--border-3)] hover:bg-[var(--surface-1)]",
                  )}
                  title={cat.blurb}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-xs font-semibold leading-tight text-[var(--text-1)]">{cat.name}</span>
                    <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 text-[10px] font-semibold tabular-nums leading-5 text-[var(--text-3)]">
                      {cat.count}
                    </span>
                  </div>
                  {cat.aiEra && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--brand-100)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--brand-700)]">
                      <span className="h-1 w-1 rounded-full bg-[var(--brand-500)]" />
                      New
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Health-score pill (X/100). */
export function HealthScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-[var(--text-4)]">—</span>;
  const cls =
    score >= 75
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 50
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", cls)}>
      {score}/100
    </span>
  );
}

/** Monitor status dot — solid emerald when watching, pulsing red when alerting. */
export function MonitorDot({ monitor }: { monitor: { active: boolean; alerting: boolean } | null }) {
  if (!monitor || !monitor.active) {
    return <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--border-3)]" title="Not monitored" />;
  }
  if (monitor.alerting) {
    return (
      <span className="relative inline-flex h-2 w-2" title="Monitor alerting">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
    );
  }
  return <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" title="Monitored" />;
}

/** First-run empty state — leads with the value (what Pulse checks) + a New-scan CTA. */
export function PulseEmptyState() {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-2)] py-14 text-center">
      <SignalIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
      <p className="text-sm font-medium text-[var(--text-2)]">No scans yet</p>
      <p className="mt-1 text-sm text-[var(--text-4)]">Run your first Pulse scan to validate a client project.</p>
      <div className="mt-4 flex justify-center">
        <Link href="/app/pulse/new">
          <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />}>
            New scan
          </Button>
        </Link>
      </div>
      <div className="mx-auto mt-10 max-w-4xl border-t border-[var(--border-2)] pt-8 text-left">
        <PulseFrameworkCoverage />
      </div>
    </div>
  );
}

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
    LOW: "bg-[var(--surface-1)] text-[var(--text-3)] border-[var(--border-2)]",
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
