"use client";

// Token-driven brand design system viewer.
//
// Renders a client's DesignTokens as a live, editorial design system inside
// Foundry's widget chrome (`NN // SECTION` headers). Brand-agnostic by design:
// every value comes from `tokens` — no hardcoded client colours/fonts. Shared by
// the internal Portal workspace and the public /brand/[token] page.

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { INK_LIGHT, readableInk, readableInkOnGradient, relativeLuminance, rgba } from "@/lib/contrast";
import type {
  ColourToken,
  DesignTokens,
  TypographyToken,
} from "@/types/design-tokens";
import { generateGuidelinesContent } from "@/lib/design-system/guidelines-content";
import { formatDate } from "@/lib/format";

// ── colour helpers ────────────────────────────────────────────────────────────


/** True when a ramp value is an actual colour (filters out prose keys like "source"). */
function isColour(v: string): boolean {
  return /^(#|rgb|hsl)/i.test((v || "").trim());
}

/** WCAG 2.1 contrast ratio between two hex colours. */
function wcagRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG level of the better contrast pairing (white or black text). */
function wcagLevel(hex: string): "AAA" | "AA" | "AA Large" | null {
  const best = Math.max(wcagRatio(hex, "#FFFFFF"), wcagRatio(hex, "#000000"));
  if (best >= 7) return "AAA";
  if (best >= 4.5) return "AA";
  if (best >= 3) return "AA Large";
  return null;
}

/**
 * Parse the `:root {}` CSS variables block and return a map of
 * lowercase hex → first matching CSS variable name (e.g. "#1d4ed8" → "--color-primary").
 */
function parseVarMap(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const key = m[2].toLowerCase();
    if (!map.has(key)) map.set(key, `--${m[1]}`);
  }
  return map;
}

const mono = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

// ── chrome primitives (Foundry widget grammar) ─────────────────────────────────

function Section({
  id,
  n,
  title,
  intro,
  status,
  children,
}: {
  id?: string;
  n: number;
  title: string;
  intro?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="widget-card scroll-mt-20">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">
            {String(n).padStart(2, "0")}
          </span>
          {` // ${title}`}
        </span>
        {status}
      </div>
      <div className="p-6">
        {intro && (
          <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-[var(--text-3)]">
            {intro}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
      {children}
    </p>
  );
}

/** Simple bulleted list of narrative guidance lines. */
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--text-2)]">
          <span aria-hidden className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--brand-600)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Two-column Do / Don't lists rendered from the generated guidelines content. */
function DosAndDontsSection({ content }: { content: { dos: string[]; donts: string[] } }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <GroupLabel>Do</GroupLabel>
        <BulletList items={content.dos} />
      </div>
      <div>
        <GroupLabel>Don&apos;t</GroupLabel>
        <BulletList items={content.donts} />
      </div>
    </div>
  );
}


// ── colours ────────────────────────────────────────────────────────────────────

function ColourChip({ c, varName }: { c: ColourToken; varName?: string }) {
  const [copiedSwatch, setCopiedSwatch] = useState(false);
  const [copiedVar, setCopiedVar] = useState(false);

  const veryLight = relativeLuminance(c.hex) > 0.9;
  const level = wcagLevel(c.hex);
  const fgOnSwatch = readableInk(c.hex);

  function copy(value: string, which: "swatch" | "var") {
    void navigator.clipboard.writeText(value).then(() => {
      if (which === "swatch") { setCopiedSwatch(true); setTimeout(() => setCopiedSwatch(false), 1400); }
      else { setCopiedVar(true); setTimeout(() => setCopiedVar(false), 1400); }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Swatch — click to copy hex */}
      <button
        type="button"
        onClick={() => copy(c.hex.toUpperCase(), "swatch")}
        className="relative w-full cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-600)]"
        style={{
          height: 56,
          background: c.hex,
          borderRadius: 8,
          border: veryLight ? "1px solid rgba(0,0,0,0.08)" : "none",
          display: "block",
        }}
        title={[
          c.name,
          c.hex.toUpperCase(),
          c.rgb && `RGB ${c.rgb}`,
          c.pantone && `PANTONE ${c.pantone}`,
          c.usage && `Usage: ${c.usage}`,
        ].filter(Boolean).join(" · ")}
      >
        {/* WCAG badge */}
        {level && (
          <span
            className="absolute bottom-1.5 right-1.5 rounded-[3px] px-1 py-px text-[8px] font-bold uppercase tracking-[0.04em]"
            style={{
              background: veryLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.18)",
              color: fgOnSwatch,
              fontFamily: mono,
            }}
          >
            {level}
          </span>
        )}
        {/* Copied flash */}
        {copiedSwatch && (
          <span
            className="absolute inset-0 flex items-center justify-center rounded-[8px] text-[10px] font-semibold"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
          >
            Copied ✓
          </span>
        )}
      </button>

      {/* Labels */}
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-[11px] font-medium text-[var(--text-2)]" title={c.name}>
          {c.name}
        </p>

        {/* CSS variable — click to copy var(--name) */}
        {varName && (
          <button
            type="button"
            onClick={() => copy(`var(${varName})`, "var")}
            className="block w-full truncate text-left text-[10px] text-[var(--brand-700)] transition hover:underline"
            style={{ fontFamily: mono }}
            title={`Copy var(${varName})`}
          >
            {copiedVar ? "Copied ✓" : varName}
          </button>
        )}

        {/* Hex */}
        <p className="truncate text-[10px] text-[var(--text-4)]" style={{ fontFamily: mono }}>
          {c.hex.toUpperCase()}
          {c.rgb && <span className="ml-1 opacity-60">{c.rgb}</span>}
        </p>
      </div>
    </div>
  );
}

