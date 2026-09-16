// Client-branded, paginated Brand Guidelines deck.
//
// Unlike the token INSPECTOR (design-system-viewer.tsx, Foundry widget chrome), this
// renders a polished, presentation-style document IN THE CLIENT'S OWN BRAND — brand
// colours, display/body fonts, a cover, per-section pages and a closing page — the
// deliverable a client actually reads (cf. wedge-brand-guidelines.pdf).
//
// Pure render, no hooks → usable in both the server public page and the client
// workspace. The narrative copy comes from generateGuidelinesContent(tokens); the
// styling comes from the tokens themselves. Each page carries `data-brand-page` so the
// PDF export (guidelines-pdf.ts) can snapshot pages individually.

import type { CSSProperties, ReactNode } from "react";
import { ensureContrast, isLightBackground, readableInk, rgba } from "@/lib/contrast";
import type { DesignTokens } from "@/types/design-tokens";
import { generateGuidelinesContent } from "@/lib/design-system/guidelines-content";
import { formatDate } from "@/lib/format";

const mono = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

// ── colour helpers (self-contained) ────────────────────────────────────────────



// ── page chrome ─────────────────────────────────────────────────────────────────

function Page({
  n,
  brandName,
  showFoundryBranding,
  style,
  ink,
  children,
}: {
  /** Footer page number; omit on the cover. */
  n?: number;
  brandName: string;
  showFoundryBranding: boolean;
  style?: CSSProperties;
  /** Text colour for the footer (derived from the page background). */
  ink: string;
  children: ReactNode;
}) {
  // Derived from the ink, not from a string compare against one specific white —
  // any other light ink silently took the dark-on-light branch.
  const faint = isLightBackground(ink) ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.6)";
  return (
    <div
      data-brand-page
      className="brand-page relative flex w-full flex-col overflow-hidden"
      style={{ aspectRatio: "297 / 210", ...style }}
    >
      <div className="flex flex-1 flex-col p-[6%]">{children}</div>
      {/* Running footer */}
      <div
        className="flex items-center justify-between px-[6%] pb-[3.5%] text-[10px] uppercase tracking-[0.14em]"
        style={{ fontFamily: mono, color: faint }}
      >
        <span>
          {brandName} · Brand Guidelines
        </span>
        <span className="flex items-center gap-3">
          {showFoundryBranding ? <span>Foundry</span> : null}
          {typeof n === "number" ? <span>{String(n).padStart(2, "0")}</span> : null}
        </span>
      </div>
    </div>
  );
}

/** Numbered section header, e.g. "01 — LOGO / The wordmark". */
function SectionHead({
  n,
  eyebrow,
  title,
  accent,
  display,
}: {
  n: number;
  eyebrow: string;
  title: string;
  accent: string;
  display: string;
}) {
  return (
    <div className="mb-[4%]">
      <p className="text-[11px] uppercase tracking-[0.2em]" style={{ fontFamily: mono, color: accent }}>
        {String(n).padStart(2, "0")} — {eyebrow}
      </p>
      <h2 className="mt-1 text-[28px] leading-tight" style={{ fontFamily: display }}>
        {title}
      </h2>
    </div>
  );
}

function Lead({ children, body }: { children: ReactNode; body: string }) {
  return (
    <p className="mb-[3%] max-w-[46ch] text-[14px] leading-relaxed opacity-80" style={{ fontFamily: body }}>
      {children}
    </p>
  );
}

// ── deck ─────────────────────────────────────────────────────────────────────────

const PAPER_BG = "#FBFBFA";

