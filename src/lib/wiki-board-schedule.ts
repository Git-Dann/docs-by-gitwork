/**
 * The Board's Schedule (src/components/clients/wiki/wiki-board-schedule.tsx): the plan as a list of
 * weeks, not a month grid. Pure, so the server, the demo and the tests read it the same way.
 *
 * Each week carries, once:
 *   - the releases running in it (with % done), not one stripe per day;
 *   - the cards due in it;
 *   - what actually happened in it: the dated stages each card went through (imported from the
 *     client's planning tool) and the day a card was finished;
 *   - the client's key dates (content drops, launches, events).
 * Overdue cards are pinned above the weeks, and cards with no date sit in a tray below, where a
 * date can be set. A card with no date is never given one here: nobody chose it.
 *
 * Days are whole numbers (days since 1 Jan 1970, UTC), the same as the Timeline
 * (src/lib/wiki-board-timeline.ts), so a card falls on the same day in every view. Weeks run
 * Monday to Sunday.
 */

import { clientMayActOn } from "@/lib/wiki-board";
import { dayOf, mondayOnOrBefore, releasePercent } from "@/lib/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardKeyDate, WikiBoardRelease } from "@/types/wiki-board";

/** Weeks shown at first, and added by each "Show more". */
export const SCHEDULE_WEEKS = 12;

export type ScheduleMode = "upcoming" | "past";

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateOf(day: number): Date {
  return new Date(day * DAY_MS);
}

