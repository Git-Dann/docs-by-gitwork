"use client";

// Token-driven brand design system viewer.
//
// Renders a client's DesignTokens as a live, fully-branded design system inside
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

function rgba(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

// ── small chrome primitives (Foundry widget grammar) ───────────────────────────

function Section({
  n,
  title,
  action,
  children,
}: {
  n: number;
  title: string;
  action?: ReactNode;
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
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const mono = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]"
    >
      {children}
    </p>
  );
}

// ── sections ────────────────────────────────────────────────────────────────

function Swatch({ c }: { c: ColourToken }) {
  return (
    <div style={{ width: 132 }}>
      <div
        style={{
          height: 72,
          borderRadius: 8,
          background: c.hex,
          border: relLuminance(c.hex) > 0.9 ? "1px solid rgba(0,0,0,0.08)" : "none",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)",
        }}
      />
      <p className="mt-2 text-[12px] font-semibold text-[var(--text-1)]" style={{ margin: "8px 0 2px" }}>
        {c.name}
      </p>
      <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)", margin: 0 }}>
        {c.hex.toUpperCase()}
      </p>
      {c.rgb && (
        <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)", margin: 0 }}>
          {c.rgb}
        </p>
      )}
      {c.pantone && (
        <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)", margin: 0 }}>
          PANTONE {c.pantone}
        </p>
      )}
      {c.usage && <p className="mt-1 text-[11px] leading-snug text-[var(--text-3)]">{c.usage}</p>}
    </div>
  );
}