export function GuidelinesDeck({
  tokens,
  clientLogoUrl = null,
  showFoundryBranding = true,
}: {
  tokens: DesignTokens;
  clientLogoUrl?: string | null;
  showFoundryBranding?: boolean;
}) {
  const content = generateGuidelinesContent(tokens);
  const blurbs = content.sectionBlurbs;

  const primary = tokens.colours.primary[0]?.hex ?? "#0F172A";
  const coverInk = readableInk(primary);
  const display = `${tokens.typography.displayFont}, ${tokens.typography.systemFallback}`;
  const body = `${tokens.typography.bodyFont}, ${tokens.typography.systemFallback}`;
  const paperInk = "#141414";
  /**
   * The brand colour, adjusted until it reads on the paper pages.
   *
   * Used for OUR chrome only — section eyebrows and editorial labels. The brand
   * specimens below (the secondary button, the sample stat card, the swatches)
   * deliberately keep the raw colour: a guide that quietly darkens a client's own
   * palette to make itself look tidy is lying about the brand it documents. If
   * their outline button really is low-contrast, that is a finding for them, not
   * something for us to paper over.
   */
  const accentOnPaper = ensureContrast(primary, PAPER_BG);
  const defaultRadius = tokens.radius.md ?? tokens.radius.lg ?? Object.values(tokens.radius)[0] ?? "8px";

  const allColours = [
    ...tokens.colours.primary,
    ...tokens.colours.secondary,
    ...tokens.colours.neutrals,
  ];

  // Content sections, in reference order; each only when its data/blurb exists.
  const sections: Array<{ eyebrow: string; title: string; render: () => ReactNode }> = [];

  if (blurbs.logo || clientLogoUrl || content.logoRulesText.length) {
    sections.push({
      eyebrow: "LOGO",
      title: "The mark",
      render: () => (
        <>
          {blurbs.logo && <Lead body={body}>{blurbs.logo}</Lead>}
          <div className="flex flex-1 gap-[3%]">
            {clientLogoUrl && (
              <div className="flex w-[38%] flex-col gap-[4%]">
                <LogoTile logoUrl={clientLogoUrl} bg="#FFFFFF" label="On light" />
                <LogoTile logoUrl={clientLogoUrl} bg={primary} label="On brand" />
              </div>
            )}
            {content.logoRulesText.length > 0 && (
              <ul className="flex flex-1 flex-col justify-center gap-2">
                {content.logoRulesText.map((item, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed" style={{ fontFamily: body }}>
                    <span aria-hidden style={{ color: accentOnPaper }}>·</span>
                    <span className="opacity-80">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ),
    });
  }

  if (blurbs.colour) {
    sections.push({
      eyebrow: "COLOUR",
      title: "Palette",
      render: () => (
        <>
          <Lead body={body}>{blurbs.colour}</Lead>
          <div className="grid flex-1 grid-cols-4 gap-3 sm:grid-cols-5">
            {allColours.slice(0, 10).map((c, i) => (
              <div key={i} className="flex flex-col">
                <div className="w-full flex-1" style={{ background: c.hex, borderRadius: defaultRadius, minHeight: "42%", border: "1px solid rgba(0,0,0,0.08)" }} />
                <p className="mt-1.5 text-[11px] font-medium leading-tight" style={{ fontFamily: body }}>{c.name}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] opacity-60" style={{ fontFamily: mono }}>{c.hex}</p>
                {c.usage && <p className="mt-0.5 text-[10px] leading-tight opacity-55" style={{ fontFamily: body }}>{c.usage}</p>}
              </div>
            ))}
          </div>
        </>
      ),
    });
  }

  sections.push({
    eyebrow: "TYPOGRAPHY",
    title: "Type system",
    render: () => (
      <>
        <Lead body={body}>{blurbs.typography}</Lead>
        <div className="flex flex-1 flex-col justify-center gap-[4%]">
          <TypeSpecimen label={tokens.typography.displayFont} note="Headings & numbers" family={display} />
          <TypeSpecimen label={tokens.typography.bodyFont} note="Body copy & UI" family={body} />
          {tokens.typography.monoFont && (
            <TypeSpecimen label={tokens.typography.monoFont} note="Captions & code" family={mono} />
          )}
        </div>
      </>
    ),
  });

  sections.push({
    eyebrow: "GRID & SPACING",
    title: "Layout",
    render: () => (
      <>
        <Lead body={body}>{blurbs.gridSpacing}</Lead>
        <div className="flex flex-1 flex-wrap content-center items-end gap-3">
          {Object.entries(tokens.spacing.scale).slice(0, 8).map(([k, v]) => {
            const px = parseInt(v, 10) || 8;
            return (
              <div key={k} className="flex flex-col items-center gap-1">
                <div style={{ width: Math.min(px, 64), height: Math.min(px, 64), background: rgba(primary, 0.85), borderRadius: 3 }} />
                <span className="text-[10px] opacity-60" style={{ fontFamily: mono }}>{v}</span>
              </div>
            );
          })}
        </div>
      </>
    ),
  });

  if (blurbs.cornerRadius) {
    sections.push({
      eyebrow: "CORNER RADIUS",
      title: "Rounding",
      render: () => (
        <>
          <Lead body={body}>{blurbs.cornerRadius}</Lead>
          <div className="flex flex-1 flex-wrap content-center items-center gap-5">
            {Object.entries(tokens.radius).filter(([, v]) => !/^0/.test(v.trim())).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex flex-col items-center gap-1.5">
                <div style={{ width: 72, height: 72, background: rgba(primary, 0.12), border: `2px solid ${primary}`, borderRadius: v }} />
                <span className="text-[10px] uppercase tracking-[0.08em] opacity-60" style={{ fontFamily: mono }}>{k} · {v}</span>
              </div>
            ))}
          </div>
        </>
      ),
    });
  }

  if (blurbs.components) {
    sections.push({
      eyebrow: "UI COMPONENTS",
      title: "Components",
      render: () => (
        <>
          <Lead body={body}>{blurbs.components}</Lead>
          <div className="flex flex-1 items-center gap-5">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="px-5 py-2.5 text-[13px] uppercase tracking-[0.08em]"
                style={{ background: primary, color: coverInk, borderRadius: defaultRadius, fontFamily: display }}
              >
                {tokens.buttons[0]?.name ?? "Primary"}
              </button>
              <button
                type="button"
                className="px-5 py-2.5 text-[13px] uppercase tracking-[0.08em]"
                style={{ background: "transparent", color: primary, border: `1.5px solid ${primary}`, borderRadius: defaultRadius, fontFamily: display }}
              >
                {tokens.buttons[1]?.name ?? "Secondary"}
              </button>
            </div>
            <div
              className="flex w-[220px] flex-col gap-1 p-4"
              style={{ borderRadius: defaultRadius, background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 24px -12px rgba(0,0,0,0.3)" }}
            >
              <span className="text-[10px] uppercase tracking-[0.12em] opacity-50" style={{ fontFamily: mono }}>Card</span>
              <span className="text-[30px] leading-none" style={{ fontFamily: display, color: primary }}>18</span>
              <span className="text-[12px] opacity-60" style={{ fontFamily: body }}>Sample stat card</span>
            </div>
          </div>
        </>
      ),
    });
  }

  sections.push({
    eyebrow: "DO & DON'T",
    title: "Quick rules",
    render: () => (
      <div className="grid flex-1 grid-cols-2 gap-6">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: mono, color: accentOnPaper }}>Do</p>
          <ul className="flex flex-col gap-1.5">
            {content.dosAndDonts.dos.map((d, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed opacity-80" style={{ fontFamily: body }}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: mono, color: "#B4261A" }}>Don&apos;t</p>
          <ul className="flex flex-col gap-1.5">
            {content.dosAndDonts.donts.map((d, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed opacity-80" style={{ fontFamily: body }}>{d}</li>
            ))}
          </ul>
        </div>
      </div>
    ),
  });

  // Page numbering: cover unnumbered; contents = 02; sections continue; closing last.
  let pageNo = 1;
  const nextNo = () => (pageNo += 1);

  return (
    <div className="brand-guidelines-deck mx-auto flex w-full max-w-[960px] flex-col gap-5">
      {/* 01 — Cover */}
      <Page brandName={content.brandName} showFoundryBranding={showFoundryBranding} ink={coverInk} style={{ background: primary, color: coverInk }}>
        <div className="flex flex-1 flex-col justify-center">
          {clientLogoUrl && (
            <div className="mb-6 flex h-14 w-14 items-center justify-center overflow-hidden" style={{ borderRadius: 12, background: rgba(coverInk, 0.12) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clientLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          )}
          <p className="text-[11px] uppercase tracking-[0.28em] opacity-70" style={{ fontFamily: mono }}>Brand Guidelines</p>
          <h1 className="mt-2 text-[56px] leading-[0.98]" style={{ fontFamily: display }}>{content.brandName}</h1>
          {content.tagline && (
            <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed opacity-80" style={{ fontFamily: body }}>{content.tagline}</p>
          )}
          <p className="mt-8 text-[11px] uppercase tracking-[0.16em] opacity-60" style={{ fontFamily: mono }}>
            Version {tokens.version}
            {tokens.generatedAt ? ` · ${formatDate(tokens.generatedAt)}` : ""}
          </p>
        </div>
      </Page>

      {/* 02 — Overview + contents */}
      <Page n={nextNo()} brandName={content.brandName} showFoundryBranding={showFoundryBranding} ink={paperInk} style={{ background: PAPER_BG, color: paperInk }}>
        <SectionHead n={0} eyebrow="OVERVIEW" title="Contents" accent={accentOnPaper} display={display} />
        <Lead body={body}>{content.intro}</Lead>
        <ol className="grid flex-1 grid-cols-2 gap-x-8 gap-y-2 self-start">
          {sections.map((s, i) => (
            <li key={s.eyebrow} className="flex items-baseline gap-3 text-[13px]" style={{ fontFamily: body }}>
              <span className="text-[11px] opacity-50" style={{ fontFamily: mono }}>{String(i + 1).padStart(2, "0")}</span>
              <span className="font-medium">{s.eyebrow.charAt(0) + s.eyebrow.slice(1).toLowerCase()}</span>
            </li>
          ))}
        </ol>
      </Page>

      {/* Section pages */}
      {sections.map((s, i) => (
        <Page key={s.eyebrow} n={nextNo()} brandName={content.brandName} showFoundryBranding={showFoundryBranding} ink={paperInk} style={{ background: PAPER_BG, color: paperInk }}>
          <SectionHead n={i + 1} eyebrow={s.eyebrow} title={s.title} accent={accentOnPaper} display={display} />
          {s.render()}
        </Page>
      ))}

      {/* Closing */}
      <Page n={nextNo()} brandName={content.brandName} showFoundryBranding={showFoundryBranding} ink={coverInk} style={{ background: primary, color: coverInk }}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {content.tagline && (
            <p className="text-[34px] leading-tight" style={{ fontFamily: display }}>{content.tagline}</p>
          )}
          <p className="mt-4 text-[12px] uppercase tracking-[0.18em] opacity-70" style={{ fontFamily: mono }}>{content.closingLine}</p>
        </div>
      </Page>
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────────

function LogoTile({ logoUrl, bg, label }: { logoUrl: string; bg: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <div
        className="flex flex-1 items-center justify-center p-4"
        style={{ background: bg, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", minHeight: 90 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" style={{ maxWidth: "70%", maxHeight: 56, objectFit: "contain" }} />
      </div>
      <span className="text-[10px] uppercase tracking-[0.1em] opacity-55" style={{ fontFamily: mono }}>{label}</span>
    </div>
  );
}

function TypeSpecimen({ label, note, family }: { label: string; note: string; family: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/5 pb-3">
      <span className="text-[34px] leading-none" style={{ fontFamily: family }}>Aa Bb Cc 123</span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-medium" style={{ fontFamily: family }}>{label}</span>
        <span className="block text-[10px] uppercase tracking-[0.1em] opacity-55" style={{ fontFamily: mono }}>{note}</span>
      </span>
    </div>
  );
}
