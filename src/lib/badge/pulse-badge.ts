/**
 * Renders the public "Gitwork Pulse score" badge as a self-contained SVG.
 *
 * Pure and dependency-free on purpose: it takes numbers and strings, never a
 * Prisma row, so every shape below is unit-testable without a database. The
 * route (`/api/badge/pulse/[token]`) does the data work and calls in here.
 *
 * Three properties this file has to preserve, each of which has already cost
 * something to learn:
 *
 * 1. **No external resources.** The badge is consumed through `<img>` on someone
 *    else's site, which is an isolated document: no webfont fetch, no inherited
 *    CSS, no script. Type is therefore composed from outlined paths
 *    (`./glyphs.ts`) rather than `<text>` — a system-font fallback would render
 *    the score in Georgia's old-style numerals, where "9" drops below the
 *    baseline.
 *
 * 2. **Static by default.** A CSS animation inside an `<img>` does not simply
 *    fail to apply when it cannot run — the browser starts it and freezes the
 *    timeline at t=0, so an entrance animation renders its *hidden* first frame.
 *    That happens wherever a page is rasterised without being scrolled: social
 *    card renderers, print-to-PDF, full-page screenshots. Motion is opt-in via
 *    `motion: true`, and even then every base style equals the finished state,
 *    so dropping the `<style>` block is always safe.
 *
 * 3. **The bands match the report.** `scoreBand`/`scoreGrade` mirror
 *    `HealthScoreRing` in `src/components/document-cover.tsx`. A badge that
 *    disagreed with the report it links to would be worse than no badge.
 */
import { MONO_ADVANCE, MONO_GLYPHS, MONO_UPEM, SERIF_GLYPHS, SERIF_UPEM } from "./glyphs";

export type BadgeStyle = "shield" | "ring" | "card" | "bar";
export type BadgeTheme = "light" | "dark";

export interface BadgeBar {
  label: string;
  /** 0–1. */
  value: number;
}

export interface PulseBadgeInput {
  score: number;
  style?: BadgeStyle;
  theme?: BadgeTheme;
  motion?: boolean;
  /** Shown on `card` only. */
  project?: string;
  /** Domain breakdown for `card`; ignored by the other styles. */
  bars?: BadgeBar[];
}

export interface RenderedBadge {
  svg: string;
  width: number;
  height: number;
}

// ── tokens (DESIGN.md) ──────────────────────────────────────────────────────
const BLUE = "#1D4ED8";
const WHITE = "#FFFFFF";
const INK = "#0F172A";

interface Tokens {
  face: string; ink: string; muted: string; faint: string;
  hair: string; track: string; accent: string;
  ok: string; warn: string; bad: string;
}

const LIGHT: Tokens = {
  face: WHITE, ink: INK, muted: "#64748B", faint: "#94A3B8",
  hair: "rgba(0,0,0,0.08)", track: "rgba(0,0,0,0.09)", accent: BLUE,
  ok: "#16A34A", warn: "#D97706", bad: "#DC2626",
};

// Accent and semantics lift on dark: #1D4ED8 / #16A34A on a near-black surface
// fail contrast. Same rule DESIGN.md § Deck applies to the editor chrome.
const DARK: Tokens = {
  face: "#1E293B", ink: "#F8FAFC", muted: "#CBD5E1", faint: "#64748B",
  hair: "rgba(255,255,255,0.10)", track: "rgba(255,255,255,0.13)", accent: "#6BA0FF",
  ok: "#4ADE80", warn: "#FBBF24", bad: "#F87171",
};

/** Mirrors HealthScoreRing in src/components/document-cover.tsx. */
export function scoreBand(score: number, t: Tokens = LIGHT): string {
  return score >= 75 ? t.ok : score >= 50 ? t.warn : t.bad;
}

/** Mirrors HealthScoreRing in src/components/document-cover.tsx. */
export function scoreGrade(score: number): string {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 50) return "NEEDS WORK";
  return "AT RISK";
}