/** "17 – 23 Nov", or across months "29 Dec – 4 Jan". The year is added when it isn't this one. */
export function weekLabel(monday: number, thisYear?: number): string {
  const a = dateOf(monday);
  const b = dateOf(monday + 6);
  const year = b.getUTCFullYear() !== (thisYear ?? b.getUTCFullYear()) ? ` ${b.getUTCFullYear()}` : "";
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}${year}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}${year}`;
}

/** "Mon 17 Nov". */
export function dayLabel(day: number): string {
  const d = dateOf(day);
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-11-17" for a day number. */
export function isoDay(day: number): string {
  return dateOf(day).toISOString().slice(0, 10);
}

export interface ScheduleRelease {
  release: WikiBoardRelease;
  /** The release really starts / ends in this week. */
  startsThisWeek: boolean;
  endsThisWeek: boolean;
  /** Done over all of the client's cards in it, or null when it has none. */
  percent: number | null;
}

export interface ScheduleDue {
  card: WikiBoardCard;
  day: number;
}

export interface ScheduleEvent {
  card: WikiBoardCard;
  /** "Live Features", "Deployed (Test Flight)", "Done"… */
  label: string;
  day: number;
}

export interface ScheduleKeyDate {
  keyDate: WikiBoardKeyDate;
  day: number;
}

export interface ScheduleWeek {
  monday: number;
  /** This is the week that holds today. */
  isCurrent: boolean;
  releases: ScheduleRelease[];
  due: ScheduleDue[];
  happened: ScheduleEvent[];
  keyDates: ScheduleKeyDate[];
  /** Nothing at all in this week. */
  empty: boolean;
}

export interface Schedule {
  /** Not done and due before today, oldest first. Only in the Upcoming view. */
  overdue: ScheduleDue[];
  weeks: ScheduleWeek[];
  /** Cards with no due date that aren't done: the tray where a date can be set. */
  undated: WikiBoardCard[];
  /** There is something dated beyond the weeks shown (later for Upcoming, earlier for Past). */
  hasMore: boolean;
}

/** A finished card. */
function isDone(card: WikiBoardCard): boolean {
  return card.status === "DONE";
}

function dayOrNull(value: string | null): number | null {
  if (!value) return null;
  const d = dayOf(value);
  return Number.isFinite(d) ? d : null;
}

/**
 * The dated things that happened to a card, oldest first. Only for the client's own cards (product
 * cards and the cards they added): the team's dev tasks never make an event, whatever the board
 * shows. A finish date is its own "Done" event unless a stage was recorded the same day (the
 * imported "Live Features" already says so).
 */
export function cardEvents(card: WikiBoardCard): Array<{ label: string; day: number }> {
  if (!clientMayActOn(card)) return [];
  const out: Array<{ label: string; day: number }> = [];
  for (const s of card.stageHistory) {
    const day = dayOrNull(s.date);
    if (day !== null) out.push({ label: s.label, day });
  }
  const doneDay = dayOrNull(card.doneAt);
  if (doneDay !== null && !out.some((e) => e.day === doneDay)) out.push({ label: "Done", day: doneDay });
  return out.sort((a, b) => a.day - b.day || a.label.localeCompare(b.label));
}

/** A release's place in a week, or null when it isn't in that week at all. */
export function releaseInWeek(release: WikiBoardRelease, monday: number): ScheduleRelease | null {
  const start = dayOrNull(release.startDate);
  const end = dayOrNull(release.endDate);
  const sunday = monday + 6;
  let starts = false;
  let ends = false;
  if (start !== null && end !== null) {
    if (end < start || end < monday || start > sunday) return null;
    starts = start >= monday;
    ends = end <= sunday;
  } else if (start !== null) {
    if (start < monday || start > sunday) return null;
    starts = true;
  } else if (end !== null) {
    if (end < monday || end > sunday) return null;
    ends = true;
  } else {
    return null;
  }
  return { release, startsThisWeek: starts, endsThisWeek: ends, percent: releasePercent(release) };
}

export function buildSchedule(input: {
  cards: readonly WikiBoardCard[];
  releases: readonly WikiBoardRelease[];
  keyDates: readonly WikiBoardKeyDate[];
  /** Today, as a day number. */
  today: number;
  mode: ScheduleMode;
  /** How many weeks to show. */
  weeks: number;
}): Schedule {
  const { cards, releases, keyDates, today, mode } = input;
  const count = Math.max(1, Math.floor(input.weeks));
  const thisMonday = mondayOnOrBefore(today);
  // Upcoming runs forward from this week; Past runs back from last week, newest first.
  const mondays =
    mode === "upcoming"
      ? Array.from({ length: count }, (_, i) => thisMonday + i * 7)
      : Array.from({ length: count }, (_, i) => thisMonday - (i + 1) * 7);
  const first = Math.min(...mondays);
  const last = Math.max(...mondays) + 6;

  const overdue: ScheduleDue[] = [];
  const dueByWeek = new Map<number, ScheduleDue[]>();
  const eventsByWeek = new Map<number, ScheduleEvent[]>();
  const keyByWeek = new Map<number, ScheduleKeyDate[]>();
  const push = <T>(map: Map<number, T[]>, monday: number, value: T) => {
    const list = map.get(monday);
    if (list) list.push(value);
    else map.set(monday, [value]);
  };
  let beyond = false;
  const note = (day: number) => {
    if (mode === "upcoming" ? day > last : day < first) beyond = true;
  };

  for (const card of cards) {
    const due = dayOrNull(card.dueDate);
    if (due !== null) {
      if (!isDone(card) && due < today) {
        // Overdue lives above the weeks, once, in the Upcoming view only.
        if (mode === "upcoming") overdue.push({ card, day: due });
        else push(dueByWeek, mondayOnOrBefore(due), { card, day: due });
      } else {
        push(dueByWeek, mondayOnOrBefore(due), { card, day: due });
      }
      note(due);
    }
    for (const e of cardEvents(card)) {
      // What happened is the past: a stage dated in the future is somebody's plan, not an event.
      if (e.day > today) continue;
      push(eventsByWeek, mondayOnOrBefore(e.day), { card, label: e.label, day: e.day });
      note(e.day);
    }
  }
  for (const k of keyDates) {
    const day = dayOrNull(k.date);
    if (day === null) continue;
    push(keyByWeek, mondayOnOrBefore(day), { keyDate: k, day });
    note(day);
  }
  for (const r of releases) {
    for (const d of [dayOrNull(r.startDate), dayOrNull(r.endDate)]) if (d !== null) note(d);
  }

  const byDayThenTitle = <T extends { day: number }>(title: (x: T) => string) => (a: T, b: T) =>
    a.day - b.day || title(a).localeCompare(title(b));

  const weeks: ScheduleWeek[] = mondays.map((monday) => {
    const weekReleases = releases
      .map((r) => releaseInWeek(r, monday))
      .filter((r): r is ScheduleRelease => r !== null);
    const due = (dueByWeek.get(monday) ?? []).sort(byDayThenTitle((x) => x.card.title));
    const happened = (eventsByWeek.get(monday) ?? []).sort(byDayThenTitle((x) => `${x.card.title} ${x.label}`));
    const keys = (keyByWeek.get(monday) ?? []).sort(byDayThenTitle((x) => x.keyDate.title));
    return {
      monday,
      isCurrent: monday === thisMonday,
      releases: weekReleases,
      due,
      happened,
      keyDates: keys,
      empty: !weekReleases.length && !due.length && !happened.length && !keys.length,
    };
  });

  const undated = cards
    .filter((c) => !c.dueDate && !isDone(c) && clientMayActOn(c))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    overdue: overdue.sort(byDayThenTitle((x) => x.card.title)),
    weeks,
    undated,
    hasMore: beyond,
  };
}

export type ScheduleRow =
  | { kind: "week"; week: ScheduleWeek }
  /** A run of weeks with nothing in them, shown as one quiet line ("3 quiet weeks"). */
  | { kind: "quiet"; weeks: ScheduleWeek[] };

/**
 * The weeks as rows, with each run of empty weeks folded into one quiet line, so twelve weeks of
 * mostly nothing doesn't fill the screen with blank rows. This week is always a row of its own,
 * even when empty: it's where "today" is.
 */
export function scheduleRows(weeks: readonly ScheduleWeek[]): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const week of weeks) {
    if (!week.empty || week.isCurrent) {
      rows.push({ kind: "week", week });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && last.kind === "quiet") last.weeks.push(week);
    else rows.push({ kind: "quiet", weeks: [week] });
  }
  return rows;
}

/** Today as a day number, in UTC like every other Board date. */
export function todayDay(now: Date = new Date()): number {
  return dayOf(now);
}
