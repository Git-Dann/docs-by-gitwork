/**
 * <DocumentCover/> — the single canonical cover used by:
 *   - Pulse internal A4 report (`/app/pulse/[scanId]/report`)
 *   - Pulse public share (`/report/[token]`)
 *   - Docs print page (`/app/docs/[id]/print`)
 *   - Docs public share (`/docs/[token]`)
 *
 * Anatomy (top to bottom):
 *
 *   ┌──────────────────────────────────────────────────────┐  ← Hero: blue gradient (Pulse) or
 *   │  FOUNDRY // PROPOSAL                    [rightSlot]  │    Gitwork navy (Docs, boldPalette="navy")
 *   │                                                      │
 *   │  Big editorial title in DM Serif Display or Fraunces.│
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

import type { CSSProperties, ReactNode } from "react";
import { blendOver } from "@/lib/blend-over";
import { InlineEditableText, InlineTextArea } from "@/lib/sections/inline-text";
import {
  coverStripMode,
  filterCoverParties,
  partyColumnCount,
  partyFallbackLabel,
} from "@/lib/sections/parties-text";

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

/**
 * One column of the Gitwork cover's parties row (contracts: NDA / MSA / SLA / DSA).
 * `label` overrides the auto `PARTY A` / `PARTY B` / … index label.
 */
export interface DocumentCoverParty {
  label?: string;
  name: string;
  /** Supporting lines under the name — organisation, role, email. Rendered one per line. */
  lines?: string[];
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
  /** Path to the cover logo. Defaults to `/foundry-logo.svg`; swap to `/gitwork-logo-home-page.png`
   *  for a Gitwork-branded cover (see LogoQuickSwap in cover-editor.tsx / settings-panel.tsx). */
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
  /**
   * `bold`'s hero colour + display font. `blue` (default) is the legacy Pulse look — untouched.
   * `navy` is Gitwork's actual brand hero (Dark Navy + Fraunces + a purple accent bar) — Docs'
   * cover.tsx always passes this; nothing else needs to opt in.
   */
  boldPalette?: "blue" | "navy";
  /** Optional banner image shown across the top of light/minimal covers. */
  heroImage?: string;
  /** Editor-only: when set, the title renders as an inline editable field on the canvas. */
  onTitleChange?: (next: string) => void;
  /** Editor-only: when set, the subtitle renders as an inline editable field on the canvas. */
  onSubtitleChange?: (next: string) => void;
  /** Statement cover (light/minimal): the mono classification stack top-right (e.g.
   *  ["FINANCIAL REVIEW", "PREPARED 1 JULY 2026", "CONFIDENTIAL"]). */
  classification?: string[];
  /** Statement cover (light/minimal): the company footer strip — left + right mono caps lines. */
  companyFooter?: { left?: string[]; right?: string[] };
  /**
   * Gitwork cover only: the bordered `COVERS  ·  a  ·  b  ·  c` strip — a one-line scope readout
   * ("what this document covers"). Omitted entirely when absent/empty.
   */
  covers?: string[];
  /**
   * The parties bound by the document (contracts). When present, the cover's ONE bottom strip
   * renders party columns INSTEAD of the `meta` grid, and the executive summary / stat tiles are
   * dropped — a contract front page leads with who is bound, not with delivery metrics. Layout
   * scales with the count: 2 → 2-up, 3 → 3-up, 4 → 2×2, 5 → 3+2 (see `CoverBottomStrip`).
   * Both document themes honour it; there is no `documentType` in the decision.
   */
  parties?: DocumentCoverParty[];
  /**
   * Document theme for the statement cover. `"foundry"` (default) → warm cream + periwinkle +
   * DM-Serif. `"gitwork"` → the brand-guide look: a FULL NAVY cover with a round "G." mark,
   * Fraunces cream title + purple periods, and Inter labels. Matches the Gitwork PDFs.
   */
  docTheme?: "foundry" | "gitwork";
}

const TONE_PALETTE: Record<NonNullable<DocumentCoverCallout["tone"]>, { border: string; text: string }> = {
  blue:    { border: "#1D4ED8", text: "#1D4ED8" },
  amber:   { border: "#D97706", text: "#92400E" },
  neutral: { border: "#475569", text: "#475569" },
};

