/**
 * <DocumentCover/> — the single canonical cover used by:
 *   - Pulse internal A4 report (`/app/pulse/[scanId]/report`)
 *   - Pulse public share (`/report/[token]`)
 *   - Docs print page (`/app/docs/[id]/print`)
 *   - Docs public share (`/docs/[token]`)
 *
 * Anatomy (top to bottom):
 *
 *   ┌──────────────────────────────────────────────────────┐  ← Blue gradient hero
 *   │  FOUNDRY // PROPOSAL                    [rightSlot]  │
 *   │                                                      │
 *   │  Big editorial title in DM Serif Display.            │
 *   │                                                      │
 *   │  v1.0  ·  PROJECT NAME                               │
 *   │  CLIENT: Acme  ·  PREPARED BY: Dan                   │
 *   └──────────────────────────────────────────────────────┘
 *
 *   [logo]                                                    ← white content
 *
 *   Executive summary paragraph.
 *
 *   ┌──────────┬──────────┬──────────┬──────────┐
 *   │  84 PASS │  12 WARN │  03 FAIL │  £45k    │
 *   └──────────┴──────────┴──────────┴──────────┘
 *
 *   Confidentiality callout.
 *
 *   ──────────────────────────────── 29 May 2026  ← footer
 *
 * Uses inline styles intentionally — the component is rendered inside print pages where
 * Tailwind utility classes can be unreliable at PDF time. CSS variables are still consulted
 * for brand colour so light/dark mode toggles cascade through.
 */

import type { ReactNode } from "react";
import { InlineTextArea } from "@/lib/sections/inline-text";

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
  /** Visual anchor on the right side of the header (e.g. Pulse score ring, Docs version chip). */
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
  /**
   * Optional watermark text rendered as a large rotated overlay (e.g. "DRAFT",
   * "OUT FOR SIGNATURE", "DECLINED"). Tone controls the colour. Tone defaults to neutral grey.
   * Provide an empty string / undefined to suppress.
   */
  watermark?: string;
  watermarkTone?: "neutral" | "warning" | "danger";
  /**
   * Co-brand lockup: when set (cover lockup = "Client × Gitwork"), the white-section logo row
   * shows the client alongside the Foundry mark — client logo if a URL is given, else the name.
   */
  coBrand?: { clientName?: string; clientLogoUrl?: string };
  /**
   * Hero treatment. `bold` is the legacy full-bleed blue gradient (default, so Pulse and any
   * other direct caller are unchanged). `light` is the editorial default for Docs — ink title on
   * a warm canvas with blue used only as a thin accent. `minimal` is the barest variant.
   */
  coverStyle?: "light" | "minimal" | "bold";
  /** Optional banner image shown across the top of light/minimal covers. */
  heroImage?: string;
  /** Editor-only: when set, the title renders as an inline editable field on the canvas. */
  onTitleChange?: (next: string) => void;
  /** Editor-only: when set, the subtitle renders as an inline editable field on the canvas. */
  onSubtitleChange?: (next: string) => void;
}

