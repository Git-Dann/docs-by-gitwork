/**
 * The Board's Timeline view (src/components/clients/wiki/wiki-board-timeline.tsx): releases as
 * bars on a calendar, each release's cards beneath it, like the planning site Big Wedge used
 * before Foundry. Pure layout maths, so it can be tested without a browser.
 *
 * Every date is a calendar day in UTC. Release dates are stored as midnight UTC, and working in
 * whole days means a bar never slips a column because of the viewer's time zone.
 */

import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

export type TimelineScale = "weeks" | "months";

/** Horizontal pixels per day at each scale. A week is 140px wide at "weeks". */
export const PX_PER_DAY: Record<TimelineScale, number> = { weeks: 20, months: 5 };

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar day as a whole number (days since 1 Jan 1970, UTC). */
export function dayOf(value: string | Date): number {
  const d = typeof value === "string" ? new Date(value) : value;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

function dateOf(day: number): Date {
  return new Date(day * DAY_MS);
}

/** The Monday on or before a day. 1 Jan 1970 was a Thursday, so day 4 is a Monday. */
export function mondayOnOrBefore(day: number): number {
  return day - ((((day - 4) % 7) + 7) % 7);
}

function firstOfMonth(day: number): number {
  const d = dateOf(day);
  return dayOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function firstOfNextMonth(day: number): number {
  const d = dateOf(day);
  return dayOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

export interface TimelineRange {
  /** First day drawn (inclusive). */
  start: number;
  /** Day after the last day drawn (exclusive). */
  end: number;
}

/**
 * The days the timeline spans: every dated release, plus at least two weeks before today and
 * four weeks after, so "today" always has room either side. Snapped to whole weeks (Mondays) or
 * whole months, so columns start on a clean edge.
 */
export function timelineRange(
  releases: ReadonlyArray<Pick<WikiBoardRelease, "startDate" | "endDate">>,
  today: number,
  scale: TimelineScale,
): TimelineRange {
  let lo = today - 14;
  let hi = today + 28;
  for (const r of releases) {
    if (r.startDate) lo = Math.min(lo, dayOf(r.startDate));
    if (r.endDate) hi = Math.max(hi, dayOf(r.endDate));
  }
  if (scale === "weeks") {
    const start = mondayOnOrBefore(lo);
    const end = mondayOnOrBefore(hi) + 7;
    return { start, end };
  }
  return { start: firstOfMonth(lo), end: firstOfNextMonth(hi) };
}

export interface TimelineColumn {
  day: number;
  x: number;
  width: number;
  label: string;
}

/** Week columns (one per Monday, "1 Nov") or month columns ("Nov"), with their x and width. */
export function timelineColumns(range: TimelineRange, scale: TimelineScale): TimelineColumn[] {
  const px = PX_PER_DAY[scale];
  const out: TimelineColumn[] = [];
  if (scale === "weeks") {
    for (let day = range.start; day < range.end; day += 7) {
      const d = dateOf(day);
      out.push({ day, x: (day - range.start) * px, width: 7 * px, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
    }
    return out;
  }
  for (let day = range.start; day < range.end; day = firstOfNextMonth(day)) {
    const next = Math.min(firstOfNextMonth(day), range.end);
    out.push({ day, x: (day - range.start) * px, width: (next - day) * px, label: MONTHS[dateOf(day).getUTCMonth()] });
  }
  return out;
}

/** Quarter bands for the header's top row ("Q4 2026"), clipped to the range. */
export function quarterBands(range: TimelineRange, scale: TimelineScale): TimelineColumn[] {
  const px = PX_PER_DAY[scale];
  const out: TimelineColumn[] = [];
  let day = range.start;
  while (day < range.end) {
    const d = dateOf(day);
    const q = Math.floor(d.getUTCMonth() / 3);
    const next = dayOf(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 1)));
    const stop = Math.min(next, range.end);
    out.push({ day, x: (day - range.start) * px, width: (stop - day) * px, label: `Q${q + 1} ${d.getUTCFullYear()}` });
    day = stop;
  }
  return out;
}

/**
 * Where a span sits: its left edge and width in pixels. The end date is inclusive (a release
 * ending on the 9th covers the whole of the 9th). Clipped to the range; null when it falls
 * entirely outside it. Never narrower than one day, so a single-day span still shows.
 */
export function spanX(
  startDate: string | null,
  endDate: string | null,
  range: TimelineRange,
  scale: TimelineScale,
): { x: number; width: number } | null {
  if (!startDate && !endDate) return null;
  const px = PX_PER_DAY[scale];
  const a = dayOf((startDate ?? endDate) as string);
  const b = dayOf((endDate ?? startDate) as string);
  const from = Math.max(Math.min(a, b), range.start);
  const to = Math.min(Math.max(a, b) + 1, range.end);
  if (to <= range.start || from >= range.end || to <= from) return null;
  return { x: (from - range.start) * px, width: Math.max(px, (to - from) * px) };
}

/** Today's x, or null when today isn't on the drawn range. */
export function todayX(today: number, range: TimelineRange, scale: TimelineScale): number | null {
  if (today < range.start || today >= range.end) return null;
  return (today - range.start) * PX_PER_DAY[scale];
}

/** Where to scroll on open: today about a third of the way in from the left. */
export function initialScrollLeft(today: number | null, viewport: number): number {
  return today === null ? 0 : Math.max(0, Math.round(today - viewport / 3));
}

/** Done cards over all of the client's cards in a release. Null when it has none (not 100%). */
export function releasePercent(r: Pick<WikiBoardRelease, "cards" | "done">): number | null {
  return r.cards > 0 ? Math.round((r.done / r.cards) * 100) : null;
}

/**
 * Where a release stands, for the Timeline's filters and markers:
 * - "complete": it has cards and every one is done.
 * - "behind": its end date has passed and cards are still waiting: not done, and not approved.
 * - "open": anything else (not finished, not late, or no end date).
 * Counted from the release's own totals (every client card, before a Done column is capped).
 * `approvedOpen` is how many of its not-done cards the client has approved: those are signed off,
 * so they don't make a release late (Dan, Nov 2026).
 */
export type ReleaseState = "complete" | "behind" | "open";

export function releaseState(
  r: Pick<WikiBoardRelease, "cards" | "done" | "endDate">,
  today: number,
  approvedOpen = 0,
): ReleaseState {
  if (r.cards > 0 && r.done >= r.cards) return "complete";
  const waiting = r.cards - r.done - approvedOpen;
  if (r.endDate && dayOf(r.endDate) < today && waiting > 0) return "behind";
  return "open";
}

/** How many cards in each release are approved but not done, from the cards in hand. Every
 *  not-done card is always sent (only Done columns are capped), so this count is complete. */
export function approvedOpenByRelease(cards: readonly WikiBoardCard[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cards) {
    if (!c.release || c.status === "DONE" || c.signOff !== "approved") continue;
    out.set(c.release.id, (out.get(c.release.id) ?? 0) + 1);
  }
  return out;
}

/** Cards that are still waiting in a release: not done and not approved. */
export function waitingCount(r: Pick<WikiBoardRelease, "cards" | "done">, approvedOpen: number): number {
  return Math.max(0, r.cards - r.done - approvedOpen);
}

/**
 * A card that's late: not done, not approved, and its OWN due date has passed. A card in a late
 * release isn't flagged one by one: the release bar says it once (flagging every card turned the
 * whole timeline red).
 */
export function cardBehind(
  card: Pick<WikiBoardCard, "status" | "dueDate" | "signOff">,
  _release: Pick<WikiBoardRelease, "endDate"> | null,
  today: number,
): boolean {
  if (card.status === "DONE" || card.signOff === "approved") return false;
  return Boolean(card.dueDate && dayOf(card.dueDate) < today);
}

export interface TimelineGroup {
  /** Null = cards with no release. */
  release: WikiBoardRelease | null;
  cards: WikiBoardCard[];
}

export interface TimelineFilter {
  today: number;
  /** Show releases whose cards are all done, and done cards with no release. Off by default. */
  showCompleted: boolean;
  /** Show cards the client has approved. Off by default: they're signed off. */
  showApproved?: boolean;
  /** Only what's late: behind releases, and late cards. */
  onlyBehind: boolean;
}

/**
 * Rows, in order: dated releases by start date, then releases with no dates, then cards with no
 * release. Only releases with a card in view are shown, so a filter narrows the timeline as it
 * narrows the board. Cards within a release keep the board's order.
 *
 * With a filter: completed releases (and done cards with no release) are left out unless
 * `showCompleted`; `onlyBehind` keeps only late cards and the releases that hold them.
 */
export function timelineGroups(
  cards: readonly WikiBoardCard[],
  releases: readonly WikiBoardRelease[],
  filter?: TimelineFilter,
): TimelineGroup[] {
  const known = new Map(releases.map((r) => [r.id, r]));
  const approved = approvedOpenByRelease(cards);
  const byRelease = new Map<string, WikiBoardCard[]>();
  const loose: WikiBoardCard[] = [];
  for (const c of cards) {
    const r = c.release ? known.get(c.release.id) : undefined;
    if (filter) {
      const state = r ? releaseState(r, filter.today, approved.get(r.id) ?? 0) : null;
      if (filter.onlyBehind && !(cardBehind(c, r ?? null, filter.today) || (state === "behind" && c.status !== "DONE" && c.signOff !== "approved"))) continue;
      if (!filter.showCompleted && (r ? state === "complete" : c.status === "DONE")) continue;
      if (!filter.showApproved && c.signOff === "approved") continue;
    }
    if (!r) loose.push(c);
    else byRelease.set(r.id, [...(byRelease.get(r.id) ?? []), c]);
  }
  const startOf = (r: WikiBoardRelease) => (r.startDate ? dayOf(r.startDate) : r.endDate ? dayOf(r.endDate) : Infinity);
  const ordered: TimelineGroup[] = releases
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => byRelease.has(r.id))
    .sort((a, b) => startOf(a.r) - startOf(b.r) || a.i - b.i)
    .map(({ r }) => ({ release: r, cards: [...(byRelease.get(r.id) ?? [])].sort((a, b) => a.orderKey - b.orderKey) }));
  if (loose.length) ordered.push({ release: null, cards: [...loose].sort((a, b) => a.orderKey - b.orderKey) });
  return ordered;
}

/** How many of the releases holding these cards are complete, and how many are behind. */
export function timelineCounts(
  cards: readonly WikiBoardCard[],
  releases: readonly WikiBoardRelease[],
  today: number,
): { completed: number; behind: number; approved: number } {
  const inView = new Set(cards.map((c) => c.release?.id).filter(Boolean) as string[]);
  const approvedOpen = approvedOpenByRelease(cards);
  let completed = 0;
  let behind = 0;
  for (const r of releases) {
    if (!inView.has(r.id)) continue;
    const st = releaseState(r, today, approvedOpen.get(r.id) ?? 0);
    if (st === "complete") completed++;
    else if (st === "behind") behind++;
  }
  return { completed, behind, approved: cards.filter((c) => c.signOff === "approved").length };
}
