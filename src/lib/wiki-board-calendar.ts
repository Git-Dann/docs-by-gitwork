/**
 * The Board's Calendar (src/components/clients/wiki/wiki-board-calendar.tsx). Pure date maths:
 * the month grid, the week, what falls on each day, and each release drawn as a span across its
 * days. UK weeks: Monday first.
 *
 * Days are whole numbers (days since 1 Jan 1970, UTC), the same as the Timeline
 * (src/lib/wiki-board-timeline.ts), so a card is on the same day in both views.
 *
 * A card goes on its due date. A card with no due date isn't on the calendar at all: an imported
 * card has none, and inventing one would put work on a day nobody chose.
 */

import { dayOf, mondayOnOrBefore } from "@/lib/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

export type CalendarScale = "month" | "week";

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function dateOf(day: number): Date {
  return new Date(day * DAY_MS);
}

/** The day number of the 1st of a month (month is 0-based). */
export function firstOfMonth(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month, 1) / DAY_MS);
}

/** Year and 0-based month of a day. */
export function monthOf(day: number): { year: number; month: number } {
  const d = dateOf(day);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** "November 2026". */
export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** "17 – 23 Nov 2026" (or across months, "29 Dec – 4 Jan 2027"). */
export function weekTitle(monday: number): string {
  const a = dateOf(monday);
  const b = dateOf(monday + 6);
  const short = (d: Date) => MONTHS[d.getUTCMonth()].slice(0, 3);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${short(b)} ${b.getUTCFullYear()}`
    : `${a.getUTCDate()} ${short(a)} – ${b.getUTCDate()} ${short(b)} ${b.getUTCFullYear()}`;
}

/** Day of the month for a day number. */
export function dateNumber(day: number): number {
  return dateOf(day).getUTCDate();
}

/**
 * The month as whole weeks, Monday to Sunday: it starts on the Monday on or before the 1st and
 * ends on the Sunday on or after the last day, so leading and trailing days from the months either
 * side fill the first and last rows.
 */
export function monthGrid(year: number, month: number): number[][] {
  const first = firstOfMonth(year, month);
  const last = firstOfMonth(year, month + 1) - 1;
  const start = mondayOnOrBefore(first);
  const end = mondayOnOrBefore(last) + 6;
  const weeks: number[][] = [];
  for (let d = start; d <= end; d += 7) weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => d + i));
  return weeks;
}

/** The seven days of the week that holds `day`, Monday first. */
export function weekOf(day: number): number[] {
  const monday = mondayOnOrBefore(day);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => monday + i);
}

/** Step a month forwards or back. */
export function addMonths(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export interface ReleaseMarker {
  release: WikiBoardRelease;
  kind: "start" | "end";
}

export interface CalendarDay {
  day: number;
  cards: WikiBoardCard[];
  markers: ReleaseMarker[];
}

/**
 * What falls on each day in [from, to]: cards on their due date, and each release's start and end.
 * Days with nothing are still listed, so the grid can index straight in.
 */
export function calendarDays(
  cards: readonly WikiBoardCard[],
  releases: readonly WikiBoardRelease[],
  from: number,
  to: number,
): Map<number, CalendarDay> {
  const days = new Map<number, CalendarDay>();
  for (let d = from; d <= to; d++) days.set(d, { day: d, cards: [], markers: [] });
  for (const c of cards) {
    if (!c.dueDate) continue;
    days.get(dayOf(c.dueDate))?.cards.push(c);
  }
  for (const r of releases) {
    if (r.startDate) days.get(dayOf(r.startDate))?.markers.push({ release: r, kind: "start" });
    if (r.endDate) days.get(dayOf(r.endDate))?.markers.push({ release: r, kind: "end" });
  }
  for (const d of days.values()) d.cards.sort((a, b) => a.title.localeCompare(b.title));
  return days;
}

export interface ReleaseSpan {
  release: WikiBoardRelease;
  /** Column the span starts and ends in within this week, 0 = Monday. */
  fromCol: number;
  toCol: number;
  /** The release really starts / ends this week (not clipped by the week's edge). */
  startsHere: boolean;
  endsHere: boolean;
  /** Stacking row within the week, so overlapping releases don't draw over each other. */
  track: number;
}

/**
 * Each release as a span across one week's days, clipped to that week. A release needs both dates
 * to be drawn as a span; one with only one date shows as a marker on that day and nothing else.
 */
export function releaseSpansForWeek(releases: readonly WikiBoardRelease[], week: readonly number[]): ReleaseSpan[] {
  const weekStart = week[0];
  const weekEnd = week[week.length - 1];
  const spans: Omit<ReleaseSpan, "track">[] = [];
  for (const r of releases) {
    if (!r.startDate || !r.endDate) continue;
    const s = dayOf(r.startDate);
    const e = dayOf(r.endDate);
    if (e < s || e < weekStart || s > weekEnd) continue;
    spans.push({
      release: r,
      fromCol: Math.max(s, weekStart) - weekStart,
      toCol: Math.min(e, weekEnd) - weekStart,
      startsHere: s >= weekStart,
      endsHere: e <= weekEnd,
    });
  }
  spans.sort((a, b) => a.fromCol - b.fromCol || b.toCol - b.fromCol - (a.toCol - a.fromCol));
  const trackEnds: number[] = [];
  return spans.map((s) => {
    let track = trackEnds.findIndex((end) => end < s.fromCol);
    if (track < 0) track = trackEnds.length;
    trackEnds[track] = s.toCol;
    return { ...s, track };
  });
}

/** The days in [from, to] that have a card or a release marker, for the phone's agenda list. */
export function agendaDays(days: Map<number, CalendarDay>, from: number, to: number): CalendarDay[] {
  const out: CalendarDay[] = [];
  for (let d = from; d <= to; d++) {
    const entry = days.get(d);
    if (entry && (entry.cards.length || entry.markers.length)) out.push(entry);
  }
  return out;
}

/** "Mon 17 Nov". */
export function dayLabel(day: number): string {
  const d = dateOf(day);
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