const TONE_PALETTE: Record<NonNullable<DocumentCoverCallout["tone"]>, { border: string; text: string }> = {
  blue:    { border: "#1D4ED8", text: "#1D4ED8" },
  amber:   { border: "#D97706", text: "#92400E" },
  neutral: { border: "#475569", text: "#475569" },
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
  watermark,
  watermarkTone = "neutral",
  coBrand,
  coverStyle = "bold",
  heroImage,
  onTitleChange,
  onSubtitleChange,
}: DocumentCoverProps) {
  const isPrint = variant === "print";
  const callTone = callout ? TONE_PALETTE[callout.tone ?? "neutral"] : null;
  const watermarkAlpha = watermarkTone === "danger" ? "0.13" : watermarkTone === "warning" ? "0.14" : "0.10";

  const mono = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
  const serif = "var(--font-display), 'DM Serif Display', 'Times New Roman', Georgia, serif";

  // ── Theme: `bold` keeps the legacy blue gradient hero; `light`/`minimal` are editorial covers
  // on a light field with ink type and blue used only as a thin accent (per DESIGN.md). ──
  const isBold = coverStyle === "bold";
  const isMinimal = coverStyle === "minimal";
  const hero = {
    background: isBold
      ? "linear-gradient(140deg, #1D4ED8 0%, #1E3A8A 100%)"
      : isMinimal
        ? "#FFFFFF"
        : "#FAFAF9",
    minHeight: isBold ? (isPrint ? "44vh" : 220) : undefined,
    eyebrow: isBold ? "rgba(255,255,255,0.55)" : "#1D4ED8",
    title: isBold ? "white" : "#0F172A",
    subtitle: isBold ? "rgba(255,255,255,0.60)" : "#475569",
    metaLabel: isBold ? "rgba(255,255,255,0.50)" : "#64748B",
    metaValue: isBold ? "rgba(255,255,255,0.90)" : "#0F172A",
    // The single accent rule under the header on light covers; minimal uses a hairline.
    rule: isBold ? null : isMinimal ? "rgba(0,0,0,0.10)" : "#1D4ED8",
    watermarkColor: isBold
      ? `rgba(255,255,255,${watermarkAlpha})`
      : `rgba(15,23,42,${watermarkTone === "neutral" ? "0.05" : watermarkAlpha})`,
  };

  return (
    <section
      className={isPrint ? "document-cover document-cover-print" : "document-cover"}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "white",
        minHeight: isPrint ? "100vh" : undefined,
        breakAfter: isPrint ? "page" : undefined,
        pageBreakAfter: isPrint ? "always" : undefined,
        overflow: "hidden",
      }}
    >
      {/* ── Hero (bold = blue gradient · light/minimal = editorial light field) ── */}
      <div
        style={{
          position: "relative",
          background: hero.background,
          padding: isBold
            ? isPrint
              ? "52px 60px 56px"
              : "36px 44px 44px"
            : isPrint
              ? "56px 60px 24px"
              : "32px 44px 20px",
          minHeight: hero.minHeight,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
        }}
      >
        {/* Optional top banner image (light/minimal only) */}
        {!isBold && heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            style={{
              width: "100%",
              height: isPrint ? 180 : 120,
              objectFit: "cover",
              borderRadius: 10,
              marginBottom: 28,
              display: "block",
            }}
          />
        ) : null}

        {/* Subtle geometric accents — only on the bold blue hero */}
        {isBold ? (
          <>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -80,
                right: -80,
                width: 340,
                height: 340,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.10)",
                pointerEvents: "none",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -30,
                right: -30,
                width: 200,
                height: 200,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.08)",
                pointerEvents: "none",
              }}
            />
          </>
        ) : null}

        {/* Watermark */}
        {watermark ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-28deg)",
              pointerEvents: "none",
              zIndex: 0,
              fontFamily: mono,
              fontWeight: 800,
              fontSize: isPrint ? "7vw" : 72,
              letterSpacing: "0.25em",
              whiteSpace: "nowrap",
              color: hero.watermarkColor,
              userSelect: "none",
            }}
          >
            {watermark}
          </div>
        ) : null}

        {/* Content (above watermark) */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Eyebrow + right slot */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 36,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: hero.eyebrow,
              }}
            >
              {eyebrow}
            </p>
            {rightSlot ? (
              <div style={{ flexShrink: 0, marginLeft: 24 }}>{rightSlot}</div>
            ) : null}
          </div>

          {/* Title — inline-editable on the canvas when onTitleChange is provided. */}
          {onTitleChange ? (
            <div style={{ maxWidth: "80%" }}>
              <InlineTextArea
                value={title}
                onChange={onTitleChange}
                placeholder="Document title"
                ariaLabel="Document title"
                style={{
                  fontFamily: serif,
                  fontSize: isPrint ? 54 : 40,
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.08,
                  color: hero.title,
                }}
              />
            </div>
          ) : (
            <h1
              style={{
                margin: 0,
                fontFamily: serif,
                fontSize: isPrint ? 54 : 40,
                fontWeight: 400,
                letterSpacing: "-0.025em",
                lineHeight: 1.08,
                color: hero.title,
                maxWidth: "80%",
              }}
            >
              {title}
            </h1>
          )}

          {/* Subtitle + meta */}
          {(subtitle || onSubtitleChange || (meta && meta.length)) ? (
            <div style={{ marginTop: 22 }}>
              {onSubtitleChange ? (
                <div style={{ marginBottom: 10, maxWidth: "80%" }}>
                  <InlineTextArea
                    value={subtitle ?? ""}
                    onChange={onSubtitleChange}
                    placeholder="Subtitle / version"
                    ariaLabel="Subtitle"
                    style={{ fontSize: 14, lineHeight: 1.5, color: hero.subtitle }}
                  />
                </div>
              ) : subtitle ? (
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: hero.subtitle,
                  }}
                >
                  {subtitle}
                </p>
              ) : null}
              {meta && meta.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                  {meta.map((row) => (
                    <span
                      key={row.label}
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: hero.metaLabel,
                      }}
                    >
                      {row.label}:{" "}
                      <span style={{ color: hero.metaValue, fontWeight: 600 }}>
                        {row.value}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Accent rule — light covers' single stroke of blue; minimal uses a hairline. */}
          {hero.rule ? (
            <div
              aria-hidden="true"
              style={{
                marginTop: 24,
                height: isMinimal ? 1 : 3,
                width: isMinimal ? "100%" : 64,
                borderRadius: 2,
                background: hero.rule,
              }}
            />
          ) : null}
        </div>
      </div>

      {/* ── White content section ───────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: isPrint ? "36px 60px 40px" : "28px 44px 28px",
          background: "white",
        }}
      >
        {/* Logo — anchors the brand in the white section. With a co-brand, lock it up with the client. */}
        <div
          style={{
            marginBottom: executiveSummary || stats?.length ? 28 : 0,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Foundry by Gitwork"
            style={{ height: 22, objectFit: "contain", display: "block" }}
          />
          {coBrand?.clientName || coBrand?.clientLogoUrl ? (
            <>
              <span aria-hidden="true" style={{ fontFamily: mono, fontSize: 15, fontWeight: 400, color: "#CBD5E1" }}>
                ×
              </span>
              {coBrand.clientLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coBrand.clientLogoUrl}
                  alt={coBrand.clientName ?? "Client"}
                  style={{ height: 22, objectFit: "contain", display: "block" }}
                />
              ) : (
                <span style={{ fontFamily: serif, fontSize: 20, fontWeight: 400, letterSpacing: "-0.01em", color: "#0F172A" }}>
                  {coBrand.clientName}
                </span>
              )}
            </>
          ) : null}
        </div>

        {/* Executive summary */}
        {executiveSummary ? (
          <div style={{ marginBottom: stats?.length ? 28 : 0 }}>
            <p
              style={{
                margin: "0 0 10px",
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "#9CA3AF",
              }}
            >
              Executive summary
            </p>
            {executiveSummary
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, idx) => (
                <p
                  key={idx}
                  style={{
                    margin: idx === 0 ? 0 : "12px 0 0",
                    fontSize: 14,
                    lineHeight: 1.80,
                    color: "#374151",
                    maxWidth: "70ch",
                  }}
                >
                  {para}
                </p>
              ))}
          </div>
        ) : null}

        {/* Stats strip. Auto-fit grid (4-up on a wide page, wraps to 2-up in the narrow live
            preview) with min-0 cells so a long currency value never overflows / clips. The 1px
            gap over a hairline background paints the dividers. */}
        {stats && stats.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
              gap: 1,
              marginBottom: callout ? 24 : 0,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(0,0,0,0.08)",
            }}
          >
            {stats.map((stat, i) => (
              <div
                key={`${stat.label}-${i}`}
                style={{
                  textAlign: "center",
                  padding: "16px 10px",
                  background: stat.bg ?? "#FAFAF9",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: serif,
                    fontSize: 28,
                    fontWeight: 400,
                    color: stat.color ?? "#0F172A",
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                    overflowWrap: "break-word",
                  }}
                >
                  {stat.count}
                </div>
                <div
                  style={{
                    fontFamily: mono,
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

        {/* Confidentiality callout */}
        {callout && callTone ? (
          <div
            style={{
              marginTop: stats?.length ? 20 : 0,
              borderLeft: `3px solid ${callTone.border}`,
              paddingLeft: 18,
              fontSize: 13,
              fontStyle: "italic",
              color: callTone.text,
              lineHeight: 1.7,
              maxWidth: "70ch",
            }}
          >
            {callout.text}
          </div>
        ) : null}

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 24,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: mono,
              fontSize: 11,
              color: "#94A3B8",
            }}
          >
            {dated}
          </span>
        </div>
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
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="9" />
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
        fill="white"
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
        fill="rgba(255,255,255,0.55)"
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
 * Convenience: Docs-style version chip (used as right-slot on Docs covers).
 * Renders white text so it sits cleanly on the blue gradient hero.
 */
export function DocumentVersionChip({
  version,
  status,
  documentNumber,
  tone = "light",
}: {
  version: string;
  status: string;
  documentNumber?: string | null;
  /** `light` = white text for the bold blue hero; `dark` = ink text for light/minimal covers. */
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
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
            color: isDark ? "#1D4ED8" : "rgba(147,197,253,1)",
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
          color: isDark ? "#0F172A" : "white",
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
          color: isDark ? "#64748B" : "rgba(255,255,255,0.55)",
        }}
      >
        {status}
      </span>
    </div>
  );
}