// ── type composition ────────────────────────────────────────────────────────
type Anchor = "start" | "middle" | "end";

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
 * A JetBrains Mono run. Uppercased because the table is caps-only — every label
 * on these badges is a mono caps readout per DESIGN.md, and halving the charset
 * halves the generated module.
 */
function mono(
  text: string, size: number, x: number, y: number, fill: string,
  { tracking = 0, anchor = "start" as Anchor, cls = "" } = {},
): string {
  const k = size / MONO_UPEM;
  const step = (MONO_ADVANCE * size) / MONO_UPEM + tracking;
  const chars = [...text.toUpperCase()];
  const ox = offset(x, monoWidth(text, size, tracking), anchor);
  const paths = chars
    .map((ch, i) => {
      const d = MONO_GLYPHS[ch];
      // An unmapped character advances but draws nothing, so spacing of the rest
      // of the run is unaffected — better than dropping it and shifting the line.
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
 * A DM Serif Display run — the score figure. Digits only; no kerning table is
 * carried, which is immaterial for two- and three-digit figures.
 */
function serif(
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

// ── shared chrome ───────────────────────────────────────────────────────────
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

/**
 * A keyframe that holds `start` for the first `hold`% of its run then settles on
 * `end`. No fill-mode, and `end` is always the element's base style, so the
 * un-animated render is the finished one — see the file header, point 2.
 * Staggering lives in the percentages for the same reason: a delay with
 * fill-mode `backwards` would reintroduce a hidden resting state.
 */
function entrance(name: string, hold: number, start: string, end: string, mid = ""): string {
  const from = hold > 0 ? `0%,${hold}%` : "0%";
  return `@keyframes ${name}{${from}{${start}}${mid}100%{${end}}}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function wrap(w: number, h: number, body: string, style: string, title: string, motion: boolean): RenderedBadge {
  const st = motion && style ? `<style>${REDUCED}${style}</style>` : "";
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
      `role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${st}${body}</svg>`,
    width: w,
    height: h,
  };
}

function cardFace(w: number, h: number, t: Tokens): string {
  return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${t.face}" stroke="${t.hair}"/>`;
}

// ── styles ──────────────────────────────────────────────────────────────────

/** Inline README / footer badge at shields.io proportions. Carries its own dark ground. */
function renderShield(score: number, motion: boolean): RenderedBadge {
  const H = 22, PAD = 9, FS = 9.5, TR = 0.8;
  const label = "PULSE";
  const value = `${score}/100`;
  const left = monoWidth(label, FS, TR) + PAD * 2 + 12;
  const right = monoWidth(value, FS, TR) + PAD * 2;
  const W = Math.round((left + right) * 10) / 10;
  const col = scoreBand(score);

  const body =
    `<clipPath id="c"><rect width="${W}" height="${H}" rx="4"/></clipPath>` +
    `<g clip-path="url(#c)"><rect width="${left}" height="${H}" fill="${INK}"/>` +
    `<rect x="${left}" width="${right}" height="${H}" fill="${col}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#sh)"/></g>` +
    // A pulse-trace glyph rather than a generic dot — it names the product.
    `<path d="M6 11 L8.4 11 L10 7.2 L12.4 15 L14 11 L16.4 11" fill="none" stroke="${col}" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="ecg"/>` +
    mono(label, FS, PAD + 12, 14.6, "#E2E8F0", { tracking: TR }) +
    mono(value, FS, left + right / 2, 14.6, WHITE, { tracking: TR, anchor: "middle" }) +
    `<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0.13"/></linearGradient></defs>`;

  const style =
    entrance("ecg", 0, "stroke-dashoffset:26", "stroke-dashoffset:0") +
    "@keyframes ping{0%,100%{opacity:1}50%{opacity:.4}}" +
    ".ecg{stroke-dasharray:26;animation:ecg 1s ease-out,ping 3s 1.4s ease-in-out infinite}";

  return wrap(W, H, body, style, `Gitwork Pulse score ${score} of 100`, motion);
}

/** The report's HealthScoreRing, standalone. Caption sits below the ring — inside, it collided with the arc. */
function renderRing(score: number, t: Tokens, motion: boolean): RenderedBadge {
  const W = 152, H = 184, cx = 76, cy = 76, r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const col = scoreBand(score, t);

  const body =
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="9" ` +
    `transform="rotate(-90 ${cx} ${cy})" class="arc" stroke-dasharray="${filled.toFixed(2)} ${circ.toFixed(2)}"/>` +
    `<g class="figg">${serif(String(score), 42, cx, cy + 6, t.ink, { anchor: "middle" })}</g>` +
    mono("/100", 10, cx, cy + 26, t.faint, { tracking: 0.8, anchor: "middle" }) +
    mono(scoreGrade(score), 9, cx, 155, col, { tracking: 1.4, anchor: "middle" }) +
    mono("GITWORK PULSE", 8, cx, 172, t.muted, { tracking: 1.5, anchor: "middle" });

  const style =
    entrance("sweep", 12, `stroke-dasharray:0 ${circ.toFixed(2)}`, `stroke-dasharray:${filled.toFixed(2)} ${circ.toFixed(2)}`) +
    entrance("figp", 50, "opacity:0;transform:scale(.82)", "opacity:1;transform:scale(1)", "80%{transform:scale(1.04)}") +
    ".arc{animation:sweep 1.25s cubic-bezier(.3,.9,.3,1)}" +
    `.figg{transform-origin:${cx}px ${cy}px;animation:figp 1s cubic-bezier(.2,.8,.3,1)}`;

  return wrap(W, H, body, style,
    `Gitwork Pulse score ${score} of 100 — ${scoreGrade(score).toLowerCase()}`, motion);
}

/** Slim horizontal readout for a footer. */
function renderBar(score: number, t: Tokens, motion: boolean): RenderedBadge {
  const W = 320, H = 62, TRACK = W - 90;
  const col = scoreBand(score, t);

  const body =
    cardFace(W, H, t) +
    mono("GITWORK PULSE", 8, 16, 21, t.muted, { tracking: 1.4 }) +
    mono(scoreGrade(score), 8, 16, 40, col, { tracking: 1.2 }) +
    serif(String(score), 24, W - 16, 26, t.ink, { anchor: "end", cls: "fig" }) +
    mono("/100", 8, W - 16, 40, t.faint, { tracking: 0.7, anchor: "end" }) +
    `<rect x="16" y="50" width="${TRACK}" height="4" rx="2" fill="${t.track}"/>` +
    `<rect x="16" y="50" width="${((TRACK * score) / 100).toFixed(1)}" height="4" rx="2" fill="${col}" class="fill"/>`;

  const style =
    entrance("grow", 15, "transform:scaleX(0)", "transform:scaleX(1)") +
    entrance("figf", 58, "opacity:0", "opacity:1") +
    ".fill{transform-origin:16px 0;animation:grow 1.3s cubic-bezier(.3,.9,.3,1)}" +
    ".fig{animation:figf 1.2s ease-out}";

  return wrap(W, H, body, style, `Gitwork Pulse score ${score} of 100`, motion);
}

/** Full widget grammar — the trust-page unit. */
function renderCard(
  score: number, project: string, bars: BadgeBar[], t: Tokens, motion: boolean,
): RenderedBadge {
  const W = 300, H = 200, cx = 64, cy = 110, r = 34;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const col = scoreBand(score, t);
  const verW = monoWidth("VERIFIED", 9, 0.8);

  const rows = bars.slice(0, 4);
  const barSvg = rows
    .map((b, i) => {
      const y = 114 + i * 14;
      const v = Math.max(0, Math.min(1, b.value));
      return (
        mono(b.label.slice(0, 16), 7, 118, y + 3.5, t.faint, { tracking: 0.7 }) +
        `<rect x="196" y="${y}" width="88" height="3.5" rx="1.5" fill="${t.track}"/>` +
        `<rect x="196" y="${y}" width="${(88 * v).toFixed(1)}" height="3.5" rx="1.5" fill="${t.accent}" class="bar b${i}"/>`
      );
    })
    .join("");

  const body =
    cardFace(W, H, t) +
    `<path d="M0.5 36.5 H${W - 0.5}" stroke="${t.hair}"/>` +
    mono("01 // PULSE SCORE", 10, 16, 23, t.ink, { tracking: 1.2 }) +
    `<circle cx="${W - 22 - verW}" cy="19.5" r="3" fill="${t.ok}" class="dot"/>` +
    mono("VERIFIED", 9, W - 16, 23, t.ok, { tracking: 0.8, anchor: "end" }) +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="7"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="7" ` +
    `transform="rotate(-90 ${cx} ${cy})" class="arc" stroke-dasharray="${filled.toFixed(2)} ${circ.toFixed(2)}"/>` +
    `<g class="figg">${serif(String(score), 30, cx, cy + 5, t.ink, { anchor: "middle" })}</g>` +
    mono("/100", 8, cx, cy + 20, t.faint, { tracking: 0.6, anchor: "middle" }) +
    mono(scoreGrade(score), 9, 118, 84, col, { tracking: 1.2 }) +
    mono(project.slice(0, 22), 8.5, 118, 100, t.muted, { tracking: 0.7 }) +
    barSvg +
    `<path d="M16 172 H${W - 16}" stroke="${t.hair}"/>` +
    mono("GITWORK PULSE · FOUNDRY", 7.5, 16, 186, t.faint, { tracking: 1 }) +
    mono("VIEW REPORT", 7.5, W - 26, 186, t.accent, { tracking: 1, anchor: "end" }) +
    // Drawn, not typed: the mono table is caps-only and carries no arrow glyph.
    `<path d="M${W - 23} 183.4 h6 m-2.4 -2.4 l2.4 2.4 l-2.4 2.4" fill="none" stroke="${t.accent}" stroke-width="1"/>`;

  const barKf = rows
    .map((_, i) => {
      const dur = 1.15 + i * 0.09;
      const hold = Math.round(((0.55 + i * 0.09) / dur) * 100);
      return (
        entrance(`g${i}`, hold, "transform:scaleX(0)", "transform:scaleX(1)") +
        `.b${i}{animation:g${i} ${dur.toFixed(2)}s cubic-bezier(.3,.9,.3,1)}`
      );
    })
    .join("");

  const style =
    entrance("sweep", 15, `stroke-dasharray:0 ${circ.toFixed(2)}`, `stroke-dasharray:${filled.toFixed(2)} ${circ.toFixed(2)}`) +
    entrance("figp", 52, "opacity:0;transform:scale(.82)", "opacity:1;transform:scale(1)", "80%{transform:scale(1.04)}") +
    "@keyframes ping{0%,100%{opacity:1}50%{opacity:.4}}" +
    ".arc{animation:sweep 1.3s cubic-bezier(.3,.9,.3,1)}" +
    `.figg{transform-origin:${cx}px ${cy}px;animation:figp 1.05s cubic-bezier(.2,.8,.3,1)}` +
    ".bar{transform-origin:196px 0}" + barKf +
    ".dot{animation:ping 2.4s 1.2s ease-in-out infinite}";

  return wrap(W, H, body, style, `Gitwork Pulse score ${score} of 100 for ${project}`, motion);
}

// ── entry point ─────────────────────────────────────────────────────────────
export function renderPulseBadge(input: PulseBadgeInput): RenderedBadge {
  // Clamp rather than reject: a badge is decoration on someone else's page, and
  // a 500 there is worse than a rounded number.
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const t = input.theme === "dark" ? DARK : LIGHT;
  const motion = input.motion === true;

  switch (input.style ?? "shield") {
    case "ring":
      return renderRing(score, t, motion);
    case "bar":
      return renderBar(score, t, motion);
    case "card":
      return renderCard(score, input.project ?? "", input.bars ?? [], t, motion);
    case "shield":
    default:
      return renderShield(score, motion);
  }
}
