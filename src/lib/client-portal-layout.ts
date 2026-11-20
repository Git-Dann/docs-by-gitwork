/**
 * The Portal client page's card numbers (src/components/clients/client-detail.tsx). Cards appear
 * and disappear with the data (billing, Pulse, studies, notes, proof documents), so numbers are
 * handed out in render order from what is actually shown: a hidden card never leaves a gap
 * (DESIGN.md: NN // headers run in sequence).
 */

export const PORTAL_SECTIONS = [
  "statDocs",
  "statPlatforms",
  "statDesigns",
  "statPulse",
  "statDevs",
  "slack",
  "contact",
  "billing",
  "platforms",
  "developers",
  "timeline",
  "meetings",
  "designs",
  "documents",
  "proof",
  // The bottom row of small cards, in this order (they don't need full-width priority).
  "pulse",
  "studies",
  "notes",
  "lifecycle",
] as const;

export type PortalSection = (typeof PORTAL_SECTIONS)[number];

/**
 * Two-digit numbers for the sections that are shown, in page order, starting after the client
 * record (01). A section that isn't shown gets "" so a stray render is visible rather than wrong.
 */
export function portalSectionNumbers(shown: (section: PortalSection) => boolean, start = 2): Record<PortalSection, string> {
  const out = {} as Record<PortalSection, string>;
  let n = start;
  for (const key of PORTAL_SECTIONS) {
    out[key] = shown(key) ? String(n++).padStart(2, "0") : "";
  }
  return out;
}

/**
 * How many cards share a row in a wrapping card grid (Developers), chosen from the count so the
 * last row is never left with a hole: 5 → 3 + 2, 7 → 4 + 3. The cards also flex-grow, so whatever
 * lands on a shorter last row (or a narrow screen) stretches to fill it.
 */
export function cardsPerRow(count: number): number {
  if (count <= 4) return Math.max(1, count);
  if (count <= 6) return 3;
  return 4;
}

/** The flex-basis for one card when `perRow` share a row with `gapPx` between them. */
export function cardBasis(perRow: number, gapPx: number): string {
  return `calc((100% - ${(perRow - 1) * gapPx}px) / ${perRow})`;
}
