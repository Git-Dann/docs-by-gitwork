/**
 * Pure rules for GET /api/backstage/calendar/events (the Mac app's calendar): which range to
 * read, and how a Google Calendar event becomes the app's event. No I/O here.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The widest range one request may ask for. A week view needs 7; this leaves room for months. */
export const MAX_RANGE_DAYS = 62;

export type CalendarRange = { from: Date; to: Date };

/** `from`/`to` are ISO strings. Missing → today for a week. Invalid or reversed → null. */
export function parseCalendarRange(fromRaw: string | null, toRaw: string | null, now = new Date()): CalendarRange | null {
  const from = fromRaw ? new Date(fromRaw) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = toRaw ? new Date(toRaw) : new Date(from.getTime() + 7 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) return null;
  return { from, to };
}

export interface AppCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  meetLink: string | null;
  htmlLink: string | null;
  attendees: number;
}

/** The parts of a Google Calendar event this uses. */
export interface GoogleEventLike {
  id?: string | null;
  status?: string | null;
  eventType?: string | null;
  summary?: string | null;
  location?: string | null;
  hangoutLink?: string | null;
  htmlLink?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  attendees?: Array<{ self?: boolean | null; responseStatus?: string | null }> | null;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null } | null;
}

/**
 * Keeps what belongs on a calendar you'd look at: drops cancelled events, ones you declined,
 * and working-location markers (they're a status, not time spent). Keeps solo blocks and
 * all-day events, unlike the Desk's "upcoming meetings" list.
 */
export function toAppEvent(e: GoogleEventLike): AppCalendarEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  if (e.eventType === "workingLocation") return null;
  const me = e.attendees?.find((a) => a.self);
  if (me?.responseStatus === "declined") return null;
  const allDay = !e.start?.dateTime;
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date ?? start;
  if (!start || !end) return null;
  const video = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return {
    id: e.id,
    title: e.summary?.trim() || "Busy",
    // All-day dates are calendar days ("2026-11-06"); the app reads them as local days.
    start,
    end,
    allDay,
    location: e.location?.trim() || null,
    meetLink: video,
    htmlLink: e.htmlLink ?? null,
    attendees: (e.attendees ?? []).filter((a) => !a.self).length,
  };
}
