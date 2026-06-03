"use client";

// Token-driven brand design system viewer.
//
// Renders a client's DesignTokens as a live, editorial design system inside
// Foundry's widget chrome (`NN // SECTION` headers). Brand-agnostic by design:
// every value comes from `tokens` — no hardcoded client colours/fonts. Shared by
// the internal Portal workspace and the public /brand/[token] page.

import { useState, type CSSProperties, type ReactNode } from "react";
import type {
  ColourToken,
  DesignTokens,
  TypographyToken,
} from "@/types/design-tokens";

// ── colour helpers ────────────────────────────────────────────────────────────

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1; // treat unparseable as light
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** Near-black or white, whichever reads on the given background hex. */
function readable(bg: string): string {
  return relLuminance(bg) > 0.5 ? "#0B0F19" : "#FFFFFF";
}

function rgba(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

const mono = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

// ── chrome primitives (Foundry widget grammar) ─────────────────────────────────

function Section({
  n,
  title,
  intro,
  status,
  children,
}: {
  n: number;
  title: string;
  intro?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="widget-card">
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

/** Mono value pill — solid (default) or quiet (muted). */
function Pill({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className="inline-block rounded-[4px] px-1.5 py-0.5 text-[10px]"
      style={{
        fontFamily: mono,
        background: muted ? "transparent" : "var(--surface-1)",
        color: muted ? "var(--text-4)" : "var(--text-2)",
        border: muted ? "none" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {children}
    </span>
  );
}

// ── colours ────────────────────────────────────────────────────────────────────

function ColourCard({ c }: { c: ColourToken }) {
  const veryLight = relLuminance(c.hex) > 0.9;
  return (
    <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-raised,#fff)]">
      <div
        style={{
          height: 96,
          background: c.hex,
          borderBottom: veryLight ? "1px solid rgba(0,0,0,0.06)" : "none",
        }}
      />
      <div className="p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-[var(--text-1)]">{c.name}</p>
          {c.role && (
            <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
              {c.role}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill>{c.hex.toUpperCase()}</Pill>
          {c.rgb && <Pill muted>{c.rgb}</Pill>}
          {c.pantone && <Pill muted>PANTONE {c.pantone}</Pill>}
        </div>
        {c.usage && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-3)]">{c.usage}</p>
        )}
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
  const groups: Array<[string, ColourToken[]]> = [
    ["Primary", tokens.colours.primary],
    ["Secondary", tokens.colours.secondary],
    ["Neutrals", tokens.colours.neutrals],
  ];
  const accent = tokens.colours.primary[1] ?? tokens.colours.secondary[0] ?? null;
  return (
    <div className="flex flex-col gap-8">
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label}>
            <GroupLabel>{label}</GroupLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((c, i) => (
                <ColourCard key={`${c.name}-${i}`} c={c} />
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
        {tokens.typography.scale.map((t, i) => (
          <div
            key={`${t.role}-${i}`}
            className="grid items-center gap-5 border-b border-[rgba(0,0,0,0.06)] px-5 py-4 last:border-0"
            style={{ gridTemplateColumns: "210px 1fr" }}
          >
            <div>
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
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-1)]"
              style={{
                fontFamily: `${t.fontFamily}, ${systemFallback}`,
                fontSize: t.fontSize,
                fontWeight: t.fontWeight,
                lineHeight: t.lineHeight || 1.2,
                letterSpacing: t.letterSpacing || undefined,
                textTransform: (t.textTransform as CSSProperties["textTransform"]) || undefined,
                margin: 0,
              }}
            >
              {sampleFor(t)}
            </p>
          </div>
        ))}
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
    { key: "dark", label: "On dark", bg: darkSurface, labelColor: "rgba(255,255,255,0.55)" },
    { key: "gradient", label: "On gradient", bg: gradientCss, labelColor: "rgba(255,255,255,0.7)" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {surfaces.map((s) => {
          const btns = onSurface(s.key);
          if (!btns.length) return null;
          return (
            <div key={s.key} className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
              <div
                style={{ background: s.bg, border: s.border, padding: 24, minHeight: 116 }}
                className="flex flex-wrap content-center items-center gap-2.5"
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

function LogoSection({ tokens }: { tokens: DesignTokens }) {
  const lr = tokens.logoRules!;
  return (
    <div className="flex flex-col gap-6">
      {lr.minSizes && Object.keys(lr.minSizes).length > 0 && (
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
      {lr.colourRules && lr.colourRules.length > 0 && (
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
      {lr.clearSpace && (
        <p className="text-[12px] text-[var(--text-3)]">
          <span className="font-semibold text-[var(--text-2)]">Clear space:</span> {lr.clearSpace}
        </p>
      )}
      {lr.notes && <p className="text-[12px] text-[var(--text-3)]">{lr.notes}</p>}
    </div>
  );
}

// ── CSS tokens ──────────────────────────────────────────────────────────────

function CssTokensSection({ tokens }: { tokens: DesignTokens }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tokens.cssVariables || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={copy}
          className="rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
        >
          {copied ? "Copied ✓" : "Copy CSS"}
        </button>
      </div>
      <pre
        className="overflow-x-auto rounded-[10px] p-5 text-[12px] leading-relaxed text-[#E2E8F0]"
        style={{ background: "#0F172A", fontFamily: mono }}
      >
        {tokens.cssVariables || "/* No CSS variables provided */"}
      </pre>
    </div>
  );
}

// ── hero ────────────────────────────────────────────────────────────────────

function Hero({ tokens, gradientCss }: { tokens: DesignTokens; gradientCss: string }) {
  const heroInk = readable(tokens.colours.primary[0]?.hex ?? "#0F172A");
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
              color: heroInk === "#FFFFFF" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)",
            }}
          >
            {tokens.brandVoice}
          </p>
        )}
      </div>
    </section>
  );
}

// ── viewer ────────────────────────────────────────────────────────────────────

export function DesignSystemViewer({ tokens }: { tokens: DesignTokens }) {
  const allColours = [
    ...tokens.colours.primary,
    ...tokens.colours.secondary,
    ...tokens.colours.neutrals,
  ];
  const darkSurface =
    allColours.reduce<ColourToken | null>(
      (a, b) => (a && relLuminance(a.hex) <= relLuminance(b.hex) ? a : b),
      null,
    )?.hex ?? "#0F172A";
  const gradientCss =
    tokens.gradients[0]?.css ??
    `linear-gradient(135deg, ${tokens.colours.primary[0]?.hex ?? "#1D4ED8"} 0%, ${darkSurface} 100%)`;

  const fontList = [tokens.typography.displayFont, tokens.typography.bodyFont]
    .filter(Boolean)
    .join(" · ");

  // Build numbered sections in order; only include ones with data.
  const sections: Array<{ title: string; intro?: string; node: ReactNode }> = [];
  sections.push({
    title: "COLOURS",
    intro: "The brand palette — primary, secondary, and neutral roles, each with the hex and where to use it.",
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
    intro: `Type system — ${fontList}. Each role with its spec and a live specimen.`,
    node: <TypographySection tokens={tokens} />,
  });
  sections.push({
    title: "SPACING & RADIUS",
    intro: "The spacing scale and corner radii that set the rhythm and geometry.",
    node: <SpacingRadiusSection tokens={tokens} />,
  });
  if (tokens.buttons.length)
    sections.push({
      title: "BUTTONS",
      intro: "Button variants and the surfaces — light, dark, gradient — they're built for.",
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
  if (tokens.logoRules)
    sections.push({
      title: "LOGO RULES",
      intro: "Logo sizing, clear space, and colour-on-surface rules.",
      node: <LogoSection tokens={tokens} />,
    });
  sections.push({
    title: "CSS TOKENS",
    intro: "The complete :root {} custom-property block — paste-ready for the build.",
    node: <CssTokensSection tokens={tokens} />,
  });

  return (
    <div className="flex flex-col gap-4">
      <Hero tokens={tokens} gradientCss={gradientCss} />
      {sections.map((s, i) => (
        <Section key={s.title} n={i + 1} title={s.title} intro={s.intro}>
          {s.node}
        </Section>
      ))}
    </div>
  );
}
