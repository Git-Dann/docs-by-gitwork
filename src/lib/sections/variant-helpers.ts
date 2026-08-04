/**
 * Pure helpers shared by the document block-render variants (the MD's live-proposal patterns).
 *
 * Kept framework-free and in their own module so they are unit-testable without rendering a React
 * tree — the roman-numeral converter and the accent-tail parser are the two places a silent
 * off-by-one or a greedy regex would show up as wrong *type* on a client-facing page.
 */

const ROMAN_TABLE: Array<readonly [number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/**
 * Lowercase roman numeral for a **0-based** index — `0 → "i"`, `3 → "iv"`, `9 → "x"`.
 *
 * 0-based because every step/item list in the section registry is rendered from `map((_, i) => …)`,
 * and converting at the call site is exactly where the off-by-one gets introduced. Returns an empty
 * string for anything that is not a non-negative finite integer, so a malformed payload degrades to
 * "no numeral" rather than "NaN" printed on a client's page.
 */
export function romanNumeral(index: number): string {
  if (!Number.isFinite(index) || index < 0) return "";
  let remaining = Math.floor(index) + 1;
  let out = "";
  for (const [value, numeral] of ROMAN_TABLE) {
    while (remaining >= value) {
      out += numeral;
      remaining -= value;
    }
  }
  return out;
}

/**
 * Index of the tier that carries the "recommended" treatment, or `-1` when none does.
 *
 * The flag is per-tier and the editor enforces one-at-a-time, but a payload can carry more than one
 * (an older document, an AI expansion, a hand-edited JSON) — and two dark faces side by side reads
 * as a bug. **First wins**, deterministically.
 */
export function pickRecommendedIndex(tiers: ReadonlyArray<{ highlighted?: boolean }>): number {
  if (!Array.isArray(tiers)) return -1;
  return tiers.findIndex((tier) => tier?.highlighted === true);
}

/** One run of heading text — `accent: true` is set in serif italic in `--doc-accent`. */
export interface AccentSegment {
  text: string;
  accent: boolean;
}

/** Matches `*one or more non-asterisk chars*` on a single line. Non-greedy by construction. */
const ACCENT_PATTERN = /\*([^*\n]+)\*/g;

/**
 * Split heading text into plain and accent runs: `"Five angles of *attack.*"` →
 * `[{ text: "Five angles of ", accent: false }, { text: "attack.", accent: true }]`.
 *
 * Deliberately narrow — this is NOT the markdown renderer and must not become one. Rules:
 *   • an unpaired `*` stays literal (so a heading that legitimately contains one is unharmed);
 *   • `**` never matches (the pattern needs at least one inner character);
 *   • text with no asterisks returns exactly one plain segment, which is why every heading written
 *     before this existed renders byte-identically.
 */
export function parseAccentSegments(text: string): AccentSegment[] {
  if (!text) return [];
  const segments: AccentSegment[] = [];
  let cursor = 0;
  ACCENT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ACCENT_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), accent: false });
    segments.push({ text: match[1], accent: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), accent: false });
  return segments.filter((segment) => segment.text.length > 0);
}

/** True when the text carries at least one accent run — used to skip the banner's auto-period. */
export function hasAccentTail(text: string): boolean {
  return parseAccentSegments(text).some((segment) => segment.accent);
}