function TintStrip({ colour }: { colour: ColourToken }) {
  const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-[var(--text-3)]">
        {colour.name} — tint scale (10% → 100%)
      </p>
      <div className="flex overflow-hidden rounded-[6px] border border-[rgba(0,0,0,0.08)]">
        {steps.map((a) => (
          <div
            key={a}
            title={`${Math.round(a * 100)}%`}
            style={{ flex: 1, height: 40, background: rgba(colour.hex, a) }}
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
    <div className="flex flex-col gap-7">
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label}>
            <GroupLabel>{label}</GroupLabel>
            <div className="flex flex-wrap gap-3">
              {list.map((c, i) => (
                <Swatch key={`${c.name}-${i}`} c={c} />
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

function GradientsSection({ tokens }: { tokens: DesignTokens }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tokens.gradients.map((g, i) => (
        <div key={`${g.name}-${i}`} className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
          <div style={{ height: 96, background: g.css }} />
          <div className="p-3">
            <p className="text-[13px] font-semibold text-[var(--text-1)]">{g.name}</p>
            <p className="mt-0.5 break-all text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
              {g.css}
            </p>
            {g.usage && <p className="mt-1 text-[11px] text-[var(--text-3)]">{g.usage}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {[
          ["Display", displayFont],
          ["Body", bodyFont],
          ...(monoFont ? ([["Mono", monoFont]] as Array<[string, string]>) : []),
          ["Fallback", systemFallback],
        ].map(([k, v]) => (
          <span
            key={k}
            className="rounded-[4px] border border-[rgba(0,0,0,0.10)] px-2.5 py-1 text-[11px] text-[var(--text-3)]"
            style={{ fontFamily: mono }}
          >
            {k}: {v}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        {tokens.typography.scale.map((t, i) => (
          <div
            key={`${t.role}-${i}`}
            className="grid items-center gap-5 border-b border-[rgba(0,0,0,0.06)] py-4 last:border-0"
            style={{ gridTemplateColumns: "200px 1fr" }}
          >
            <div>
              <p className="text-[11px]" style={{ fontFamily: mono, color: "var(--brand-700)", margin: 0 }}>
                {t.role}
              </p>
              <p className="text-[11px] text-[var(--text-4)]" style={{ margin: "2px 0 0" }}>
                {t.fontSize} / {t.fontWeight}
                {t.lineHeight ? ` / lh ${t.lineHeight}` : ""}
              </p>
              <p className="truncate text-[10px] text-[var(--text-4)]">{t.fontFamily}</p>
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

function SpacingRadiusSection({ tokens }: { tokens: DesignTokens }) {
  const spacing = Object.entries(tokens.spacing.scale);
  const radius = Object.entries(tokens.radius);
  const px = (v: string) => {
    const m = /(-?\d+(\.\d+)?)/.exec(v);
    return m ? Math.min(parseFloat(m[1]), 160) : 0;
  };
  return (
    <div className="flex flex-col gap-7">
      <div>
        <GroupLabel>Spacing — base {tokens.spacing.base}px</GroupLabel>
        <div className="flex flex-col gap-1.5">
          {spacing.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-16 text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {k}
              </span>
              <div style={{ height: 12, width: Math.max(px(v), 2), background: "var(--brand-600)", borderRadius: 2 }} />
              <span className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <GroupLabel>Radius</GroupLabel>
        <div className="flex flex-wrap items-end gap-5">
          {radius.map(([k, v]) => (
            <div key={k} className="text-center">
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: "var(--surface-brand)",
                  border: "2px solid var(--brand-600)",
                  borderRadius: v,
                  margin: "0 auto 8px",
                }}
              />
              <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--brand-700)", margin: 0 }}>
                {k}
              </p>
              <p className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)", margin: 0 }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ButtonsSection({ tokens, darkSurface, gradientCss }: { tokens: DesignTokens; darkSurface: string; gradientCss: string }) {
  const renderBtn = (b: DesignTokens["buttons"][number], key: string) => (
    <button
      key={key}
      type="button"
      style={{
        background: b.background,
        color: b.textColour,
        border: b.border || "none",
        borderRadius: 6,
        padding: "9px 18px",
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

  const surfaces: Array<{ key: string; label: string; bg: string; border?: string }> = [
    { key: "light", label: "On light", bg: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)" },
    { key: "dark", label: "On dark", bg: darkSurface },
    { key: "gradient", label: "On gradient", bg: gradientCss },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {surfaces.map((s) => {
          const btns = onSurface(s.key);
          if (!btns.length) return null;
          return (
            <div key={s.key} className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
              <div style={{ background: s.bg, border: s.border, padding: 20, minHeight: 96 }} className="flex flex-wrap items-center gap-2">
                {btns.map((b, i) => renderBtn(b, `${s.key}-${i}`))}
              </div>
              <p className="px-3 py-2 text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                {s.label.toUpperCase()}
              </p>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
              {["Variant", "Background", "Text", "Border", "Surfaces", "Use"].map((h) => (
                <th key={h} className="border-b border-[rgba(0,0,0,0.08)] px-2 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.buttons.map((b, i) => (
              <tr key={`${b.name}-${i}`} className="text-[var(--text-2)]">
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5 font-medium text-[var(--text-1)]">{b.name}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5" style={{ fontFamily: mono }}>{b.background}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5" style={{ fontFamily: mono }}>{b.textColour}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5" style={{ fontFamily: mono }}>{b.border || "—"}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5">{b.surfaces.join(", ") || "—"}</td>
                <td className="border-b border-[rgba(0,0,0,0.05)] px-2 py-1.5 text-[var(--text-3)]">{b.usage || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
              borderRadius: 6,
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
        <div style={{ background: darkSurface, borderRadius: 10, padding: 16 }}>
          <input
            readOnly
            placeholder="On dark surface"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 6,
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
                      borderRadius: 4,
                      padding: "3px 9px",
                      fontSize: 11,
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
            <div className="flex gap-2">
              {[
                ["background", tokens.emptyState.background],
                ["stroke", tokens.emptyState.stroke],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ width: 56, height: 40, borderRadius: 6, background: v, border: "1px solid rgba(0,0,0,0.08)" }} />
                  <p className="mt-1 text-[10px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>{k}</p>
                </div>
              ))}
            </div>
            <div
              className="flex flex-1 items-center justify-center px-6 py-8 text-center"
              style={{
                minWidth: 220,
                borderRadius: 10,
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
            borderRadius: 8,
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

function ShadowsSection({ tokens }: { tokens: DesignTokens }) {
  return (
    <div className="flex flex-wrap gap-5">
      {tokens.shadows.map((s, i) => (
        <div
          key={`${s.name}-${i}`}
          style={{ width: 210, padding: 18, background: "#fff", borderRadius: 10, boxShadow: s.css, border: "1px solid rgba(0,0,0,0.04)" }}
        >
          <p className="text-[11px]" style={{ fontFamily: mono, color: "var(--brand-700)", margin: 0 }}>{s.name}</p>
          {s.usage && <p className="mt-1 text-[12px] text-[var(--text-3)]">{s.usage}</p>}
          <p className="mt-1 break-all text-[9px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>{s.css}</p>
        </div>
      ))}
    </div>
  );
}

function LogoSection({ tokens }: { tokens: DesignTokens }) {
  const lr = tokens.logoRules!;
  return (
    <div className="flex flex-col gap-5">
      {lr.minSizes && Object.keys(lr.minSizes).length > 0 && (
        <div>
          <GroupLabel>Minimum sizes</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {Object.entries(lr.minSizes).map(([k, v]) => (
              <span key={k} className="rounded-[4px] border border-[rgba(0,0,0,0.10)] px-2.5 py-1 text-[11px]" style={{ fontFamily: mono, color: "var(--text-3)" }}>
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
      )}
      {lr.colourRules && lr.colourRules.length > 0 && (
        <div>
          <GroupLabel>Colour on surface</GroupLabel>
          <table className="w-full max-w-md border-collapse text-[12px]">
            <tbody>
              {lr.colourRules.map((r, i) => (
                <tr key={i}>
                  <td className="border-b border-[rgba(0,0,0,0.06)] py-1.5 pr-4 text-[var(--text-2)]">{r.surface}</td>
                  <td className="border-b border-[rgba(0,0,0,0.06)] py-1.5 text-[var(--text-1)]">{r.logoVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lr.clearSpace && <p className="text-[12px] text-[var(--text-3)]"><span className="font-semibold text-[var(--text-2)]">Clear space:</span> {lr.clearSpace}</p>}
      {lr.notes && <p className="text-[12px] text-[var(--text-3)]">{lr.notes}</p>}
    </div>
  );
}

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
        className="overflow-x-auto rounded-[10px] p-4 text-[12px] leading-relaxed text-[#E2E8F0]"
        style={{ background: "#0F172A", fontFamily: mono }}
      >
        {tokens.cssVariables || "/* No CSS variables provided */"}
      </pre>
    </div>
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

  // Build numbered sections in order; only include ones with data.
  const sections: Array<{ title: string; node: ReactNode }> = [];
  sections.push({ title: "COLOURS", node: <ColoursSection tokens={tokens} /> });
  if (tokens.gradients.length) sections.push({ title: "GRADIENTS", node: <GradientsSection tokens={tokens} /> });
  sections.push({ title: "TYPOGRAPHY", node: <TypographySection tokens={tokens} /> });
  sections.push({ title: "SPACING & RADIUS", node: <SpacingRadiusSection tokens={tokens} /> });
  if (tokens.buttons.length)
    sections.push({ title: "BUTTONS", node: <ButtonsSection tokens={tokens} darkSurface={darkSurface} gradientCss={gradientCss} /> });
  sections.push({ title: "INPUTS", node: <InputsSection tokens={tokens} darkSurface={darkSurface} /> });
  if ((tokens.badges && tokens.badges.length) || tokens.emptyState)
    sections.push({ title: "BADGES & STATES", node: <BadgesSection tokens={tokens} /> });
  if (tokens.alerts && tokens.alerts.length) sections.push({ title: "ALERTS", node: <AlertsSection tokens={tokens} /> });
  if (tokens.shadows.length) sections.push({ title: "SHADOWS", node: <ShadowsSection tokens={tokens} /> });
  if (tokens.logoRules) sections.push({ title: "LOGO RULES", node: <LogoSection tokens={tokens} /> });
  sections.push({ title: "CSS TOKENS", node: <CssTokensSection tokens={tokens} /> });

  return (
    <div className="flex flex-col gap-4">
      {/* Brand header — rendered in the client's own display font */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">00</span>
            {" // OVERVIEW"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: mono }}>
            v{tokens.version}
          </span>
        </div>
        <div className="p-5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]" style={{ fontFamily: mono }}>
            Brand design system
          </p>
          <h1
            className="mt-1 text-[var(--text-1)]"
            style={{
              fontFamily: `${tokens.typography.displayFont}, ${tokens.typography.systemFallback}`,
              fontSize: 44,
              lineHeight: 1.1,
              margin: "4px 0 0",
            }}
          >
            {tokens.clientName}
          </h1>
          {tokens.brandVoice && (
            <p
              className="mt-2 max-w-2xl text-[15px] text-[var(--text-3)]"
              style={{ fontFamily: `${tokens.typography.bodyFont}, ${tokens.typography.systemFallback}` }}
            >
              {tokens.brandVoice}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {[tokens.typography.displayFont, tokens.typography.bodyFont, tokens.typography.monoFont]
              .filter((f): f is string => Boolean(f))
              .map((f) => (
                <span key={f} className="rounded-[4px] border border-[rgba(0,0,0,0.10)] px-2.5 py-1 text-[11px] text-[var(--text-3)]" style={{ fontFamily: mono }}>
                  {f}
                </span>
              ))}
          </div>
        </div>
      </section>

      {sections.map((s, i) => (
        <Section key={s.title} n={i + 1} title={s.title}>
          {s.node}
        </Section>
      ))}
    </div>
  );
}
