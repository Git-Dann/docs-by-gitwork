"use client";

// Shared analytics primitives, on the DESIGN.md widget grammar: numbered mono headers,
// DM Serif Display stat figures, JetBrains Mono data-labels, hairline cards, no shadows,
// Gitwork Blue data highlights. Reused across the Portal + (future) AI-usage sections.

import type { ReactNode } from "react";

export const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
export const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";

/** Standard numbered widget card — the Foundry brand signature (`NN // NAME`). */
export function WidgetCard({
  number,
  label,
  status,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  number: string;
  label: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`widget-card ${className}`}>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
        {status ? <span className="widget-header__status">{status}</span> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Editorial stat tile — DM Serif figure over a mono data-label caption (the data signature). */
export function StatTile({
  figure,
  label,
  tone,
  sub,
}: {
  figure: ReactNode;
  label: string;
  tone?: "default" | "danger" | "success" | "warning";
  sub?: ReactNode;
}) {
  const color =
    tone === "danger"
      ? "var(--danger-500)"
      : tone === "success"
        ? "var(--success-500)"
        : tone === "warning"
          ? "var(--warning-500)"
          : "var(--text-1)";
  return (
    <div className="rounded-[8px] border border-[var(--border-2)] px-3.5 py-3">
      <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, letterSpacing: "-0.02em", color }} className="tabular-nums">
        {figure}
      </div>
      <div className="mt-1.5" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
        {label}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-[var(--text-3)]">{sub}</div> : null}
    </div>
  );
}

/** Labelled horizontal bar meter — value as a share of `total`. */
export function BarMeter({
  label,
  value,
  total,
  color = "var(--brand-700)",
}: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-2)]">{label}</span>
        <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-3)" }}>
          {value}
          <span className="text-[var(--text-4)]">{` · ${pct}%`}</span>
        </span>
      </div>
      <span className="widget-progress block h-1.5 w-full">
        <span className="widget-progress__fill block h-full" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}

/** Dual-series sparkline (created vs completed) drawn as inline SVG — no chart lib. */
export function DualSparkline({
  primary,
  secondary,
  primaryColor = "var(--brand-500)",
  secondaryColor = "var(--text-4)",
  height = 56,
}: {
  primary: number[];
  secondary?: number[];
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
}) {
  const w = 320;
  const h = height;
  const pad = 4;
  const all = [...primary, ...(secondary ?? [])];
  const max = Math.max(1, ...all);
  const line = (points: number[]) => {
    if (points.length === 0) return "";
    const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    return points
      .map((p, i) => {
        const x = pad + i * step;
        const y = pad + (1 - p / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Throughput over time">
      {secondary ? (
        <path d={line(secondary)} fill="none" stroke={secondaryColor} strokeWidth={1.25} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />
      ) : null}
      <path d={line(primary)} fill="none" stroke={primaryColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Small inline progress cell for tables (value% + bar). */
export function ProgressCell({ value, color = "var(--brand-600)" }: { value: number | null; color?: string }) {
  if (value == null) return <span className="text-[var(--text-4)]">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{value}%</span>
      <span className="widget-progress" style={{ width: 44 }}>
        <span className="widget-progress__fill" style={{ width: `${value}%`, background: color }} />
      </span>
    </span>
  );
}

// Shared table cell styling (mono headers, hairline rows) — matches the Golf Data Console.
export const analyticsTh = "px-3 py-2 text-left align-middle";
export const analyticsTd = "px-3 py-2.5 align-middle border-t border-[var(--border-2)]";
export const analyticsThStyle = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--text-4)",
};
