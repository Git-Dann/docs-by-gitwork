/**
 * Config for the public scanner — the /embed/pulse widget and the /production-ready
 * sales page, which are two doors to the same thing.
 *
 * ⚠️ `pulseEmbedCheckKeys` is back, with DIFFERENT semantics. The old picker filtered AND
 * RESCORED what a visitor saw, which made the teaser score a different quantity from the
 * paid one. It was removed when it went dead. It now limits only which findings are SHOWN
 * in full; the score is always the full-scan number. Rule + storage shape:
 * `src/lib/pulse-free-tier.ts`. The stored value is `{ keys: [...] }` (not a bare array) so
 * the old curated array still sitting in the database reads as "no limit".
 *
 * The remaining workspace settings are the kill-switch (`pulseEmbedEnabled`), the
 * Turnstile keys, and the "Book a call" URL.
 */


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


/** Default "Book a call" link — used until a workspace sets its own via the settings page. */
export const DEFAULT_BOOKING_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3uLzvxU1kbocUtjtGtYTTLqKuGCCjnvHAM1dLRJsbMhvYjOdaamfywtrHEHQxqEQTZ_YbNLGEf?gv=true";

export function resolveBookingUrl(raw: unknown): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : DEFAULT_BOOKING_URL;
}
