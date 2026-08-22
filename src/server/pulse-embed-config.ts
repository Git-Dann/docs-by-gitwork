/**
 * Config for the public /embed/pulse widget (the gitwork.co.uk lead-capture teaser).
 *
 * Two workspace-scoped settings, both editable from the "Public Embed" panel on
 * /app/pulse (src/components/pulse/pulse-embed-panel.tsx):
 *   - pulseEmbedEnabled    — master kill-switch, checked first by both public routes.
 *   - pulseEmbedCheckKeys  — which checkKeys (from checks-registry.ts) the free teaser
 *     shows. Score/counts/findings in the embed all derive from this subset, not the
 *     full scan — see src/app/api/public/pulse/scan/[id]/route.ts.
 */

/** Sensible starter set — one per category, broadly applicable to any site. */
export const DEFAULT_EMBED_CHECK_KEYS: string[] = [
  "ssl_valid",
  "http_redirect",
  "response_time",
  "meta_title",
  "meta_description",
  "csp_header",
  "no_exposed_env",
  "viewport_meta",
  "favicon",
  "compression",
];

/**
 * Where a public scan came from. Lead attribution across the entry points.
 *
 * There are now TWO doors to the same tool — the embeddable widget dropped into a
 * host page, and the /production-ready sales page — so knowing which one converts
 * is the difference between guessing and measuring.
 *
 * Declared once and shared by the widget and both public routes; three separate
 * copies of this list is how a valid source silently starts being discarded.
 */
export const PULSE_SCAN_SOURCES = [
  "gitwork.co.uk",       // the widget, embedded on the marketing site
  "production-ready",    // the sales page at /production-ready
  "foundry-demo",        // /demo/* and anything unattributed
] as const;

export type PulseScanSource = (typeof PULSE_SCAN_SOURCES)[number];

export function isPulseScanSource(v: unknown): v is PulseScanSource {
  return typeof v === "string" && (PULSE_SCAN_SOURCES as readonly string[]).includes(v);
}

export function resolveEmbedCheckKeys(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((k) => typeof k === "string") && raw.length > 0) {
    return raw as string[];
  }
  return DEFAULT_EMBED_CHECK_KEYS;
}

/** Restricts a full checks array down to the curated embed set, preserving order. */
export function filterToEmbedChecks<T extends { checkKey: string }>(checks: T[], checkKeys: string[]): T[] {
  const allowed = new Set(checkKeys);
  return checks.filter((c) => allowed.has(c.checkKey));
}

/** Default "Book a call" link — used until a workspace sets its own via the settings page. */
export const DEFAULT_BOOKING_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3uLzvxU1kbocUtjtGtYTTLqKuGCCjnvHAM1dLRJsbMhvYjOdaamfywtrHEHQxqEQTZ_YbNLGEf?gv=true";

export function resolveBookingUrl(raw: unknown): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : DEFAULT_BOOKING_URL;
}
