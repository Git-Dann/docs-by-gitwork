/**
 * <DocumentCover/> — the single canonical cover used by:
 *   - Pulse internal A4 report (`/app/pulse/[scanId]/report`)
 *   - Pulse public share (`/report/[token]`)
 *   - Docs print page (`/app/proposals/[id]/print`)
 *   - Docs public share (`/docs/[token]`)
 *
 * Anatomy (top to bottom):
 *
 *   01 // EYEBROW                                                ┐ row 1
 *   Big editorial title.                                  [ring] │
 *   Optional subtitle line.                                       │
 *   META: value · META: value                                     ┘
 *
 *   ┌─────────┬─────────┬─────────┬─────────┐                    ┐ row 2 (stats)
 *   │ 84      │ 12      │ 03      │ 02      │                    │ optional
 *   │ PASS    │ WARN    │ FAIL    │ SKIP    │                    │
 *   └─────────┴─────────┴─────────┴─────────┘                    ┘
 *
 *   Executive summary paragraph, max 70ch wide.                   ┐ row 3
 *   Optional callout (left-bordered).                             ┘ optional
 *
 *   foundry-logo.png ────────────────── Dated 23 May 2026         ← footer (border-top)
 *
 * Uses inline styles intentionally — the component is rendered inside print pages where
 * Tailwind utility classes can be unreliable at PDF time. CSS variables are still consulted
 * for brand colour so light/dark mode toggles cascade through.
 */

import type { ReactNode } from "react";

export interface DocumentCoverStat {
  count: string | number;
  label: string;
  /** Text colour for the count (defaults to ink). */
  color?: string;
  /** Background tint for the cell (defaults to soft surface). */
  bg?: string;
}

export interface DocumentCoverMeta {
  label: string;
  value: string;
}

export interface DocumentCoverCallout {
  text: string;
  tone?: "blue" | "amber" | "neutral";
}

export interface DocumentCoverProps {
  /** `FOUNDRY // PROPOSAL`, `PULSE // PROJECT HEALTH REPORT`, etc. Always mono caps. */
  eyebrow: string;
  /** The big editorial title — DM Serif Display, 44–56px. */
  title: string;
  /** Optional secondary line under the title (URL, version, classification, etc.). */
  subtitle?: string;
  /** Mono key:value pairs rendered under the subtitle. */
  meta?: DocumentCoverMeta[];
  /** Visual anchor on the right side of the title row (e.g. Pulse score ring, Docs version chip). */
  rightSlot?: ReactNode;
  /** 4-up stat strip. Omitted when there are no relevant numbers to surface. */
  stats?: DocumentCoverStat[];
  /** Lead paragraph after the stats — usually an executive summary or document intro. */
  executiveSummary?: string;
  /** Optional left-bordered callout (Pulse uses this for the "proposalHook" line). */
  callout?: DocumentCoverCallout;
  /** Pre-formatted date string shown in the footer. */
  dated: string;
  /** Path to the Foundry logo. Defaults to `/foundry-logo.png`. */
  logoUrl?: string;
  /**
   * `print` produces a full-page A4 cover (min-height: 100vh, full padding, page-break-after).
   * `screen` is a more compact card for web preview.
   * Default: `print`.
   */
  variant?: "print" | "screen";
}

const TONE_PALETTE: Record<NonNullable<DocumentCoverCallout["tone"]>, { border: string; bg: string; text: string }> = {
  blue:    { border: "#1D4ED8", bg: "transparent",  text: "#1D4ED8" },
  amber:   { border: "#D97706", bg: "transparent",  text: "#92400E" },
  neutral: { border: "#475569", bg: "transparent",  text: "#475569" },
};