/**
 * The Gitwork round "G." mark — a cream circle with a navy Fraunces "G" and a purple period.
 * Pure inline (no asset). Used on the Gitwork cover + the navy running-header bar.
 */
export function GitworkMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-label="Gitwork"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#F2EDE4",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
          fontSize: Math.round(size * 0.5),
          fontWeight: 700,
          lineHeight: 1,
          color: "#0C0C18",
          transform: "translateY(-1px)",
        }}
      >
        G<span style={{ color: "#6B52FF" }}>.</span>
      </span>
    </span>
  );
}

/** Faces + palette the bottom strip inherits from whichever cover renders it. */
interface CoverStripSkin {
  mono: string;
  serif: string;
  sans: string;
  /** DM Serif Display ships one weight — forcing 600 there only synthesises a smeared faux-bold. */
  serifWeight: number;
  ink: string;
  muted: string;
  accent: string;
  line: string;
}

/**
 * The cover's ONE bottom region, in two data-driven modes.
 *
 * The cover used to carry two competing bottom blocks — a party columns row and a
 * `Prepared for / Prepared by / Date / Valid until` meta grid — with an ad-hoc rule deciding which
 * appeared, and only on the Gitwork theme (a Foundry-themed NDA printed neither). Now there is one
 * frame, one label scale, one hairline treatment and one spacing rhythm, so a proposal cover and an
 * NDA cover read as the same system, and the mode is chosen by `coverStripMode` from the DATA:
 *
 *   · has parties → the party columns (a contract leads with who is bound)
 *   · otherwise   → the meta grid
 *   · neither     → nothing at all, rather than an empty framed box
 *
 * There is deliberately **no `documentType` anywhere in this decision**: an NDA gets columns because
 * it HAS parties, and adding a parties block to a proposal switches its cover over automatically.
 *
 * Party columns scale by count (`partyColumnCount`): 2 → 2-up, 3 → 3-up, **4 → 2×2** (not a ragged
 * 3+1), 5 → 3+2, never more than 3 across — a 4th column on A4 crushes a registered-office line.
 * The first column of each row carries no divider, so a wrapped 4th/5th party reads as a new row.
 */
