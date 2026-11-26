/**
 * Time for the person Dispatch is talking to, not just UK time (§174). Dan, 26 Nov 2026: "we need
 * to make sure we cater for other timezones". Much of the team works from Pakistan; clients are in
 * the UK and elsewhere. Pure, so the rules are tested.
 *
 * The timezone comes from, in order: what Slack or the browser says right now, the person's
 * notification settings, their Staff record, the country on their membership (the one leave uses),
 * then UK time. Anything that isn't a real IANA zone name is skipped.
 */

export const DEFAULT_TIME_ZONE = "Europe/London";

/** Countries Gitwork's people and clients are in, to a zone. A country with several picks its main one. */
export const COUNTRY_TIME_ZONES: Record<string, string> = {
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PK: "Asia/Karachi",
  IN: "Asia/Kolkata",
  BD: "Asia/Dhaka",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  EG: "Africa/Cairo",
  NG: "Africa/Lagos",
  ZA: "Africa/Johannesburg",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  NL: "Europe/Amsterdam",
  PT: "Europe/Lisbon",
  PL: "Europe/Warsaw",
  UA: "Europe/Kyiv",
  TR: "Europe/Istanbul",
  US: "America/New_York",
  CA: "America/Toronto",
  BR: "America/Sao_Paulo",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  SG: "Asia/Singapore",
  PH: "Asia/Manila",
};

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz.trim())) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** The first real zone among the candidates (best first), a country code's zone, or UK time. */
export function pickTimeZone(candidates: readonly (string | null | undefined)[], countryCode?: string | null): string {
  for (const c of candidates) if (isValidTimeZone(c)) return c.trim();
  const fromCountry = countryCode ? COUNTRY_TIME_ZONES[countryCode.trim().toUpperCase()] : undefined;
  return fromCountry ?? DEFAULT_TIME_ZONE;
}

function parts(now: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const ps = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone, hour12: false }).formatToParts(now);
  return (t: Intl.DateTimeFormatPartTypes) => ps.find((p) => p.type === t)?.value ?? "";
}

/** "GMT+5", "GMT", "GMT-5": the zone's offset right now. */
export function offsetLabel(now: Date, timeZone: string): string {
  return parts(now, timeZone, { timeZoneName: "shortOffset" })("timeZoneName") || "GMT";
}

/** The date in a zone, as YYYY-MM-DD (what due dates and the tools use). */
export function localDate(now: Date, timeZone: string): string {
  const get = parts(now, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The "now" line for Dispatch: the person's own date, day and time with their zone, plus UK time
 * when they aren't on it (clients and Gitwork's own calendar mostly run on UK time).
 * "2026-11-26 (Thursday), 19:05 in Asia/Karachi (GMT+5); 14:05 UK time"
 */
export function nowLine(now: Date, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const get = parts(now, tz, { weekday: "long", hour: "2-digit", minute: "2-digit" });
  const here = `${localDate(now, tz)} (${get("weekday")}), ${get("hour")}:${get("minute")}`;
  if (tz === DEFAULT_TIME_ZONE) return `${here} UK time`;
  const uk = parts(now, DEFAULT_TIME_ZONE, { hour: "2-digit", minute: "2-digit" });
  return `${here} in ${tz} (${offsetLabel(now, tz)}); ${uk("hour")}:${uk("minute")} UK time`;
}

/** A meeting time in the person's zone: "Thu 27 Nov, 15:00". All-day events have no time. */
export function formatMeeting(iso: string, timeZone: string, allDay: boolean): string {
  // An all-day event's date is a date, not a moment: shown as written, whatever the zone.
  const tz = allDay ? "UTC" : timeZone;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
    timeZone: tz,
  }).format(new Date(iso));
}
