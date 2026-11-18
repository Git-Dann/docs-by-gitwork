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
  "meetings",
  "designs",
  "documents",
  "pulse",
  "studies",
  "notes",
  "proof",
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
