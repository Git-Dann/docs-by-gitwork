/**
 * Contrast maths — one answer to "what colour of text reads on this background".
 *
 * ⚠️ There were three answers before this, and they disagreed:
 *   · guidelines-deck.tsx  gamma-correct luminance, white when luminance <= 0.5
 *   · studio/brand.tsx     luminance with NO gamma correction, threshold 0.6
 *   · lib/badge/*          a real contrast-ratio comparison
 *
 * Both threshold versions are wrong, and wrong in the direction that hurts: the
 * point where white and black contrast EQUALLY against a background is at
 * relative luminance ≈ 0.179, not 0.5. Every background between 0.179 and the
 * threshold therefore got white text when it needed black — which is why a
 * client with a mid or pale brand colour (a golden pollen, a warm sand) ended up
 * with a brand-guidelines cover whose title and tagline were invisible.
 *
 * Pure and framework-free so both the server and the client can use it, and so
 * the failing cases can be unit-tested.
 */

export const INK_DARK = "#141414";
export const INK_LIGHT = "#FFFFFF";
/** WCAG AA for body text. */
export const AA_NORMAL = 4.5;
/** WCAG AA for large text (>=24px, or >=19px bold) — headlines and display type. */
export const AA_LARGE = 3;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts #rgb, #rrggbb (with or without the hash). Returns null for anything else. */
export function parseHex(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    if (!/^[0-9a-f]{3}$/i.test(hex)) return null;
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) };
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** WCAG relative luminance — gamma-corrected, which the naive average is not. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1; // unparseable → treat as white, so we fall back to dark ink
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** WCAG contrast ratio, 1..21. Order of arguments doesn't matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Near-black or white — whichever actually contrasts more against `bg`.
 *
 * A comparison, not a threshold: that is the whole fix. Where the two are equal
 * it prefers dark ink, which is the safer default on a brand colour (a slightly
 * dark-on-mid heading is legible; white-on-mid is the failure being fixed).
 */
export function readableInk(bg: string): string {
  return contrastRatio(bg, INK_DARK) >= contrastRatio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** True when dark ink is the right choice for this background. */
export function isLightBackground(bg: string): boolean {
  return readableInk(bg) === INK_DARK;
}

/**
 * Keep a brand colour recognisable but readable as TEXT on a given background.
 *
 * Using a raw brand colour for type is the other half of the same bug: a pale
 * gold eyebrow on near-white paper is around 1.3:1. Rather than discarding the
 * brand colour, this walks it toward black (or white, on a dark ground) in small
 * steps until it clears `min`, so the hue survives and the text is legible.
 *
 * Returns the adjusted hex, or `readableInk(bg)` if even a full walk can't get
 * there (only possible for degenerate inputs).
 */
export function ensureContrast(fg: string, bg: string, min: number = AA_NORMAL): string {
  const start = parseHex(fg);
  if (!start) return readableInk(bg);
  if (contrastRatio(fg, bg) >= min) return fg;

  // Walk toward whichever pole the background is NOT.
  const target = isLightBackground(bg) ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const candidate = toHex({
      r: start.r + (target.r - start.r) * t,
      g: start.g + (target.g - start.g) * t,
      b: start.b + (target.b - start.b) * t,
    });
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return readableInk(bg);
}

/** `rgba()` string from a hex + alpha. Falls through unchanged if unparseable. */
export function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Pull the colour stops out of a CSS gradient (or any CSS colour expression).
 *
 * Handles `#rgb`/`#rrggbb` and `rgb()`/`rgba()`. Alpha is ignored — a stop's own
 * colour is the best available approximation of what will be painted, and a
 * rough answer here is far better than measuring a colour that isn't on screen
 * at all. Anything it cannot read (named colours, `var()`, `color-mix()`) is
 * skipped, and callers fall back to a known background.
 */
export function extractColorStops(css: string | null | undefined): string[] {
  if (!css) return [];
  const out: string[] = [];
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    // #rrggbbaa → drop the alpha pair; #rgb / #rrggbb pass through.
    const hex = m[0].length >= 9 ? m[0].slice(0, 7) : m[0].length === 5 ? m[0].slice(0, 4) : m[0];
    if (parseHex(hex)) out.push(hex);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if ([r, g, b].every((v) => v >= 0 && v <= 255)) {
      out.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase());
    }
  }
  return out;
}

/**
 * The ink to use on a GRADIENT band.
 *
 * ⚠️ Exists because a brand hero derived its text colour from the brand's PRIMARY
 * while painting the brand's own gradient behind it. For a client whose gradient
 * is pale (a cream, a soft peach) but whose primary is a mid tone, that produced
 * white text on a near-white band — invisible, and no amount of fixing the
 * ink-choice threshold helps, because the colour being measured was never on
 * screen.
 *
 * Chooses the ink with the best WORST-CASE contrast across every stop: the text
 * has to stay readable along the whole band, not just at the end it started from.
 */
export function readableInkOnGradient(
  css: string | null | undefined,
  fallbackBg = "#FFFFFF",
): string {
  const stops = extractColorStops(css);
  if (stops.length === 0) return readableInk(fallbackBg);
  const worst = (ink: string) => Math.min(...stops.map((stop) => contrastRatio(stop, ink)));
  return worst(INK_DARK) >= worst(INK_LIGHT) ? INK_DARK : INK_LIGHT;
}
