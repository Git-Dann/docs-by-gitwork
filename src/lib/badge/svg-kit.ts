/**
 * The shared machinery every badge renderer is built from.
 *
 * Extracted when the Countermark badge arrived and would otherwise have copied
 * ~150 lines of type composition out of the Pulse renderer. The three properties
 * below are the contract; a new renderer that breaks one of them is a bug even if
 * it looks right on screen.
 *
 * 1. **No external resources.** Badges are consumed through `<img>` on someone
 *    else's site, which is an isolated document: no webfont fetch, no inherited
 *    CSS, no script. Type is composed from outlined paths (`./glyphs.ts`) rather
 *    than `<text>` — a system-font fallback would render figures in Georgia's
 *    old-style numerals, where "9" drops below the baseline.
 *
 * 2. **The un-animated render is the finished render.** See `entrance`.
 *
 * 3. **Semantics lift on dark.** `#1D4ED8` / `#16A34A` on a near-black surface
 *    fail contrast — the rule DESIGN.md § Deck already applies to the editor.
 */
import { MONO_ADVANCE, MONO_GLYPHS, MONO_UPEM, SERIF_GLYPHS, SERIF_UPEM } from "./glyphs";

export type BadgeTheme = "light" | "dark";

export interface Tokens {
  face: string;
  ink: string;
  muted: string;
  faint: string;
  hair: string;
  track: string;
  accent: string;
  ok: string;
  warn: string;
  bad: string;
  /** For states that are neither good nor bad — "we could not establish this". */
  neutral: string;
}

export const WHITE = "#FFFFFF";
export const INK = "#0F172A";

export const LIGHT: Tokens = {
  face: WHITE, ink: INK, muted: "#64748B", faint: "#94A3B8",
  hair: "rgba(0,0,0,0.08)", track: "rgba(0,0,0,0.09)", accent: "#1D4ED8",
  ok: "#16A34A", warn: "#D97706", bad: "#DC2626", neutral: "#64748B",
};

export const DARK: Tokens = {
  face: "#1E293B", ink: "#F8FAFC", muted: "#CBD5E1", faint: "#64748B",
  hair: "rgba(255,255,255,0.10)", track: "rgba(255,255,255,0.13)", accent: "#6BA0FF",
  ok: "#4ADE80", warn: "#FBBF24", bad: "#F87171", neutral: "#94A3B8",
};

export function tokensFor(theme: BadgeTheme | undefined): Tokens {
  return theme === "dark" ? DARK : LIGHT;
}

// ── type composition ────────────────────────────────────────────────────────
export type Anchor = "start" | "middle" | "end";

function offset(x: number, width: number, anchor: Anchor): number {
  return anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
}

/** Width in px of a mono run. Monospaced, so this is exact without shaping. */
export function monoWidth(text: string, size: number, tracking = 0): number {
  const n = [...text].length;
  if (n === 0) return 0;
  return n * ((MONO_ADVANCE * size) / MONO_UPEM + tracking) - tracking;
}

/**
 * A JetBrains Mono run. Uppercased because the glyph table is caps-only — every
 * label on these badges is a mono caps readout per DESIGN.md, and halving the
 * charset halves the generated module.
 */
export function mono(
  text: string, size: number, x: number, y: number, fill: string,
  { tracking = 0, anchor = "start" as Anchor, cls = "" } = {},
): string {
  const k = size / MONO_UPEM;
  const step = (MONO_ADVANCE * size) / MONO_UPEM + tracking;
  const ox = offset(x, monoWidth(text, size, tracking), anchor);
  const paths = [...text.toUpperCase()]
    .map((ch, i) => {
      const d = MONO_GLYPHS[ch];
      // An unmapped character advances but draws nothing, so the spacing of the
      // rest of the run is unaffected — better than dropping it and shifting the
      // line.
      return d ? `<path transform="translate(${((i * step) / k).toFixed(0)} 0)" d="${d}"/>` : "";
    })
    .join("");
  const c = cls ? ` class="${cls}"` : "";
  return `<g transform="translate(${ox.toFixed(2)} ${y}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" fill="${fill}"${c}>${paths}</g>`;
}

/** Width in px of a DM Serif run (digits only). */
export function serifWidth(text: string, size: number): number {
  let u = 0;
  for (const ch of text) u += SERIF_GLYPHS[ch]?.adv ?? 0;
  return (u * size) / SERIF_UPEM;
}

/**
 * A DM Serif Display run — the big figure. Digits only; no kerning table is
 * carried, which is immaterial at two and three digits.
 */
export function serif(
  text: string, size: number, x: number, y: number, fill: string,
  { anchor = "start" as Anchor, cls = "" } = {},
): string {
  const k = size / SERIF_UPEM;
  const ox = offset(x, serifWidth(text, size), anchor);
  let cursor = 0;
  const paths = [...text]
    .map((ch) => {
      const g = SERIF_GLYPHS[ch];
      if (!g) return "";
      const p = `<path transform="translate(${cursor.toFixed(0)} 0)" d="${g.d}"/>`;
      cursor += g.adv;
      return p;
    })
    .join("");
  const c = cls ? ` class="${cls}"` : "";
  return `<g transform="translate(${ox.toFixed(2)} ${y}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" fill="${fill}"${c}>${paths}</g>`;
}

// ── chrome ──────────────────────────────────────────────────────────────────
export const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
export const PING = "@keyframes ping{0%,100%{opacity:1}50%{opacity:.4}}";

/**
 * A keyframe that holds `start` for the first `hold`% of its run then settles on
 * `end`.
 *
 * No fill-mode, and `end` is always the element's own base style, so an
 * un-animated render is the finished render. Staggering lives in the percentages
 * rather than in `animation-delay` for the same reason: a delay with fill-mode
 * `backwards` would reintroduce a hidden resting state, and an entrance
 * animation that renders its hidden frame is exactly what happens inside an
 * `<img>` that never gets scrolled into view.
 */
export function entrance(name: string, hold: number, start: string, end: string, mid = ""): string {
  const from = hold > 0 ? `0%,${hold}%` : "0%";
  return `@keyframes ${name}{${from}{${start}}${mid}100%{${end}}}`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export interface RenderedBadge {
  svg: string;
  width: number;
  height: number;
}

export function wrap(
  w: number, h: number, body: string, style: string, title: string, motion: boolean,
): RenderedBadge {
  const st = motion && style ? `<style>${REDUCED}${style}</style>` : "";
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
      `role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${st}${body}</svg>`,
    width: w,
    height: h,
  };
}

/** The house widget-card face: flat fill + hairline border, never a shadow. */
export function cardFace(w: number, h: number, t: Tokens, r = 10): string {
  return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${t.face}" stroke="${t.hair}"/>`;
}

/** The top-light / bottom-dark sheen shields carry. Emit once per document. */
export function sheenDef(id = "sh"): string {
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0.13"/></linearGradient>`
  );
}
