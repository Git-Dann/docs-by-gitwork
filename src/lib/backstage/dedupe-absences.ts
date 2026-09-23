import type { TeamCalendarEvent } from "@/types/backstage";

/**
 * Collapse the same absence booked twice.
 *
 * ── The case this exists for ─────────────────────────────────────────────────
 * One week off produced two bars on every day of it:
 *
 *   "Daniel Lindsay - Holiday"   all-day 5→10 Oct, description "Confirmed Leave",
 *                                id `36802551` — synced in from an HR system
 *   "Dan Away - New York"        OUT_OF_OFFICE  5→10 Oct, created by hand
 *
 * Both are real events on one calendar, so nothing upstream is wrong — the person
 * is simply recorded as away twice, which is what happens the moment an HR tool
 * writes into a calendar someone also manages themselves.
 *
 * ── Why the rule is narrow ───────────────────────────────────────────────────
 * ⚠️ Two events sharing a time slot are NOT generally the same event: back-to-back
 * calendars routinely hold two 11:30 calls, and collapsing those would HIDE a real
 * meeting — a far worse failure than showing one row too many. So this only ever
 * merges events that are ABSENCE-SHAPED (an out-of-office, or an all-day block
 * covering a whole day or more) AND cover the identical span. A meeting cannot
 * satisfy both, so no meeting can be lost to this.
 *
 * Nothing is deleted. The dropped title is kept on `mergedWith` so the UI can say
 * what it folded in rather than silently dropping a calendar entry.
 */

export type DedupedCalendarEvent = TeamCalendarEvent & {
  /** Titles of entries folded into this one. Empty when nothing was merged. */
  mergedWith?: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds for an ISO datetime or a YYYY-MM-DD all-day date. NaN if unparseable. */
function ms(value: string): number {
  return new Date(value).getTime();
}

/**
 * An entry that represents "this person is away", rather than a meeting.
 *
 * Deliberately generous on the absence side and strict on duration: an all-day
 * event shorter than a full day does not exist, and a timed event is only treated
 * as an absence when it spans a whole day or more (which is how an out-of-office
 * week arrives — midnight to midnight).
 */
export function isAbsenceShaped(ev: TeamCalendarEvent): boolean {
  const span = ms(ev.end) - ms(ev.start);
  if (!Number.isFinite(span)) return false;
  return ev.allDay || span >= DAY_MS;
}

/**
 * The calendar DAY a boundary falls on, as written.
 *
 * ⚠️ Compare days, not instants. Google returns an all-day event's boundary as a
 * bare date (`2026-10-05`, read as UTC midnight) and a timed out-of-office as a
 * local datetime (`2026-10-05T00:00:00+01:00`, which is 23:00 UTC on the 4th).
 * The same week off therefore arrives as two spans an hour apart, and an exact
 * millisecond key never matches them — which is exactly how the first version of
 * this shipped and did nothing.
 *
 * Slicing the first 10 characters takes the wall-clock date the string already
 * encodes, which is what a person means by "I am away on the 5th", and is stable
 * whatever offset either event was written in.
 */
function dayKey(value: string): string {
  return value.slice(0, 10);
}

/** The span key two entries must share to be considered the same absence. */
function spanKey(ev: TeamCalendarEvent): string {
  return `${ev.userId}|${dayKey(ev.start)}|${dayKey(ev.end)}`;
}

/**
 * Which of two duplicates to keep.
 *
 * Google's own `outOfOffice` type wins: it is the canonical "I am away" marker, it
 * is what a person picks deliberately, and the title tends to say something useful
 * ("Dan Away - New York") where an HR export names every absence the same way
 * ("Daniel Lindsay - Holiday").
 *
 * ⚠️ The first version of this preferred the LONGER title, on the assumption that
 * a hand-written one carries more. Tested against the two real events it got the
 * answer backwards — the HR title is 24 characters and the useful one is 19. Length
 * is not a proxy for meaning; the event type is the actual signal. Length survives
 * only as a tiebreak between two entries of the same type.
 */
function preferred(a: DedupedCalendarEvent, b: DedupedCalendarEvent): DedupedCalendarEvent {
  if (a.outOfOffice !== b.outOfOffice) return a.outOfOffice ? a : b;
  return b.summary.trim().length > a.summary.trim().length ? b : a;
}

export function dedupeAbsences(events: TeamCalendarEvent[]): DedupedCalendarEvent[] {
  const byKey = new Map<string, DedupedCalendarEvent>();
  const out: DedupedCalendarEvent[] = [];

  for (const ev of events) {
    if (!isAbsenceShaped(ev)) {
      out.push(ev);
      continue;
    }
    const key = spanKey(ev);
    const existing = byKey.get(key);
    if (!existing) {
      const entry: DedupedCalendarEvent = { ...ev };
      byKey.set(key, entry);
      out.push(entry);
      continue;
    }

    // Same person, same span, both absences — one booking, two records.
    const winner = preferred(existing, ev as DedupedCalendarEvent);
    const loser = winner === existing ? ev : existing;
    const merged = [...(existing.mergedWith ?? []), loser.summary].filter(
      (title, i, all) => title !== winner.summary && all.indexOf(title) === i,
    );

    // Mutate the entry already in `out` so order is preserved and no index maths
    // is needed — `existing` is the same object reference that was pushed.
    existing.summary = winner.summary;
    existing.meetLink = winner.meetLink;
    existing.mergedWith = merged;
  }

  return out;
}