export function DocumentCover({
  eyebrow,
  title,
  subtitle,
  meta,
  rightSlot,
  stats,
  executiveSummary,
  callout,
  dated,
  logoUrl = "/foundry-logo.png",
  variant = "print",
}: DocumentCoverProps) {
  const isPrint = variant === "print";
  const callTone = callout ? TONE_PALETTE[callout.tone ?? "blue"] : null;

  return (
    <section
      className={isPrint ? "document-cover document-cover-print" : "document-cover"}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "white",
        padding: isPrint ? "56px 60px 40px" : "40px 40px 28px",
        minHeight: isPrint ? "100vh" : undefined,
        borderBottom: isPrint ? "none" : "1px solid rgba(0,0,0,0.08)",
        breakAfter: isPrint ? "page" : undefined,
        pageBreakAfter: isPrint ? "always" : undefined,
      }}
    >
      {/* ── Title row ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 32,
          marginBottom: stats?.length || executiveSummary || callout ? 32 : 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Eyebrow */}
          <p
            style={{
              margin: "0 0 14px 0",
              fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#9CA3AF",
            }}
          >
            {eyebrow}
          </p>

          {/* Title — DM Serif Display per DESIGN.md */}
          <h1
            style={{
              margin: 0,
              fontFamily:
                "var(--font-display), 'DM Serif Display', 'Times New Roman', Georgia, serif",
              fontSize: isPrint ? 44 : 40,
              fontWeight: 400,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              color: "#0F172A",
            }}
          >
            {title}
          </h1>

          {/* Subtitle */}
          {subtitle ? (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#9CA3AF", overflowWrap: "anywhere" }}>
              {subtitle}
            </p>
          ) : null}

          {/* Meta rows */}
          {meta && meta.length ? (
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 18 }}>
              {meta.map((row) => (
                <span
                  key={row.label}
                  style={{
                    fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#475569",
                  }}
                >
                  <span style={{ color: "#94A3B8" }}>{row.label}:</span>{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600 }}>{row.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right slot */}
        {rightSlot ? <div style={{ flexShrink: 0 }}>{rightSlot}</div> : null}
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      {stats && stats.length ? (
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: executiveSummary || callout ? 32 : 0,
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {stats.map((stat, i) => (
            <div
              key={`${stat.label}-${i}`}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "16px 8px",
                background: stat.bg ?? "#FAFAF9",
                borderRight: i < stats.length - 1 ? "1px solid rgba(0,0,0,0.08)" : "none",
              }}
            >
              <div
                style={{
                  fontFamily:
                    "var(--font-display), 'DM Serif Display', 'Times New Roman', Georgia, serif",
                  fontSize: 32,
                  fontWeight: 400,
                  color: stat.color ?? "#0F172A",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.count}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#94A3B8",
                  marginTop: 6,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Executive summary ──────────────────────────────────────────────── */}
      {executiveSummary || callout ? (
        <div style={{ flex: 1, maxWidth: "70ch" }}>
          {executiveSummary ? (
            <>
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#9CA3AF",
                }}
              >
                Executive summary
              </p>
              {executiveSummary
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, idx) => (
                  <p
                    key={idx}
                    style={{
                      margin: idx === 0 ? 0 : "14px 0 0",
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: "#374151",
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
            </>
          ) : null}

          {callout && callTone ? (
            <div
              style={{
                margin: executiveSummary ? "22px 0 0" : 0,
                borderLeft: `3px solid ${callTone.border}`,
                paddingLeft: 18,
                fontSize: 14,
                fontStyle: "italic",
                color: callTone.text,
                lineHeight: 1.7,
                background: callTone.bg,
              }}
            >
              {callout.text}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 24,
          borderTop: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt="Foundry by Gitwork"
          style={{ height: 26, objectFit: "contain", display: "block" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
            fontSize: 11,
            color: "#94A3B8",
          }}
        >
          {dated}
        </span>
      </div>
    </section>
  );
}

/**
 * Convenience: Pulse-style health score ring. Pulled out of the report file so other consumers
 * (e.g. dashboard widgets) can drop the same visual.
 */
export function HealthScoreRing({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 75 ? "#16A34A" : score >= 50 ? "#D97706" : "#DC2626";
  const label = score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 50 ? "Needs work" : "At risk";
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" style={{ display: "block" }}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="#E5E7EB" strokeWidth="9" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 66 66)"
      />
      <text
        x="66"
        y="61"
        textAnchor="middle"
        fontFamily="var(--font-display), 'DM Serif Display', serif"
        fontWeight="400"
        fontSize="32"
        fill={color}
      >
        {score}
      </text>
      <text
        x="66"
        y="77"
        textAnchor="middle"
        fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
        fontWeight="500"
        fontSize="10"
        fill="#94A3B8"
        letterSpacing="0.6"
      >
        /100
      </text>
      <text
        x="66"
        y="94"
        textAnchor="middle"
        fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
        fontWeight="600"
        fontSize="10"
        fill={color}
        letterSpacing="0.6"
      >
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

/**
 * Convenience: Docs-style version chip (used as right-slot on Docs covers). Shows the version
 * number in editorial serif with status caps underneath.
 */
export function DocumentVersionChip({
  version,
  status,
  documentNumber,
}: {
  version: string;
  status: string;
  documentNumber?: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
        textAlign: "right",
      }}
    >
      {documentNumber ? (
        <span
          style={{
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#1D4ED8",
          }}
        >
          {documentNumber}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: "var(--font-display), 'DM Serif Display', serif",
          fontSize: 44,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: "#0F172A",
        }}
      >
        {version}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#475569",
        }}
      >
        {status}
      </span>
    </div>
  );
}