function TintStrip({ colour }: { colour: ColourToken }) {
  const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-[var(--text-3)]">
        {colour.name} <span className="text-[var(--text-4)]">· 10% → 100%</span>
      </p>
      <div className="flex overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)]">
        {steps.map((a) => (
          <div
            key={a}
            title={`${Math.round(a * 100)}%`}
            style={{ flex: 1, height: 44, background: rgba(colour.hex, a) }}
          />
        ))}
      </div>
    </div>
  );
}

function ColoursSection({ tokens }: { tokens: DesignTokens }) {
  // Parse the :root {} block once to map hex values → CSS variable names
  const varMap = useMemo(() => parseVarMap(tokens.cssVariables ?? ""), [tokens.cssVariables]);

  const groups: Array<[string, ColourToken[]]> = [
    ["Primary", tokens.colours.primary],
    ["Secondary", tokens.colours.secondary],
    ["Neutrals", tokens.colours.neutrals],
  ];
  const accent = tokens.colours.primary[1] ?? tokens.colours.secondary[0] ?? null;
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label}>
            <GroupLabel>{label}</GroupLabel>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
            >
              {list.map((c, i) => (
                <ColourChip key={`${c.name}-${i}`} c={c} varName={varMap.get(c.hex.toLowerCase())} />
              ))}
            </div>
          </div>
        ),
      )}
      {(tokens.colours.primary[0] || accent) && (
        <div>
          <GroupLabel>Tints</GroupLabel>
          <div className="flex flex-col gap-3">
            {tokens.colours.primary[0] && <TintStrip colour={tokens.colours.primary[0]} />}
            {accent && <TintStrip colour={accent} />}
          </div>
        </div>
      )}
      {tokens.colourRamps && Object.keys(tokens.colourRamps).length > 0 && (
        <div>
          <GroupLabel>Tonal scales</GroupLabel>
          <div className="flex flex-col gap-3">
            {Object.entries(tokens.colourRamps).map(([name, ramp]) => {
              const stops = Object.entries(ramp).filter(([, v]) => isColour(v));
              if (!stops.length) return null;
              const first = stops[0][1];
              const last = stops[stops.length - 1][1];
              return (
                <div key={name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium capitalize text-[var(--text-2)]">{name}</p>
                    <p className="truncate text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                      {first} → {last}
                    </p>
                  </div>
                  <div className="flex overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)]">
                    {stops.map(([step, v]) => (
                      <div key={step} title={`${step} · ${v}`} style={{ flex: 1, height: 40, background: v }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── gradients ────────────────────────────────────────────────────────────────

function GradientsSection({ tokens }: { tokens: DesignTokens }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tokens.gradients.map((g, i) => (
        <div
          key={`${g.name}-${i}`}
          className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]"
        >
          <div style={{ height: 120, background: g.css }} />
          <div className="p-4">
            <p className="text-[13px] font-semibold text-[var(--text-1)]">{g.name}</p>
            {g.usage && <p className="mt-1 text-[12px] text-[var(--text-3)]">{g.usage}</p>}
            <p
              className="mt-2 break-all rounded-[6px] bg-[var(--surface-1)] px-2 py-1.5 text-[10px] text-[var(--text-2)]"
              style={{ fontFamily: mono }}
            >
              {g.css}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── typography ──────────────────────────────────────────────────────────────

function sampleFor(t: TypographyToken): string {
  if (t.sample) return t.sample;
  const r = t.role.toLowerCase();
  if (/(display|hero|h1|h2|title)/.test(r)) return "The quick brown fox";
  if (/(h3|h4|h5|heading|subtitle|lead|intro)/.test(r)) return "Heading and section titles";
  if (/(eyebrow|overline|label)/.test(r)) return "SECTION LABEL";
  if (/(caption|micro|small|footnote)/.test(r)) return "Caption / helper text";
  if (/(data|stat|metric|number|timestamp|code)/.test(r)) return "1,234 · 09:16";
  return "The quick brown fox jumps over the lazy dog.";
}

function TypographySection({ tokens }: { tokens: DesignTokens }) {
  const { displayFont, bodyFont, monoFont, systemFallback } = tokens.typography;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {[
          ["Display", displayFont],
          ["Body", bodyFont],
          ...(monoFont ? ([["Mono", monoFont]] as Array<[string, string]>) : []),
          ["Fallback", systemFallback],
        ].map(([k, v]) => (
          <span
            key={k}
            className="rounded-[6px] border border-[rgba(0,0,0,0.10)] px-2.5 py-1 text-[11px] text-[var(--text-3)]"
            style={{ fontFamily: mono }}
          >
            <span className="text-[var(--text-4)]">{k}</span> · {v}
          </span>
        ))}
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
        {tokens.typography.scale.map((t, i) => {
          const sizePx = parseFloat(t.fontSize) || 14;
          const isLarge = sizePx >= 32;
          return (
            <div
              key={`${t.role}-${i}`}
              className="grid items-baseline gap-5 border-b border-[rgba(0,0,0,0.06)] px-5 last:border-0"
              style={{ gridTemplateColumns: "210px 1fr", paddingTop: isLarge ? 20 : 14, paddingBottom: isLarge ? 20 : 14 }}
            >
              <div className="self-start pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-2)]">
                  {t.role}
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-4)]" style={{ fontFamily: mono }}>
                  {t.fontFamily} {t.fontWeight} · {t.fontSize}
                  {t.lineHeight ? ` · lh ${t.lineHeight}` : ""}
                  {t.letterSpacing ? ` · ls ${t.letterSpacing}` : ""}
                </p>
              </div>
              <p
                className="min-w-0 overflow-hidden text-[var(--text-1)]"
                style={{
                  fontFamily: `${t.fontFamily}, ${systemFallback}`,
                  fontSize: t.fontSize,
                  fontWeight: t.fontWeight,
                  lineHeight: Math.max(Number(t.lineHeight) || 1.2, 1.15),
                  letterSpacing: t.letterSpacing || undefined,
                  textTransform: (t.textTransform as CSSProperties["textTransform"]) || undefined,
                  margin: 0,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  display: "block",
                }}
              >
                {sampleFor(t)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── spacing & radius ──────────────────────────────────────────────────────────

function SpacingRadiusSection({ tokens }: { tokens: DesignTokens }) {
  const spacing = Object.entries(tokens.spacing.scale);
  const radius = Object.entries(tokens.radius);
  const px = (v: string) => {
    const m = /(-?\d+(\.\d+)?)/.exec(v);
    return m ? Math.min(parseFloat(m[1]), 180) : 0;
  };
  return (
    <div className="flex flex-col gap-8">
      <div>
        <GroupLabel>Spacing — {tokens.spacing.base}px base</GroupLabel>
        <div className="flex flex-col gap-2">
          {spacing.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {k}
              </span>
              <div
                style={{ height: 14, width: Math.max(px(v), 2), background: "var(--brand-600)", borderRadius: 3 }}
              />
              <span className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <GroupLabel>Radius</GroupLabel>
        <div className="flex flex-wrap items-end gap-6">
          {radius.map(([k, v]) => (
            <div key={k} className="text-center">
              <div
                style={{
                  width: 68,
                  height: 68,
                  background: "var(--surface-brand)",
                  border: "2px solid var(--brand-600)",
                  borderRadius: v,
                  margin: "0 auto 8px",
                }}
              />
              <p className="text-[10px] font-semibold text-[var(--text-2)]">{k}</p>
              <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────────

function ButtonsSection({
  tokens,
  darkSurface,
  gradientCss,
}: {
  tokens: DesignTokens;
  darkSurface: string;
  gradientCss: string;
}) {
  const renderBtn = (b: DesignTokens["buttons"][number], key: string) => (
    <button
      key={key}
      type="button"
      style={{
        background: b.background,
        color: b.textColour,
        border: b.border || "none",
        borderRadius: 8,
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "default",
      }}
    >
      {b.name}
    </button>
  );
  const onSurface = (surface: string) =>
    tokens.buttons.filter((b) => (b.surfaces.length ? b.surfaces.includes(surface) : surface === "light"));

  const surfaces: Array<{ key: string; label: string; bg: string; border?: string; labelColor: string }> = [
    { key: "light", label: "On light", bg: "var(--surface-raised,#fff)", border: "1px solid rgba(0,0,0,0.08)", labelColor: "var(--text-4)" },
    // "dark" and "gradient" are the client's own colours, so neither is reliably
    // dark: the darkest colour in a pale palette is still pale. Derive the label
    // ink rather than assuming white.
    {
      key: "dark",
      label: "On dark",
      bg: darkSurface,
      labelColor: readableInk(darkSurface) === INK_LIGHT ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
    },
    {
      key: "gradient",
      label: "On gradient",
      bg: gradientCss,
      labelColor:
        readableInkOnGradient(gradientCss, darkSurface) === INK_LIGHT
          ? "rgba(255,255,255,0.7)"
          : "rgba(0,0,0,0.7)",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {surfaces.map((s) => {
          const btns = onSurface(s.key);
          if (!btns.length) return null;
          return (
            <div key={s.key} className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
              <div
                style={{ background: s.bg, border: s.border, padding: 24, minHeight: 116 }}
                className="flex flex-1 flex-wrap content-start items-start gap-2.5"
              >
                {btns.map((b, i) => renderBtn(b, `${s.key}-${i}`))}
              </div>
              <p
                className="px-3.5 py-2 text-[10px] uppercase tracking-[0.08em]"
                style={{ fontFamily: mono, color: "var(--text-4)" }}
              >
                {s.label}
              </p>
            </div>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr style={{ background: darkSurface }}>
              {["Variant", "Background", "Text", "Border", "Surfaces", "Use"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.buttons.map((b, i) => (
              <tr key={`${b.name}-${i}`} className="text-[var(--text-2)]">
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2 font-medium text-[var(--text-1)]">{b.name}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2" style={{ fontFamily: mono }}>{b.background}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2" style={{ fontFamily: mono }}>{b.textColour}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2" style={{ fontFamily: mono }}>{b.border || "—"}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2">{b.surfaces.join(", ") || "—"}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-3 py-2 text-[var(--text-3)]">{b.usage || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── inputs ────────────────────────────────────────────────────────────────────

function InputsSection({ tokens, darkSurface }: { tokens: DesignTokens; darkSurface: string }) {
  const primary = tokens.colours.primary[0]?.hex ?? "#1D4ED8";
  const danger =
    [...tokens.colours.primary, ...tokens.colours.secondary, ...tokens.colours.neutrals].find((c) =>
      /(danger|error|red|alert)/i.test(`${c.name} ${c.role}`),
    )?.hex ?? "#DC2626";

  const states =
    tokens.inputs && tokens.inputs.length
      ? tokens.inputs
      : [
          { state: "default", border: "1.5px solid rgba(0,0,0,0.2)" },
          { state: "focus", border: `1.5px solid ${primary}`, ring: `0 0 0 3px ${rgba(primary, 0.18)}` },
          { state: "error", border: `1.5px solid ${danger}`, ring: `0 0 0 3px ${rgba(danger, 0.15)}` },
          { state: "disabled", border: "1.5px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.04)" },
        ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {states.map((s, i) => (
        <div key={`${s.state}-${i}`}>
          <p className="mb-1.5 text-[11px] font-medium capitalize text-[var(--text-2)]">{s.state}</p>
          <input
            readOnly
            placeholder={`${s.state} field`}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--text-1)",
              background: s.background || "#fff",
              border: s.border || "1.5px solid rgba(0,0,0,0.2)",
              boxShadow: s.ring || undefined,
              outline: "none",
              boxSizing: "border-box",
              opacity: /disabled/i.test(s.state) ? 0.6 : 1,
            }}
          />
          {s.note && <p className="mt-1 text-[11px] text-[var(--text-4)]">{s.note}</p>}
        </div>
      ))}
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-[11px] font-medium text-[var(--text-2)]">On dark surface</p>
        <div style={{ background: darkSurface, borderRadius: 10, padding: 16 }}>
          <input
            readOnly
            placeholder="On dark surface"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              padding: "0 14px",
              fontSize: 14,
              color: "#fff",
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── badges + empty state ────────────────────────────────────────────────────

function BadgesSection({ tokens }: { tokens: DesignTokens }) {
  const badges = tokens.badges ?? [];
  const groups = Array.from(new Set(badges.map((b) => b.group || "Badges")));
  return (
    <div className="flex flex-col gap-6">
      {badges.length > 0 &&
        groups.map((g) => (
          <div key={g}>
            <GroupLabel>{g}</GroupLabel>
            <div className="flex flex-wrap gap-2">
              {badges
                .filter((b) => (b.group || "Badges") === g)
                .map((b, i) => (
                  <span
                    key={`${b.label}-${i}`}
                    style={{
                      background: b.background,
                      color: b.textColour,
                      border: b.border || "none",
                      borderRadius: 9999,
                      padding: "4px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {b.label}
                  </span>
                ))}
            </div>
          </div>
        ))}

      {tokens.emptyState && (
        <div>
          <GroupLabel>Empty state</GroupLabel>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex gap-3">
              {[
                ["background", tokens.emptyState.background],
                ["stroke", tokens.emptyState.stroke],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ width: 60, height: 44, borderRadius: 8, background: v, border: "1px solid rgba(0,0,0,0.08)" }} />
                  <p className="mt-1 text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>{k}</p>
                </div>
              ))}
            </div>
            <div
              className="flex flex-1 items-center justify-center px-6 py-9 text-center"
              style={{
                minWidth: 240,
                borderRadius: 12,
                background: tokens.emptyState.background,
                border: `${tokens.emptyState.strokeWidth || "1.5px"} ${tokens.emptyState.strokeStyle || "dashed"} ${tokens.emptyState.stroke}`,
              }}
            >
              <p className="text-[13px] text-[var(--text-3)]">Nothing here yet</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── alerts ────────────────────────────────────────────────────────────────────

function AlertsSection({ tokens }: { tokens: DesignTokens }) {
  return (
    <div className="flex flex-col gap-2.5">
      {(tokens.alerts ?? []).map((a, i) => (
        <div
          key={`${a.name}-${i}`}
          style={{
            background: a.background,
            color: a.textColour,
            border: a.border || "none",
            borderRadius: 10,
            padding: "12px 16px",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ margin: 0 }}>{a.name}</p>
          {a.usage && <p className="text-[12px]" style={{ margin: "2px 0 0", opacity: 0.85 }}>{a.usage}</p>}
        </div>
      ))}
    </div>
  );
}

// ── shadows ────────────────────────────────────────────────────────────────────

function ShadowsSection({ tokens }: { tokens: DesignTokens }) {
  return (
    <div className="flex flex-wrap gap-6">
      {tokens.shadows.map((s, i) => (
        <div
          key={`${s.name}-${i}`}
          style={{ width: 220, padding: 20, background: "#fff", borderRadius: 12, boxShadow: s.css, border: "1px solid rgba(0,0,0,0.04)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-2)]">{s.name}</p>
          {s.usage && <p className="mt-1 text-[12px] text-[var(--text-3)]">{s.usage}</p>}
          <p className="mt-2 break-all text-[9px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>{s.css}</p>
        </div>
      ))}
    </div>
  );
}

// ── logo rules ────────────────────────────────────────────────────────────────

function LogoSection({
  tokens,
  clientLogoUrl,
  darkSurface,
}: {
  tokens: DesignTokens;
  clientLogoUrl?: string | null;
  darkSurface: string;
}) {
  const lr = tokens.logoRules;
  const assets = lr?.assets ?? [];
  // Prefer the brand's own lockups (from the skill); else preview the client's
  // uploaded logo on light + dark surfaces.
  const cards =
    assets.length > 0
      ? assets
      : clientLogoUrl
        ? [
            { label: "On light", src: clientLogoUrl, background: "light" as const },
            { label: "On dark", src: clientLogoUrl, background: "dark" as const },
          ]
        : [];
  return (
    <div className="flex flex-col gap-6">
      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((a, i) => (
            <div key={`${a.label}-${i}`} className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
              <div
                className="flex items-center justify-center"
                style={{ height: 132, padding: 28, background: a.background === "dark" ? darkSurface : "#fff" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.src} alt={a.label} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              </div>
              <p
                className="px-3.5 py-2 text-[10px] uppercase tracking-[0.08em]"
                style={{ fontFamily: mono, color: "var(--text-4)" }}
              >
                {a.label}
              </p>
            </div>
          ))}
        </div>
      )}
      {lr?.minSizes && Object.keys(lr.minSizes).length > 0 && (
        <div>
          <GroupLabel>Minimum sizes</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {Object.entries(lr.minSizes).map(([k, v]) => (
              <span
                key={k}
                className="rounded-[6px] border border-[rgba(0,0,0,0.10)] px-2.5 py-1 text-[11px]"
                style={{ fontFamily: mono, color: "var(--text-3)" }}
              >
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
      )}
      {lr?.colourRules && lr.colourRules.length > 0 && (
        <div>
          <GroupLabel>Colour on surface</GroupLabel>
          <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {lr.colourRules.map((r, i) => (
                  <tr key={i}>
                    <td className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2.5 text-[var(--text-2)] last:border-0">{r.surface}</td>
                    <td className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2.5 text-[var(--text-1)]">{r.logoVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {lr?.formats && Object.keys(lr.formats).length > 0 && (
        <div>
          <GroupLabel>Formats</GroupLabel>
          <div className="flex flex-col gap-1.5">
            {Object.entries(lr.formats).map(([k, v]) => (
              <p key={k} className="text-[12px]">
                <span className="font-medium text-[var(--text-2)]">{k}</span>
                <span className="text-[var(--text-3)]"> — {v}</span>
              </p>
            ))}
          </div>
        </div>
      )}
      {lr?.rules && lr.rules.length > 0 && (
        <div>
          <GroupLabel>Rules</GroupLabel>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-[var(--text-3)]">
            {lr.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {lr?.brandStrapline && (
        <p className="text-[12px] text-[var(--text-3)]">
          <span className="font-semibold text-[var(--text-2)]">Strapline:</span> {lr.brandStrapline}
        </p>
      )}
      {lr?.clearSpace && (
        <p className="text-[12px] text-[var(--text-3)]">
          <span className="font-semibold text-[var(--text-2)]">Clear space:</span> {lr.clearSpace}
        </p>
      )}
      {lr?.fileNamingConvention && (
        <p className="text-[12px] text-[var(--text-3)]">
          <span className="font-semibold text-[var(--text-2)]">File naming:</span>{" "}
          <span style={{ fontFamily: mono }}>{lr.fileNamingConvention}</span>
        </p>
      )}
      {lr?.notes && <p className="text-[12px] text-[var(--text-3)]">{lr.notes}</p>}
    </div>
  );
}

// ── Tailwind config generator ─────────────────────────────────────────────────

function generateTailwindConfig(tokens: DesignTokens): string {
  const lines: string[] = ["/** @type {import('tailwindcss').Config} */", "module.exports = {", "  theme: {", "    extend: {"];

  // Colors
  const colorEntries: string[] = [];
  const allColours = [
    ...tokens.colours.primary,
    ...tokens.colours.secondary,
    ...tokens.colours.neutrals,
  ];
  allColours.forEach((c) => {
    const key = c.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    colorEntries.push(`        '${key}': '${c.hex}'`);
    if (c.role) {
      const roleKey = c.role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      colorEntries.push(`        '${roleKey}': '${c.hex}'`);
    }
  });
  if (colorEntries.length) {
    lines.push("      colors: {");
    lines.push(...colorEntries);
    lines.push("      },");
  }

  // Font families
  const fontFamilies: string[] = [];
  if (tokens.typography.displayFont) {
    fontFamilies.push(`        display: ['${tokens.typography.displayFont}', '${tokens.typography.systemFallback}'],`);
  }
  if (tokens.typography.bodyFont) {
    fontFamilies.push(`        sans: ['${tokens.typography.bodyFont}', '${tokens.typography.systemFallback}'],`);
  }
  if (tokens.typography.monoFont) {
    fontFamilies.push(`        mono: ['${tokens.typography.monoFont}', 'monospace'],`);
  }
  if (fontFamilies.length) {
    lines.push("      fontFamily: {");
    lines.push(...fontFamilies);
    lines.push("      },");
  }

  // Spacing
  const spacingEntries = Object.entries(tokens.spacing?.scale ?? {});
  if (spacingEntries.length) {
    lines.push("      spacing: {");
    spacingEntries.forEach(([k, v]) => {
      lines.push(`        '${k}': '${v}',`);
    });
    lines.push("      },");
  }

  // Border radius
  const radiusEntries = Object.entries(tokens.radius ?? {});
  if (radiusEntries.length) {
    lines.push("      borderRadius: {");
    radiusEntries.forEach(([k, v]) => {
      lines.push(`        '${k}': '${v}',`);
    });
    lines.push("      },");
  }

  lines.push("    },");
  lines.push("  },");
  lines.push("};");
  return lines.join("\n");
}

// ── CSS tokens ──────────────────────────────────────────────────────────────

function CssTokensBlock({ tokens }: { tokens: DesignTokens }) {
  const [lang, setLang] = useState<"css" | "tailwind">("css");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const code =
    lang === "css"
      ? tokens.cssVariables || "/* No CSS variables provided */"
      : generateTailwindConfig(tokens);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div>
      {/* Unified control bar — one connected pill */}
      <div
        className="inline-flex overflow-hidden rounded-[6px] border border-[var(--border-2)]"
        style={{ fontFamily: mono }}
      >
        {(["css", "tailwind"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={[
              "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition border-r border-[var(--border-2)]",
              lang === l
                ? "bg-[var(--text-1)] text-[var(--surface-0)]"
                : "bg-white text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {l === "css" ? "CSS" : "Tailwind"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void copy()}
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] bg-white text-[var(--brand-700)] hover:bg-[var(--surface-1)] transition"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="border-l border-[var(--border-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] bg-white text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] transition"
        >
          {open ? "Hide ↑" : "Show ↓"}
        </button>
      </div>

      {open && (
        <pre
          className="mt-4 overflow-x-auto rounded-[10px] p-5 text-[12px] leading-relaxed text-[#E2E8F0]"
          style={{ background: "#0F172A", fontFamily: mono }}
        >
          {code}
        </pre>
      )}
    </div>
  );
}

// ── hero ────────────────────────────────────────────────────────────────────

function Hero({
  tokens,
  gradientCss,
  clientLogoUrl,
  intro,
}: {
  tokens: DesignTokens;
  gradientCss: string;
  clientLogoUrl?: string | null;
  intro?: string;
}) {
  /**
   * ⚠️ Derived from the GRADIENT, not from `primary`.
   *
   * This used to read `readable(primary)` while the band behind it painted
   * `gradientCss` — the client's own gradient. For a brand whose gradient is pale
   * (a cream, a soft peach) but whose primary is a mid tone, that put white text
   * on a near-white band: the brand name and tagline were invisible on Pollen IQ's
   * guide, and fixing the ink-choice threshold did nothing, because the colour
   * being measured was never on screen.
   */
  const heroInk = readableInkOnGradient(gradientCss, tokens.colours.primary[0]?.hex ?? "#0F172A");
  const onDark = heroInk === INK_LIGHT;
  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">00</span>
          {" // OVERVIEW"}
        </span>
        <span className="widget-header__status" style={{ fontFamily: mono }}>
          v{tokens.version}
        </span>
      </div>
      {/* Brand-coloured hero band — the client's own gradient. */}
      <div style={{ background: gradientCss, padding: "28px 32px" }}>
        {clientLogoUrl && (
          <div
            className="mb-4 flex items-center justify-center overflow-hidden"
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: onDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
              border: `1px solid ${onDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)"}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={clientLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        )}
        <h1
          style={{
            fontFamily: `${tokens.typography.displayFont}, ${tokens.typography.systemFallback}`,
            fontSize: 40,
            lineHeight: 1.05,
            color: heroInk,
            margin: 0,
          }}
        >
          {tokens.clientName}
        </h1>
        {tokens.brandVoice && (
          <p
            className="mt-2 max-w-xl text-[14px] leading-relaxed"
            style={{
              fontFamily: `${tokens.typography.bodyFont}, ${tokens.typography.systemFallback}`,
              color: onDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)",
            }}
          >
            {tokens.brandVoice}
          </p>
        )}
      </div>
      {intro && (
        <div className="px-8 py-5">
          <p
            className="max-w-2xl text-[14px] leading-relaxed text-[var(--text-2)]"
            style={{ fontFamily: `${tokens.typography.bodyFont}, ${tokens.typography.systemFallback}` }}
          >
            {intro}
          </p>
        </div>
      )}
    </section>
  );
}

/** Foundry-branded masthead. Doc meta is always in mono; the Foundry eyebrow drops when off. */
function GuidelinesHeader({
  tokens,
  showFoundryBranding,
  action,
}: {
  tokens: DesignTokens;
  showFoundryBranding: boolean;
  action?: ReactNode;
}) {
  return (
    <section className="widget-card">
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
        style={{ fontFamily: mono }}
      >
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">
          {tokens.clientName} · Brand Guidelines
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-3 text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">
            <span>v{tokens.version}</span>
            {tokens.generatedAt ? <span>{formatDate(tokens.generatedAt)}</span> : null}
            {showFoundryBranding ? (
              <span className="font-medium text-[var(--brand-700)]">Foundry</span>
            ) : null}
          </span>
          {action}
        </div>
      </div>
    </section>
  );
}

/** Foundry-branded footer in mono. Renders nothing when branding is off. */
function GuidelinesFooter({
  tokens,
  showFoundryBranding,
}: {
  tokens: DesignTokens;
  showFoundryBranding: boolean;
}) {
  if (!showFoundryBranding) return null;
  return (
    <footer
      className="flex items-center justify-center gap-1.5 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-4)]"
      style={{ fontFamily: mono }}
    >
      {tokens.generatedAt ? (
        <>
          <span>Updated {formatDate(tokens.generatedAt)}</span>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>Powered by Gitwork</span>
    </footer>
  );
}

// ── viewer ────────────────────────────────────────────────────────────────────

export function DesignSystemViewer({
  tokens,
  clientLogoUrl = null,
  showFoundryBranding = true,
  downloadable = true,
}: {
  tokens: DesignTokens;
  clientLogoUrl?: string | null;
  showFoundryBranding?: boolean;
  /** Show the "Download design system" button in the header. Off inside the
   *  internal workspace, which already exposes its own Download in the action bar. */
  downloadable?: boolean;
}) {
  const [fontDownloading, setFontDownloading] = useState(false);
  const [logoDownloading, setLogoDownloading] = useState(false);
  const [systemDownloading, setSystemDownloading] = useState(false);
  // Default editable narrative, seeded from the tokens (overridable in a later UI).
  const content = useMemo(() => generateGuidelinesContent(tokens), [tokens]);
  const allColours = [
    ...tokens.colours.primary,
    ...tokens.colours.secondary,
    ...tokens.colours.neutrals,
  ];
  const darkSurface =
    allColours.reduce<ColourToken | null>(
      (a, b) => (a && relativeLuminance(a.hex) <= relativeLuminance(b.hex) ? a : b),
      null,
    )?.hex ?? "#0F172A";
  const gradientCss =
    tokens.gradients[0]?.css ??
    `linear-gradient(135deg, ${tokens.colours.primary[0]?.hex ?? "#1D4ED8"} 0%, ${darkSurface} 100%)`;

  const fontList = [tokens.typography.displayFont, tokens.typography.bodyFont]
    .filter(Boolean)
    .join(" · ");

  const handleFontDownload = async () => {
    setFontDownloading(true);
    try {
      const { buildFontPack, triggerDownload } = await import("@/lib/design-system-zip");
      const zip = await buildFontPack(tokens);
      const slug = tokens.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      triggerDownload(zip, `${slug}-font-pack.zip`);
    } catch {
      /* silently fail */
    } finally {
      setFontDownloading(false);
    }
  };

  const hasLogoDownloads =
    !!clientLogoUrl || (tokens.logoRules?.assets ?? []).length > 0;

  const handleLogoDownload = async () => {
    setLogoDownloading(true);
    try {
      const { buildLogoPack, triggerDownload } = await import("@/lib/design-system-zip");
      const zip = await buildLogoPack(tokens, clientLogoUrl);
      const slug = tokens.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      triggerDownload(zip, `${slug}-logo-pack.zip`);
    } catch {
      /* silently fail */
    } finally {
      setLogoDownloading(false);
    }
  };

  // Full design-system pack — tokens + fonts + logos, organised into folders.
  const handleSystemDownload = async () => {
    setSystemDownloading(true);
    try {
      const { buildDesignSystemPack, triggerDownload } = await import("@/lib/design-system-zip");
      const zip = await buildDesignSystemPack(tokens, { clientLogoUrl });
      const slug = tokens.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      triggerDownload(zip, `${slug}-design-system.zip`);
    } catch {
      /* silently fail */
    } finally {
      setSystemDownloading(false);
    }
  };

  const systemDownloadBtn = downloadable ? (
    <button
      type="button"
      onClick={() => void handleSystemDownload()}
      disabled={systemDownloading}
      className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--brand-600)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
    >
      {systemDownloading ? "Packaging…" : "↓ Download design system"}
    </button>
  ) : undefined;

  const fontPackStatus = (
    <button
      type="button"
      onClick={() => void handleFontDownload()}
      disabled={fontDownloading}
      className="rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
    >
      {fontDownloading ? "Preparing…" : "↓ Font Pack"}
    </button>
  );

  const logoPackStatus = hasLogoDownloads ? (
    <button
      type="button"
      onClick={() => void handleLogoDownload()}
      disabled={logoDownloading}
      className="rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
    >
      {logoDownloading ? "Preparing…" : "↓ Logo Pack"}
    </button>
  ) : undefined;

  const blurbs = content.sectionBlurbs;
  // Combine the grid-spacing and corner-radius blurbs for the merged section.
  const spacingIntro = [blurbs.gridSpacing, blurbs.cornerRadius].filter(Boolean).join(" ");

  // Build numbered sections in order; only include ones with data.
  const sections: Array<{ title: string; intro?: string; status?: ReactNode; node: ReactNode }> = [];
  sections.push({
    title: "COLOURS",
    intro: blurbs.colour ?? "The brand palette — primary, secondary, and neutral roles, each with the hex and where to use it.",
    node: <ColoursSection tokens={tokens} />,
  });
  if (tokens.gradients.length)
    sections.push({
      title: "GRADIENTS",
      intro: "Signature gradients for heroes and full-bleed feature surfaces.",
      node: <GradientsSection tokens={tokens} />,
    });
  sections.push({
    title: "TYPOGRAPHY",
    intro: blurbs.typography ?? `Type system — ${fontList}. Each role with its spec and a live specimen.`,
    status: fontPackStatus,
    node: <TypographySection tokens={tokens} />,
  });
  sections.push({
    title: "SPACING & RADIUS",
    intro: spacingIntro || "The spacing scale and corner radii that set the rhythm and geometry.",
    node: <SpacingRadiusSection tokens={tokens} />,
  });
  if (tokens.buttons.length)
    sections.push({
      title: "BUTTONS",
      intro: blurbs.components ?? "Button variants and the surfaces — light, dark, gradient — they're built for.",
      node: <ButtonsSection tokens={tokens} darkSurface={darkSurface} gradientCss={gradientCss} />,
    });
  sections.push({
    title: "INPUTS",
    intro: "Form-field states on light and dark surfaces.",
    node: <InputsSection tokens={tokens} darkSurface={darkSurface} />,
  });
  if ((tokens.badges && tokens.badges.length) || tokens.emptyState)
    sections.push({
      title: "BADGES & STATES",
      intro: "Status badges and the empty-state treatment.",
      node: <BadgesSection tokens={tokens} />,
    });
  if (tokens.alerts && tokens.alerts.length)
    sections.push({
      title: "ALERTS",
      intro: "Notification and alert banner styles.",
      node: <AlertsSection tokens={tokens} />,
    });
  if (tokens.shadows.length)
    sections.push({
      title: "SHADOWS",
      intro: "Elevation levels, lightest to heaviest.",
      node: <ShadowsSection tokens={tokens} />,
    });
  if (tokens.logoRules || clientLogoUrl)
    sections.push({
      title: "LOGO",
      intro: blurbs.logo ?? "Logo lockups on light and dark surfaces, plus sizing and usage rules.",
      status: logoPackStatus,
      node: (
        <div className="flex flex-col gap-6">
          {content.logoRulesText.length > 0 && (
            <div>
              <GroupLabel>Do&apos;s</GroupLabel>
              <BulletList items={content.logoRulesText} />
            </div>
          )}
          <LogoSection tokens={tokens} clientLogoUrl={clientLogoUrl} darkSurface={darkSurface} />
        </div>
      ),
    });
  sections.push({
    title: "USAGE",
    intro: "The short version — what to do, and what to avoid.",
    node: <DosAndDontsSection content={content.dosAndDonts} />,
  });
  sections.push({
    title: "CSS TOKENS",
    intro: "The complete :root {} block and a Tailwind config snippet — select a format and copy.",
    node: <CssTokensBlock tokens={tokens} />,
  });

  const sectionId = (title: string) =>
    `ds-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

  return (
    <div className="flex flex-col gap-4">
      <GuidelinesHeader tokens={tokens} showFoundryBranding={showFoundryBranding} action={systemDownloadBtn} />
      <Hero tokens={tokens} gradientCss={gradientCss} clientLogoUrl={clientLogoUrl} intro={content.intro} />
      {/* Jump nav — sticks under the page band while you scroll. Near-opaque
          surface + elevation shadow so it stays legible over the colour swatches. */}
      <nav className="sticky top-2 z-20 flex flex-wrap items-center gap-1 rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-[rgba(250,250,249,0.97)] px-2 py-1.5 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.3)] backdrop-blur-md">
        {sections.map((s) => (
          <a
            key={s.title}
            href={`#${sectionId(s.title)}`}
            className="rounded-[6px] px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)] transition hover:bg-white hover:text-[var(--brand-700)]"
            style={{ fontFamily: mono }}
          >
            {s.title}
          </a>
        ))}
      </nav>
      {sections.map((s, i) => (
        <Section key={s.title} id={sectionId(s.title)} n={i + 1} title={s.title} intro={s.intro} status={s.status}>
          {s.node}
        </Section>
      ))}
      <p
        className="mt-1 text-center text-[13px] leading-relaxed text-[var(--text-3)]"
        style={{ fontFamily: `${tokens.typography.bodyFont}, ${tokens.typography.systemFallback}` }}
      >
        {content.closingLine}
      </p>
      <GuidelinesFooter tokens={tokens} showFoundryBranding={showFoundryBranding} />
    </div>
  );
}