function CoverBottomStrip({
  parties,
  meta,
  skin,
}: {
  parties?: DocumentCoverParty[];
  meta?: DocumentCoverMeta[];
  skin: CoverStripSkin;
}) {
  const mode = coverStripMode({ parties, meta });
  if (!mode) return null;

  const label: CSSProperties = {
    fontFamily: skin.mono,
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: skin.accent,
    marginBottom: 10,
  };
  const frame: CSSProperties = {
    position: "relative",
    zIndex: 1,
    marginTop: 26,
    borderTop: `1px solid ${skin.line}`,
    borderBottom: `1px solid ${skin.line}`,
    padding: "22px 0",
    display: "grid",
    columnGap: 18,
    rowGap: 22,
  };

  if (mode === "meta") {
    const rows = meta ?? [];
    return (
      <div style={{ ...frame, gridTemplateColumns: `repeat(${Math.min(rows.length, 4)}, minmax(0, 1fr))` }}>
        {rows.map((row) => (
          <div key={row.label} style={{ minWidth: 0 }}>
            <div style={label}>{row.label}</div>
            {/* A date / version / owner is a data readout, so it stays mono per the type system. */}
            <div
              style={{
                fontFamily: skin.mono,
                fontSize: 12.5,
                fontWeight: 500,
                color: skin.ink,
                lineHeight: 1.45,
                overflowWrap: "anywhere",
              }}
            >
              {row.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const list = filterCoverParties(parties ?? []);
  const cols = partyColumnCount(list.length);
  return (
    <div style={{ ...frame, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {list.map((party, index) => {
        const divided = index % cols !== 0;
        return (
          <div
            key={`${party.name}-${index}`}
            style={{
              minWidth: 0,
              paddingLeft: divided ? 18 : 0,
              borderLeft: divided ? `1px solid ${skin.line}` : undefined,
            }}
          >
            <div style={label}>{party.label?.trim() || partyFallbackLabel(index)}</div>
            {/* A party name is a heading, so it is the display serif per the type system. */}
            <div
              style={{
                fontFamily: skin.serif,
                fontSize: 18,
                fontWeight: skin.serifWeight,
                lineHeight: 1.25,
                color: skin.ink,
                overflowWrap: "anywhere",
              }}
            >
              {party.name}
            </div>
            {(party.lines ?? [])
              .map((row) => (row ?? "").trim())
              .filter(Boolean)
              .map((row, i) => (
                <div
                  key={i}
                  style={{
                    marginTop: i === 0 ? 8 : 2,
                    fontFamily: skin.sans,
                    fontSize: 11.5,
                    lineHeight: 1.6,
                    color: skin.muted,
                    overflowWrap: "anywhere",
                  }}
                >
                  {row}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

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
  logoUrl = "/foundry-logo.svg",
  variant = "print",
  watermark,
  watermarkTone = "neutral",
  coBrand,
  coverStyle = "bold",
  boldPalette = "blue",
  heroImage,
  onTitleChange,
  onSubtitleChange,
  classification,
  companyFooter,
  covers,
  parties,
  docTheme = "gitwork",
}: DocumentCoverProps) {
  const isPrint = variant === "print";
  const isGitwork = docTheme === "gitwork";
  const callTone = callout ? TONE_PALETTE[callout.tone ?? "neutral"] : null;
  const watermarkAlpha = watermarkTone === "danger" ? "0.13" : watermarkTone === "warning" ? "0.14" : "0.10";

  const mono = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
  const serif = "var(--font-display), 'DM Serif Display', 'Times New Roman', Georgia, serif";

  // ── Statement cover (light / minimal) — THEME-AWARE, and the two themes render as two separate
  // layouts (shared palette consts, then an early return per theme):
  //   · Gitwork (the DEFAULT) — FULL NAVY page, mono `GITWORK.` wordmark, purple glow, Fraunces
  //     title + purple period, Inter subtitle, optional COVERS strip + parties row, square "G."
  //     footer tile. Matched to the brand reference PDF.
  //   · Foundry — the cream statement cover: logo + classification stack, accent eyebrow, DM Serif
  //     title, mono meta grid / summary / stat tiles / callout, letterhead footer.
  // Bold (Pulse) falls through to the legacy blue-gradient hero below and is untouched. ──
  if (coverStyle !== "bold") {
    const paper = isGitwork ? "#0C0C18" : "#F0EEE8"; // navy | cream
    const panel = isGitwork ? "#17172a" : "#F7F5EF";
    const ink = isGitwork ? "#F2EDE4" : "#1A1A17"; // cream | near-black
    const inkSoft = isGitwork ? "#C9C7D2" : "#4B4A44";
    const muted = isGitwork ? "#8E8CA0" : "#8A867C";
    const line = isGitwork ? "rgba(242,237,228,0.16)" : "rgba(0,0,0,0.12)";
    const accent = isGitwork ? "#6B52FF" : "#4F5BD5"; // purple | periwinkle
    // Strip a trailing period so we can render it in the accent colour.
    const cleanTitle = (title || "").replace(/\s*\.\s*$/, "");
    // Minimal = bare front page: logo + eyebrow + title (+ footer). Drops the meta grid,
    // executive summary, stat tiles and callout that the full "light" statement cover carries.
    const minimal = coverStyle === "minimal";
    const pad = isPrint ? "56px 60px 40px" : "34px 40px 32px";

    // ── Gitwork cover (the DEFAULT theme) — a full-bleed navy A4 front page matched to the brand
    // reference: mono `GITWORK.` wordmark + doc-number/date stack, a soft purple glow upper-right,
    // a big Fraunces title with a purple period, an Inter subtitle, an optional bordered COVERS
    // strip, an optional parties row (contracts), and a footer carrying the square "G." tile.
    // NOTE: the reference has no `CLIENT / DOC TYPE` eyebrow, so this cover drops it — the doc type
    // already sits in the top-right stack and the client in the parties row / meta grid.
    // Type follows the document type system: Fraunces display · Inter body · JetBrains Mono labels
    // (the `data-doc-theme="gitwork"` block in globals.css aliases --font-display to Fraunces and
    // deliberately leaves --font-mono alone). The faces are named explicitly here so the cover is
    // correct even when it renders outside `.proposal-document`.
    if (isGitwork) {
      const gMono = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
      const gSerif = "var(--font-fraunces), 'Fraunces', Georgia, serif";
      const gSans = "var(--font-sans), 'Inter', system-ui, sans-serif";
      const dot = "  ·  "; // NBSP-padded — plain spaces collapse in HTML.

      const coverItems = minimal ? [] : (covers ?? []).map((item) => item.trim()).filter(Boolean);
      // `minimal` is the bare front page — no strip in either mode.
      // Parties are EXEMPT from `minimal`. `minimal` is a bare front page — it drops the covers
      // strip, the exec summary and the stat tiles — but who is legally bound is not decoration,
      // and a contract cover that omits it is wrong rather than minimal.
      //
      // This one line is why "parties don't render on the cover" survived three fixes: it zeroed
      // the input BEFORE `coverStripMode` saw it, so every check downstream — the pure helpers,
      // the mode decision, the renderer — was correct and still produced nothing. Documents
      // created before `43506dd6` carry a stored `coverStyle: "minimal"`, and that commit removed
      // the Light/Minimal/Bold control, so they were stranded in it with no UI to change it back.
      const stripParties = parties ?? [];
      const stripMeta = minimal ? [] : (meta ?? []);
      const stripSkin: CoverStripSkin = {
        mono: gMono,
        serif: gSerif,
        sans: gSans,
        serifWeight: 700, // Fraunces is always 700 in the brand reference (63/63).
        ink,
        muted,
        accent,
        line,
      };
      // A contract cover leads with who is bound, not with delivery metrics: when the strip is in
      // parties mode it REPLACES the executive summary / stat tiles too (and keeps it to one sheet).
      const showMetaBlocks =
        coverStripMode({ parties: stripParties, meta: stripMeta }) !== "parties" && !minimal;

      const titleType = {
        fontFamily: gSerif,
        fontSize: isPrint ? 62 : 46,
        fontWeight: 700,
        // 1.06 clipped the descenders (the 'g' in "Agreement") — a display serif at this size needs
        // real leading, and the cover clips overflow to stay one A4 page, so there's nowhere for a
        // cropped tail to go. paddingBottom gives the last line's descender room too.
        lineHeight: 1.16,
        letterSpacing: "-1.5px",
        color: ink,
        paddingBottom: "0.12em",
      };
      const subtitleType = { fontFamily: gSans, fontSize: 14.5, lineHeight: 1.65, color: inkSoft };
      const showSubtitle = Boolean(onSubtitleChange) || Boolean((subtitle ?? "").trim());
      const footerRight = companyFooter?.right ?? (dated ? [dated] : []);
      const hasFooter =
        (companyFooter?.left?.length ?? 0) > 0 ||
        (companyFooter?.right?.length ?? 0) > 0 ||
        (!companyFooter && Boolean(dated));

      return (
        <section
          className={isPrint ? "document-cover document-cover-print" : "document-cover"}
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            background: paper,
            color: ink,
            // Pinned to exactly one A4 sheet — the two flexible spacers below absorb the slack, so
            // a dense cover (covers strip + 5 parties + footer) compresses instead of overflowing.
            minHeight: "297mm",
            breakAfter: isPrint ? "page" : undefined,
            pageBreakAfter: isPrint ? "always" : undefined,
            padding: pad,
            overflow: "hidden",
          }}
        >
          {/* Soft purple glow, upper-right. Sits behind every content wrapper (which are z-index 1). */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              // ⚠️ Fades to `rgba(107,82,255,0)` — the SAME colour at zero alpha — never to the
              // `transparent` keyword.
              //
              // `transparent` is `rgba(0,0,0,0)`: transparent BLACK. Fading purple → transparent
              // black means the mid-ramp colour depends on whether the renderer interpolates in
              // premultiplied space (what browsers do on screen) or not (Chrome's print/PDF
              // rasteriser). That is why the cover read blue-ish in Docs and noticeably more purple
              // in the exported PDF — same CSS, two different interpolations.
              //
              // With both endpoints on the same RGB, premultiplied and non-premultiplied
              // interpolation produce an identical ramp, so screen and PDF agree by construction.
              // NO ALPHA. The purple is pre-blended onto `paper`, so both stops are opaque.
              //
              // A CSS gradient containing alpha becomes a TRANSPARENCY GROUP WITH A SOFT MASK
              // when Chrome exports to PDF, and renderers disagree about compositing those. One
              // file, three renderers, observed live: Slack's server-generated channel thumbnail
              // was correct, the downloaded file was correct, and Slack's IN-APP viewer showed a
              // flat magenta wash over the whole cover. Nothing was wrong with the export.
              //
              // Matching both stops on one RGB (the previous fix) solves INTERPOLATION but not
              // this — the alpha is still there, so the mask is still there. Pre-blending removes
              // the alpha, which removes the mask, which removes the disagreement. An opaque
              // gradient is the one thing every renderer has to agree on.
              //
              // Derived from `paper` rather than hardcoded, so the two can never drift apart.
              background: `radial-gradient(circle at 75% 15%, ${blendOver([107, 82, 255], 0.28, paper)}, ${paper} 60%)`,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Watermark — light translucent cream. Dark ink is invisible on the navy field. */}
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
                fontFamily: gMono,
                fontWeight: 800,
                fontSize: isPrint ? "7vw" : 72,
                letterSpacing: "0.25em",
                whiteSpace: "nowrap",
                color: `rgba(242,237,228,${watermarkTone === "neutral" ? "0.07" : watermarkAlpha})`,
                userSelect: "none",
              }}
            >
              {watermark}
            </div>
          ) : null}

          {/* Top row — wordmark left, document number + date right (from `classification`). */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 24,
            }}
          >
            <span
              style={{
                fontFamily: gMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: accent,
                whiteSpace: "nowrap",
              }}
            >
              Gitwork<span style={{ color: accent }}>.</span>
            </span>
            {classification && classification.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right" }}>
                {classification.map((row, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: gMono,
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: muted,
                    }}
                  >
                    {row}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Breathing space above the title. Grows to fill the sheet; floors out on a dense cover. */}
          <div aria-hidden="true" style={{ flex: "1.4 1 auto", minHeight: isPrint ? 40 : 20 }} />

          {/* Accent bar + title + subtitle. */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div aria-hidden="true" style={{ width: 44, height: 3, background: accent, marginBottom: 22 }} />

            {/* Editing and read-only share ONE markup shape — an h1 whose last child is the accent
                period — so the dot hugs the final glyph (and follows the last word of a wrapped
                title) identically in the editor, the print page and the public share. It used to be
                a flex row with the field on one side: `InlineTextArea` is a textarea sized at 100%,
                so the sibling dot landed at the end of the FIELD, out by the right margin. */}
            <h1 style={{ margin: 0, ...titleType, maxWidth: "90%" }}>
              {onTitleChange ? (
                <InlineEditableText
                  value={title}
                  onChange={onTitleChange}
                  placeholder="Document title"
                  ariaLabel="Document title"
                />
              ) : (
                cleanTitle
              )}
              <span style={{ color: accent }}>.</span>
            </h1>

            {/* Rendered whenever there IS a subtitle — read-only and print covers showed none
                before, because the block was gated on the editor's onSubtitleChange handler. */}
            {showSubtitle ? (
              onSubtitleChange ? (
                <div style={{ marginTop: 18, maxWidth: "58ch" }}>
                  <InlineTextArea
                    value={subtitle ?? ""}
                    onChange={onSubtitleChange}
                    placeholder="Subtitle / summary line"
                    ariaLabel="Subtitle"
                    style={subtitleType}
                  />
                </div>
              ) : (
                <p style={{ margin: "18px 0 0", ...subtitleType, maxWidth: "58ch" }}>{subtitle}</p>
              )
            ) : null}
          </div>

          {/* Slack between the title block and the bottom stack. */}
          <div aria-hidden="true" style={{ flex: "1 1 auto", minHeight: isPrint ? 24 : 14 }} />

          {/* COVERS strip — purple-hairline box, one line of scope. */}
          {coverItems.length ? (
            <div
              style={{
                position: "relative",
                zIndex: 1,
                marginTop: 4,
                border: "1px solid rgba(107,82,255,0.55)",
                padding: "10px 14px",
                fontFamily: gMono,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                lineHeight: 1.6,
                color: inkSoft,
              }}
            >
              <span style={{ color: accent }}>Covers</span>
              {dot}
              {coverItems.join(dot)}
            </div>
          ) : null}

          {/* The ONE bottom strip — party columns when the document has parties, else the meta
              grid. Same frame, labels and spacing either way (see CoverBottomStrip). */}
          <CoverBottomStrip parties={stripParties} meta={stripMeta} skin={stripSkin} />

          {showMetaBlocks && executiveSummary ? (
            <div style={{ position: "relative", zIndex: 1, marginTop: 22, maxWidth: "70ch" }}>
              {executiveSummary
                .split(/\n{2,}/)
                .map((para) => para.trim())
                .filter(Boolean)
                .map((para, idx) => (
                  <p
                    key={idx}
                    style={{
                      margin: idx === 0 ? 0 : "10px 0 0",
                      fontFamily: gSans,
                      fontSize: 12.5,
                      lineHeight: 1.75,
                      color: inkSoft,
                    }}
                  >
                    {para}
                  </p>
                ))}
            </div>
          ) : null}

          {showMetaBlocks && stats && stats.length ? (
            <div
              style={{
                position: "relative",
                zIndex: 1,
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              {stats.map((stat, i) => (
                <div
                  key={`${stat.label}-${i}`}
                  style={{
                    borderRadius: 4,
                    padding: "14px 14px 16px",
                    background: panel,
                    border: `1px solid ${line}`,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: gMono,
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: muted,
                      marginBottom: 10,
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontFamily: gSerif,
                      fontSize: 26,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: stat.color && stat.color !== "#FFFFFF" ? stat.color : ink,
                      overflowWrap: "break-word",
                    }}
                  >
                    {stat.count}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!minimal && callout ? (
            <div
              style={{
                position: "relative",
                zIndex: 1,
                marginTop: 22,
                borderLeft: `3px solid ${accent}`,
                paddingLeft: 14,
                fontFamily: gSans,
                fontSize: 11.5,
                lineHeight: 1.7,
                color: muted,
                maxWidth: "70ch",
              }}
            >
              {callout.text}
            </div>
          ) : null}

          {/* Footer — square "G." tile left, the caller's mono lines right. Suppressed with the
              hairline when there's no letterhead at all (a de-branded / white-label cover). */}
          {hasFooter ? (
            <div style={{ position: "relative", zIndex: 1, marginTop: 28 }}>
              <div aria-hidden="true" style={{ height: 1, background: line, marginBottom: 16 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                {/* The CIRCULAR mark. This was an inlined rounded-square copy of `GitworkMark`,
                    which the gap analysis found disagrees with both references — the brand mark is
                    a disc. Using the shared component means there is now exactly one G. mark. */}
                <GitworkMark size={36} />
                {/* ONE line, dot-separated — not a stacked column.
                    Two mono lines stacked read as an address block and pull the eye down into the
                    page edge; the letterhead is one statement, so it sits on one line and uses the
                    reference's own ` · ` separator. `flexWrap` keeps it honest if a white-label
                    workspace supplies more lines than fit. */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    columnGap: 8,
                    rowGap: 2,
                    textAlign: "right",
                    minWidth: 0,
                  }}
                >
                  {footerRight.map((row, i) => (
                    <span
                      key={i}
                      style={{
                        fontFamily: gMono,
                        fontSize: 9.5,
                        fontWeight: 600,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: muted,
                      }}
                    >
                      {i > 0 ? <span aria-hidden="true" style={{ opacity: 0.5 }}>{"·  "}</span> : null}
                      {row}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      );
    }

    // ── Foundry statement cover (cream paper, periwinkle accent, DM Serif title, mono labels) ──
    const serif = "var(--font-display), 'DM Serif Display', 'Times New Roman', Georgia, serif";
    const mono = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
    const sans = "var(--font-sans), 'Inter', system-ui, sans-serif";

    // The SAME bottom strip the Gitwork cover uses — so a Foundry-themed NDA prints its parties
    // (it printed neither region before) and a proposal's meta grid reads as the same component.
    // Same exemption as the Gitwork cover above — a Foundry-themed NDA must print its parties
    // whatever cover style the document happens to carry.
    const fStripParties = parties ?? [];
    const fStripMeta = minimal ? [] : (meta ?? []);
    const fStripMode = coverStripMode({ parties: fStripParties, meta: fStripMeta });
    const fShowMetaBlocks = !minimal && fStripMode !== "parties";

    return (
      <section
        className={isPrint ? "document-cover document-cover-print" : "document-cover"}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          background: paper,
          color: ink,
          // Pin to one A4 sheet (paged/print). The presentation slide overrides this to full-bleed
          // via CSS on its wrapper.
          minHeight: "297mm",
          breakAfter: isPrint ? "page" : undefined,
          pageBreakAfter: isPrint ? "always" : undefined,
          padding: pad,
          overflow: "hidden",
        }}
      >
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
              color: `rgba(26,26,30,${watermarkTone === "neutral" ? "0.05" : watermarkAlpha})`,
              userSelect: "none",
            }}
          >
            {watermark}
          </div>
        ) : null}

        {/* Header — logo left, classification stack right. */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" style={{ height: 26, objectFit: "contain", display: "block" }} />
            </>
          ) : (
            <span aria-hidden />
          )}
          {classification && classification.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "right" }}>
              {classification.map((row, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: muted,
                  }}
                >
                  {row}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Rule under the header. */}
        <div aria-hidden="true" style={{ marginTop: 18, height: 1, background: line }} />

        {/* Eyebrow (accent) + short accent bar + title. */}
        <div style={{ position: "relative", zIndex: 1, marginTop: 30 }}>
          <div aria-hidden="true" style={{ width: 32, height: 2, background: accent, marginBottom: 14 }} />
          <p
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {eyebrow}
          </p>

          {/* One markup shape for edit + read-only, so the accent period hugs the last glyph of a
              wrapped title in both (see the Gitwork branch above for why the old flex row didn't). */}
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: serif,
              fontSize: isPrint ? 46 : 36,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.16,
              color: ink,
              maxWidth: "92%",
              paddingBottom: "0.12em",
            }}
          >
            {onTitleChange ? (
              <InlineEditableText
                value={title}
                onChange={onTitleChange}
                placeholder="Document title"
                ariaLabel="Document title"
              />
            ) : (
              cleanTitle
            )}
            <span style={{ color: accent }}>.</span>
          </h1>

          {onSubtitleChange ? (
            <div style={{ marginTop: 14, maxWidth: "80%" }}>
              <InlineTextArea
                value={subtitle ?? ""}
                onChange={onSubtitleChange}
                placeholder="Subtitle / version"
                ariaLabel="Subtitle"
                style={{ fontFamily: mono, fontSize: 12, lineHeight: 1.5, color: muted }}
              />
            </div>
          ) : null}
        </div>

        {/* The ONE bottom strip — party columns when the document has parties, else the meta grid. */}
        <CoverBottomStrip
          parties={fStripParties}
          meta={fStripMeta}
          skin={{
            mono,
            serif,
            sans,
            // DM Serif Display ships one weight; 600 here would only synthesise a faux-bold.
            serifWeight: 400,
            ink,
            muted,
            accent,
            line,
          }}
        />

        {/* Executive summary — mono body. */}
        {fShowMetaBlocks && executiveSummary ? (
          <div style={{ marginTop: 24, maxWidth: "80ch" }}>
            {executiveSummary
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, idx) => (
                <p
                  key={idx}
                  style={{
                    margin: idx === 0 ? 0 : "12px 0 0",
                    fontFamily: mono,
                    fontSize: 12.5,
                    lineHeight: 1.85,
                    color: inkSoft,
                  }}
                >
                  {para}
                </p>
              ))}
          </div>
        ) : null}

        {/* Stat tiles — rounded panels, one dark (via stat.bg). */}
        {fShowMetaBlocks && stats && stats.length ? (
          <div
            style={{
              marginTop: 28,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            {stats.map((stat, i) => {
              const dark = Boolean(stat.bg) && stat.bg !== "#FAFAF9";
              return (
                <div
                  key={`${stat.label}-${i}`}
                  style={{
                    borderRadius: 10,
                    padding: "16px 16px 18px",
                    background: dark ? stat.bg : panel,
                    border: dark ? "none" : `1px solid ${line}`,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: dark ? "rgba(255,255,255,0.6)" : muted,
                      marginBottom: 10,
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontFamily: serif,
                      fontSize: 28,
                      fontWeight: 400,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: stat.color ?? (dark ? "#FFFFFF" : ink),
                      overflowWrap: "break-word",
                    }}
                  >
                    {stat.count}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Confidentiality callout. */}
        {!minimal && callout ? (
          <div
            style={{
              marginTop: 24,
              borderLeft: `3px solid ${accent}`,
              paddingLeft: 16,
              fontFamily: mono,
              fontSize: 12,
              lineHeight: 1.7,
              color: inkSoft,
              maxWidth: "80ch",
            }}
          >
            {callout.text}
          </div>
        ) : null}

        {/* Footer — company strip (left) + dated/contact (right). Suppressed entirely when there's
            no letterhead (a de-branded / white-label cover), so no lonely hairline is left behind. */}
        {(companyFooter?.left?.length ?? 0) > 0 ||
        (companyFooter?.right?.length ?? 0) > 0 ||
        (!companyFooter && dated) ? (
        <div style={{ marginTop: "auto", paddingTop: 28 }}>
          <div aria-hidden="true" style={{ height: 1, background: line, marginBottom: 14 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              {(companyFooter?.left ?? []).map((row, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: mono,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: muted,
                  }}
                >
                  {row}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "right" }}>
              {(companyFooter?.right ?? [dated]).map((row, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: mono,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: muted,
                  }}
                >
                  {row}
                </span>
              ))}
            </div>
          </div>
        </div>
        ) : null}
      </section>
    );
  }

  // ── Bold hero — `blue` is the legacy gradient (Pulse; untouched). `navy` is Gitwork's actual
  // brand hero per the brand guide: Dark Navy, Fraunces, a purple accent bar. Docs' cover.tsx
  // always requests `navy`; nothing else needs to opt in, so Pulse never sees this branch move. ──
  const navy = boldPalette === "navy";
  // This branch isn't wrapped in its own block (the light/minimal branch above already
  // returned), so it shares scope with the module-level `serif` — can't shadow it here the way
  // that branch does; use a distinctly-named override instead for the navy hero only.
  const boldSerif = navy ? "var(--font-fraunces), 'Fraunces', Georgia, serif" : serif;
  const accent = "#6B52FF"; // Purple
  const isBold = true;
  const isMinimal = false;
  const hero = {
    background: navy
      ? "linear-gradient(160deg, #17172a 0%, #0C0C18 100%)"
      : "linear-gradient(140deg, #1D4ED8 0%, #1E3A8A 100%)",
    minHeight: isBold ? (isPrint ? "44vh" : 220) : undefined,
    eyebrow: "rgba(255,255,255,0.55)",
    title: "white",
    subtitle: "rgba(255,255,255,0.60)",
    metaLabel: "rgba(255,255,255,0.50)",
    metaValue: "rgba(255,255,255,0.90)",
    rule: null,
    watermarkColor: `rgba(255,255,255,${watermarkAlpha})`,
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

        {/* Subtle geometric accents — the legacy blue hero only; the navy brand hero reads
            cleaner flat per the brand guide reference. */}
        {isBold && !navy ? (
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

          {/* Purple accent bar — the brand guide's generic "accent element" motif. */}
          {navy ? (
            <div aria-hidden="true" style={{ width: 32, height: 2, background: accent, marginBottom: 18 }} />
          ) : null}

          {/* Title — inline-editable on the canvas when onTitleChange is provided. */}
          {onTitleChange ? (
            <div style={{ maxWidth: "80%" }}>
              <InlineTextArea
                value={title}
                onChange={onTitleChange}
                placeholder="Document title"
                ariaLabel="Document title"
                style={{
                  fontFamily: boldSerif,
                  fontSize: isPrint ? 54 : 40,
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.16,
                  color: hero.title,
                }}
              />
            </div>
          ) : (
            <h1
              style={{
                margin: 0,
                fontFamily: boldSerif,
                fontSize: isPrint ? 54 : 40,
                fontWeight: 400,
                letterSpacing: "-0.025em",
                lineHeight: 1.16,
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
                <span style={{ fontFamily: boldSerif, fontSize: 20, fontWeight: 400, letterSpacing: "-0.01em", color: "#0F172A" }}>
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
                    fontFamily: boldSerif,
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
  /** `light` = white text for the bold navy hero; `dark` = ink text for light/minimal covers. */
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
            color: isDark ? "#6B52FF" : "#C4B5FD",
          }}
        >
          {documentNumber}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', 'DM Serif Display', serif",
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
