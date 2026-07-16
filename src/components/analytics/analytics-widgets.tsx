"use client";

// Shared analytics primitives, on the DESIGN.md widget grammar: numbered mono headers,
// DM Serif Display stat figures, JetBrains Mono data-labels, hairline cards, no shadows,
// Gitwork Blue data highlights. Reused across the Portal + (future) AI-usage sections.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

export const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
export const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";

/**
 * Small info affordance carrying a plain-English explanation — so a reader who doesn't know the
 * in-house term (lead time, standup, …) can get it. Click-to-reveal (no hover timer). The popover
 * is fixed-positioned off the button's rect so it isn't clipped by the card's overflow:hidden.
 */
export function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const open = pos != null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDoc = (e: globalThis.MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (open) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 240;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 6, left });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="What's this?"
        aria-expanded={open}
        onClick={toggle}
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 align-middle"
        style={{ color: open ? "var(--brand-600)" : "var(--text-4)" }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="8" cy="4.7" r="1.05" fill="currentColor" />
          <rect x="7.15" y="6.8" width="1.7" height="5" rx="0.85" fill="currentColor" />
        </svg>
      </button>
      {open && pos ? (
        <span
          role="tooltip"
          className="fixed z-[60] w-60 rounded-[8px] border p-2.5 text-left"
          style={{
            top: pos.top,
            left: pos.left,
            borderColor: "var(--border-2)",
            background: "var(--surface-0)",
            color: "var(--text-2)",
            fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.45,
            letterSpacing: 0,
            textTransform: "none",
            boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
          }}
        >
          {text}
        </span>
      ) : null}
    </>
  );
}

/** Standard numbered widget card — the Foundry brand signature (`NN // NAME`). */
export function WidgetCard({
  number,
  label,
  status,
  hint,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  number: string;
  label: string;
  status?: ReactNode;
  /** Plain-English one-liner shown as a hover tooltip beside the title, for non-jargon readers. */
  hint?: string;
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
          {hint ? <InfoTip text={hint} /> : null}
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

/**
 * Period-over-period trend chip: ▲/▼ + signed percentage, coloured by whether the move is *good*.
 * `goodWhen` says which direction is favourable (e.g. "up" for completed, "down" for lead time,
 * "neutral" for created — more isn't inherently better). Renders "—" when there's nothing to show.
 */
export function TrendBadge({
  delta,
  goodWhen = "up",
  compact = false,
}: {
  delta?: { deltaPct: number | null; direction: "up" | "down" | "flat" } | null;
  goodWhen?: "up" | "down" | "neutral";
  compact?: boolean;
}) {
  const flat = (
    <span style={{ fontFamily: MONO, fontSize: compact ? 10 : 11, letterSpacing: "0.04em", color: "var(--text-4)" }}>—</span>
  );
  if (!delta || delta.deltaPct == null || delta.direction === "flat") return flat;
  const up = delta.direction === "up";
  const good = goodWhen === "neutral" ? null : up === (goodWhen === "up");
  const color = good == null ? "var(--text-3)" : good ? "var(--success-500)" : "var(--danger-500)";
  const pct = Math.abs(Math.round(delta.deltaPct * 100));
  return (
    <span
      className="inline-flex items-center gap-0.5 tabular-nums"
      style={{ fontFamily: MONO, fontSize: compact ? 10 : 11, fontWeight: 600, letterSpacing: "0.02em", color }}
      title="vs previous period"
    >
      <span aria-hidden style={{ fontSize: compact ? 8 : 9 }}>{up ? "▲" : "▼"}</span>
      {pct}%
    </span>
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

/** Single-series area/line chart (SVG) with a soft gradient fill — for cumulative/trend views. */
export function AreaSparkline({
  points,
  color = "var(--brand-500)",
  height = 56,
}: {
  points: number[];
  color?: string;
  height?: number;
}) {
  const w = 320;
  const h = height;
  const pad = 4;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [pad + i * step, pad + (1 - p / max) * (h - pad * 2)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = coords.length
    ? `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`
    : "";
  const gid = `area-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Trend">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#${gid})`} stroke="none" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Vertical column chart (SVG). Supports negative values with a centred baseline (diverging). */
export function MiniColumns({
  values,
  positiveColor = "var(--brand-500)",
  negativeColor = "var(--danger-500)",
  height = 90,
}: {
  values: number[];
  positiveColor?: string;
  negativeColor?: string;
  height?: number;
}) {
  const w = 320;
  const h = height;
  const n = Math.max(1, values.length);
  const gap = n > 60 ? 0.5 : 2;
  const bw = (w - gap * (n - 1)) / n;
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const hasNeg = values.some((v) => v < 0);
  const baseline = hasNeg ? h / 2 : h - 2;
  const scale = (hasNeg ? h / 2 - 2 : h - 4) / maxAbs;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Columns">
      {hasNeg ? <line x1={0} y1={baseline} x2={w} y2={baseline} stroke="var(--border-2)" strokeWidth={1} /> : null}
      {values.map((v, i) => {
        const barH = Math.abs(v) * scale;
        const x = i * (bw + gap);
        const y = v >= 0 ? baseline - barH : baseline;
        return <rect key={i} x={x} y={y} width={Math.max(0.5, bw)} height={Math.max(0, barH)} rx={bw > 3 ? 1 : 0} fill={v >= 0 ? positiveColor : negativeColor} opacity={0.9} />;
      })}
    </svg>
  );
}

/** Donut chart (SVG) with a centred total and a compact legend. */
export function Donut({
  segments,
  total,
  centerLabel,
  size = 132,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total?: number;
  centerLabel?: string;
  size?: number;
}) {
  const sum = segments.reduce((a, s) => a + s.value, 0);
  const r = size / 2;
  const stroke = size * 0.18;
  const radius = r - stroke / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const centre = total ?? sum;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label="Distribution">
        <circle cx={r} cy={r} r={radius} fill="none" stroke="var(--border-2)" strokeWidth={stroke} opacity={0.4} />
        {sum > 0
          ? segments.map((s, i) => {
              const frac = s.value / sum;
              const dash = frac * circ;
              const el = (
                <circle
                  key={i}
                  cx={r}
                  cy={r}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${r} ${r})`}
                  strokeLinecap="butt"
                />
              );
              offset += dash;
              return el;
            })
          : null}
        <text x={r} y={r - 2} textAnchor="middle" style={{ fontFamily: SERIF, fontSize: size * 0.24, fill: "var(--text-1)" }}>{centre}</text>
        {centerLabel ? (
          <text x={r} y={r + size * 0.16} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", fill: "var(--text-4)" }}>{centerLabel.toUpperCase()}</text>
        ) : null}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
              <span className="truncate text-[var(--text-2)]">{s.label}</span>
            </span>
            <span className="tabular-nums text-[var(--text-3)]" style={{ fontFamily: MONO, fontSize: 11 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
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
