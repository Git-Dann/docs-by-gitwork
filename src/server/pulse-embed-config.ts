/**
 * Config for the public scanner — the /embed/pulse widget and the /production-ready
 * sales page, which are two doors to the same thing.
 *
 * ⚠️ `pulseEmbedCheckKeys` USED to live here: a picker choosing which of the 1,646
 * checks the free tier showed. It is gone, and the column is deliberately left in the
 * database rather than dropped (a drop is a data-losing schema change the guarded
 * `prisma db push` skips — CLAUDE.md §2).
 *
 * It went because the free tier stopped being a teaser. The public scan now runs every
 * deterministic check, scores the full set with `computeScoreBreakdown`, and shows every
 * triaged P1/P2 finding with its evidence — so there was no subset left to choose. The
 * picker's own help text ("these pick which checks the results email highlights") had
 * become false too: `pulse-lite/leads.ts` builds the email from `triage(allChecks)`, the
 * same triage the page shows, and never read the selection at all.
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
