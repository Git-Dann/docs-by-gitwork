/**
 * Estimates — turn effort into a timeline for each team size, and lay it on a calendar.
 *
 * Pure: no React, no Prisma, no clock except the `today` a caller passes in. The section,
 * the editor's live preview and the dashboard card all read it, so they cannot disagree.
 *
 * ── The model, and why it is not "effort ÷ developers" ────────────────────────
 * Dividing effort by head count is the estimate clients have been burned by. Two things
 * stop extra people being free, and both are modelled:
 *
 *  1. **Coordination.** Every extra developer adds overhead — handover, review, merge
 *     conflicts, meetings. Team throughput is `n / (1 + k·(n − 1))`: one developer is
 *     1.0, and each addition is worth a little less than the last. At the typical
 *     k = 0.15, two developers deliver 1.74× and four deliver 2.76×, never 4×.
 *  2. **Phases that cannot be split.** A phase may cap how many people it can use
 *     (`maxDevs`). Above the cap that phase runs at the capped speed whatever the team.
 *
 * So the curve flattens, and the page says where it stops paying — "no faster than 3
 * developers" is a more useful sentence to a client than a fifth bar that looks shorter
 * because the arithmetic was naive.
 *
 * Phases run in sequence. Each is rounded UP to whole working days, which keeps adjacent
 * bars from overlapping and errs in the direction a client will forgive.
 *
 * Working days are Monday to Friday, laid on the real calendar — every date is an actual
 * date, and every duration is measured between real dates using each month's own length.
 * Bank holidays and leave are NOT removed — the page states that rather than implying a
 * calendar it does not have.
 */

import type { Estimate, EstimateCoordination, EstimatePhase } from "@/types/wiki-estimates";

export const COORDINATION_OVERHEAD: Record<EstimateCoordination, number> = {
  LOW: 0.08,
  TYPICAL: 0.15,
  HIGH: 0.25,
};

export const COORDINATION_LABEL: Record<EstimateCoordination, string> = {
  LOW: "Low",
  TYPICAL: "Typical",
  HIGH: "High",
};

/** Limits shared by the validator and the editor, so neither can drift from the other. */
export const ESTIMATE_LIMITS = {
  maxPhases: 12,
  // Up to 8 rows on the calendar — enough to compare a small squad with a large one
  // without the chart becoming the long list this page exists to avoid.
  maxTeamSizes: 8,
  maxTeam: 15,
  maxEffortDays: 2000,
  maxContingencyPct: 100,
} as const;

/** A team of `devs` delivers this many developer-days of work per working day. */
export function teamThroughput(devs: number, overhead: number): number {
  if (!(devs >= 1)) return 0;
  return devs / (1 + overhead * (devs - 1));
}

// ─── Dates (UTC, date-only) ──────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject 2026-02-31, which Date would silently roll into March.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function isWeekend(date: Date): boolean {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

/** The date itself if it is a weekday, else the following Monday. */
export function firstWorkingDay(date: Date): Date {
  let d = utcDay(date);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** The Monday after `today` — or `today` itself when it is a Monday. */
export function nextMonday(today: Date): Date {
  let d = utcDay(today);
  while (d.getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

/** The date of the `index`-th working day counting `start` (a weekday) as day 0. */
export function workdayDate(start: Date, index: number): Date {
  let d = firstWorkingDay(start);
  let left = Math.max(0, Math.floor(index));
  // Whole weeks first, so a year-long plan is not a 250-step loop per bar.
  const weeks = Math.floor(left / 5);
  d = addDays(d, weeks * 7);
  left -= weeks * 5;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left -= 1;
  }
  return d;
}

// ─── Planning ────────────────────────────────────────────────────────────────────

export interface PhasePlan {
  id: string;
  name: string;
  /** How many of the team this phase actually uses — the team, or its cap. */
  devsUsed: number;
  workingDays: number;
  /** First working day of the phase. */
  start: Date;
  /** Last working day of the phase (inclusive). */
  end: Date;
}

export interface EstimatePlan {
  devs: number;
  workingDays: number;
  /** Working days including contingency — the end of the shaded tail. */
  upperWorkingDays: number;
  start: Date;
  /** Last working day of the work (inclusive). */
  end: Date;
  /** Last working day once contingency is spent (inclusive). */
  upperEnd: Date;
  phases: PhasePlan[];
  /**
   * Set when this team is no faster than a smaller one in the comparison — every phase
   * is at its cap. The value is that smaller team size.
   */
  noFasterThan: number | null;
}

/** Phases that contribute to a timeline: named, with positive effort. */
export function plannablePhases(phases: EstimatePhase[]): EstimatePhase[] {
  return phases.filter((p) => p.name.trim() && Number.isFinite(p.effortDays) && p.effortDays > 0);
}

export function totalEffortDays(phases: EstimatePhase[]): number {
  return plannablePhases(phases).reduce((sum, p) => sum + p.effortDays, 0);
}

/** Whether an estimate has anything to show. An empty one states nothing. */
export function isPlannable(estimate: Pick<Estimate, "phases" | "teamSizes">): boolean {
  return plannablePhases(estimate.phases).length > 0 && estimate.teamSizes.length > 0;
}

export function planForTeam(
  estimate: Pick<Estimate, "phases" | "coordination" | "contingencyPct">,
  devs: number,
  start: Date,
): EstimatePlan {
  const overhead = COORDINATION_OVERHEAD[estimate.coordination] ?? COORDINATION_OVERHEAD.TYPICAL;
  const first = firstWorkingDay(start);
  let cursor = 0;
  const phases: PhasePlan[] = [];
  for (const p of plannablePhases(estimate.phases)) {
    const devsUsed = Math.max(1, Math.min(devs, p.maxDevs ?? devs));
    const days = Math.max(1, Math.ceil(p.effortDays / teamThroughput(devsUsed, overhead) - 1e-9));
    phases.push({
      id: p.id,
      name: p.name.trim(),
      devsUsed,
      workingDays: days,
      start: workdayDate(first, cursor),
      end: workdayDate(first, cursor + days - 1),
    });
    cursor += days;
  }
  const workingDays = cursor;
  const pct = Math.min(Math.max(estimate.contingencyPct, 0), ESTIMATE_LIMITS.maxContingencyPct);
  const upperWorkingDays = workingDays > 0 ? Math.ceil(workingDays * (1 + pct / 100) - 1e-9) : 0;
  return {
    devs,
    workingDays,
    upperWorkingDays,
    start: first,
    end: workingDays > 0 ? workdayDate(first, workingDays - 1) : first,
    upperEnd: upperWorkingDays > 0 ? workdayDate(first, upperWorkingDays - 1) : first,
    phases,
    noFasterThan: null,
  };
}

export interface EstimateReadout {
  /** Where the plans start. */
  start: Date;
  /** False when no start date is agreed — the page must say "if we start …". */
  startAgreed: boolean;
  /** One plan per team size, ascending. */
  plans: EstimatePlan[];
  /** The plan the page opens on. */
  recommended: EstimatePlan | null;
  totalEffortDays: number;
}

export function buildEstimateReadout(estimate: Estimate, today: Date): EstimateReadout {
  const agreed = parseIsoDate(estimate.startDate);
  const start = agreed ? firstWorkingDay(agreed) : nextMonday(today);
  const sizes = normaliseTeamSizes(estimate.teamSizes);
  const plans = isPlannable({ phases: estimate.phases, teamSizes: sizes })
    ? sizes.map((n) => planForTeam(estimate, n, start))
    : [];
  // Flag a team that buys nothing over a smaller one. Compared with the SMALLEST team that
  // already achieves the same duration, so "no faster than 3" never reads "no faster than 4"
  // when 3 and 4 and 5 all tie.
  for (let i = 1; i < plans.length; i += 1) {
    const first = plans.find((p) => p.workingDays === plans[i].workingDays);
    if (first && first.devs < plans[i].devs) plans[i].noFasterThan = first.devs;
  }
  const recommended =
    plans.find((p) => p.devs === estimate.recommendedTeam) ?? plans[0] ?? null;
  return {
    start,
    startAgreed: Boolean(agreed),
    plans,
    recommended,
    totalEffortDays: totalEffortDays(estimate.phases),
  };
}

/** Unique, ascending, in range. Anything else in storage is dropped rather than drawn. */
export function normaliseTeamSizes(sizes: number[]): number[] {
  return [...new Set(sizes.filter((n) => Number.isInteger(n) && n >= 1 && n <= ESTIMATE_LIMITS.maxTeam))]
    .sort((a, b) => a - b)
    .slice(0, ESTIMATE_LIMITS.maxTeamSizes);
}

// ─── Wording ─────────────────────────────────────────────────────────────────────

/** What a duration is measured over: the first and last working day, and the count. */
export type DurationSpan = Pick<EstimatePlan, "start" | "end" | "workingDays">;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `date` moved `months` calendar months on, clamped to the target month's last day. */
function addCalendarMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const day = Math.min(date.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
}

/**
 * Calendar months from `start` up to the END of `last`, using each month's real length:
 * whole months first, then the remainder as a fraction of the month it falls in. So
 * 2 Nov → 21 Jan is 2 months and 20 of January's 31 days, not 81 ÷ 30.4.
 */
export function calendarMonthsBetween(start: Date, last: Date): number {
  const endExclusive = addDays(last, 1);
  let whole = 0;
  while (addCalendarMonths(start, whole + 1) <= endExclusive) whole += 1;
  const from = addCalendarMonths(start, whole);
  const remainder = (endExclusive.getTime() - from.getTime()) / DAY_MS;
  return whole + remainder / daysInMonth(from.getUTCFullYear(), from.getUTCMonth());
}

/**
 * A duration in the unit a client thinks in, measured on the REAL calendar between the
 * first and last working day — not working days divided by an average month. Weekends
 * inside the span count, because the client reads "12 weeks" against their own diary.
 *
 *  · under 10 working days → working days (Monday to Friday)
 *  · up to 26 calendar weeks → weeks, rounded UP
 *  · beyond → calendar months, rounded UP to the half — "4 months" stated for 4.4
 *    reads as a promise
 */
export function formatPlanDuration(span: DurationSpan): string {
  const { workingDays } = span;
  if (workingDays <= 0) return "—";
  if (workingDays < 10) return `${workingDays} working day${workingDays === 1 ? "" : "s"}`;
  const calendarDays = Math.round((addDays(span.end, 1).getTime() - span.start.getTime()) / DAY_MS);
  if (calendarDays <= 26 * 7) return `${Math.ceil(calendarDays / 7)} weeks`;
  const halves = Math.ceil(calendarMonthsBetween(span.start, span.end) * 2 - 1e-9);
  const whole = Math.floor(halves / 2);
  return `${whole}${halves % 2 ? "½" : ""} months`;
}

/** The figure and unit split, for the serif-figure / mono-unit house grammar. */
export function planDurationParts(span: DurationSpan): { figure: string; unit: string } {
  const text = formatPlanDuration(span);
  const space = text.indexOf(" ");
  return space === -1 ? { figure: text, unit: "" } : { figure: text.slice(0, space), unit: text.slice(space + 1) };
}

export function teamLabel(devs: number): string {
  return `${devs} developer${devs === 1 ? "" : "s"}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SHORT_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatDate(date: Date): string {
  return DATE_FMT.format(date);
}
export function formatShortDate(date: Date): string {
  return SHORT_FMT.format(date);
}
export function formatWeekdayDate(date: Date): string {
  return WEEKDAY_FMT.format(date);
}

// ─── Calendar ────────────────────────────────────────────────────────────────────

export type CalendarZoom = "week" | "month" | "half" | "year";

export const CALENDAR_ZOOMS: { value: CalendarZoom; label: string; short: string }[] = [
  { value: "week", label: "Week", short: "W" },
  { value: "month", label: "Month", short: "M" },
  { value: "half", label: "6 months", short: "6M" },
  { value: "year", label: "Year", short: "Y" },
];

export interface CalendarWindow {
  /** Inclusive first day. */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}
function mondayOnOrBefore(date: Date): Date {
  let d = utcDay(date);
  while (d.getUTCDay() !== 1) d = addDays(d, -1);
  return d;
}

/** Each zoom's span in days. Whole weeks, so every window starts and ends on a Monday. */
export const ZOOM_DAYS: Record<CalendarZoom, number> = {
  week: 7,
  // Six weeks, like a month grid — a five-week plan plus its contingency tail fits.
  month: 42,
  half: 182,
  year: 364,
};

/**
 * The window shown at a zoom, `page` steps from the one holding `anchor`.
 *
 * ⚠️ Anchored on the Monday of the start week, NOT on the 1st of the month. A calendar-
 * month window looked tidier and was wrong: a five-week plan starting 19 October does not
 * fit "October", so it fell through to a six-month axis that was mostly empty — the
 * opposite of what the zoom is for. Starting the window where the work starts means each
 * zoom shows the plan from its first day.
 */
export function calendarWindow(zoom: CalendarZoom, anchor: Date, page: number): CalendarWindow {
  const span = ZOOM_DAYS[zoom];
  const from = addDays(mondayOnOrBefore(anchor), page * span);
  return { from, to: addDays(from, span) };
}

/** The smallest zoom whose first window holds every plan's contingency tail. */
export function fittingZoom(start: Date, latestEnd: Date): CalendarZoom {
  for (const zoom of ["week", "month", "half", "year"] as const) {
    if (calendarWindow(zoom, start, 0).to.getTime() > latestEnd.getTime()) return zoom;
  }
  return "year";
}

export interface CalendarTick {
  date: Date;
  /** Position across the window, 0–100. */
  pct: number;
  label: string;
  /** Narrow-screen label. */
  short: string;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

export function calendarTicks(zoom: CalendarZoom, win: CalendarWindow): CalendarTick[] {
  const ticks: CalendarTick[] = [];
  const push = (date: Date, label: string, short: string) =>
    ticks.push({ date, pct: positionPct(date, win), label, short });
  if (zoom === "week") {
    for (let d = win.from; d < win.to; d = addDays(d, 1)) {
      push(d, `${DAY_FMT.format(d)} ${d.getUTCDate()}`, DAY_FMT.format(d).slice(0, 1));
    }
  } else if (zoom === "month") {
    // Mondays: four or five ticks read as weeks, which is how a month gets planned.
    let d = utcDay(win.from);
    while (d.getUTCDay() !== 1) d = addDays(d, 1);
    for (; d < win.to; d = addDays(d, 7)) push(d, formatShortDate(d), String(d.getUTCDate()));
  } else {
    // The 1st of each month inside the window — the window itself starts on a Monday.
    for (let d = addMonths(win.from, win.from.getUTCDate() === 1 ? 0 : 1); d < win.to; d = addMonths(d, 1)) {
      const name = MONTH_FMT.format(d);
      push(d, d.getUTCMonth() === 0 ? `${name} ${d.getUTCFullYear()}` : name, name.slice(0, 1));
    }
  }
  return ticks;
}

/** Where a date sits across the window, clamped to 0–100. */
export function positionPct(date: Date, win: CalendarWindow): number {
  const span = win.to.getTime() - win.from.getTime();
  const pct = ((date.getTime() - win.from.getTime()) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

export interface CalendarBar {
  left: number;
  width: number;
  /** The bar carries on past the window's right edge. */
  continues: boolean;
  /** The bar started before the window's left edge. */
  continued: boolean;
}

/**
 * A span of working days [first, last] (both inclusive) placed on the window. Null when
 * it falls entirely outside. The bar runs to the END of its last day, so a one-day phase
 * is a day wide rather than a hairline.
 */
export function placeSpan(first: Date, last: Date, win: CalendarWindow): CalendarBar | null {
  const endExclusive = addDays(last, 1);
  if (endExclusive <= win.from || first >= win.to) return null;
  const left = positionPct(first, win);
  const right = positionPct(endExclusive, win);
  return {
    left,
    width: Math.max(right - left, 0.4),
    continues: endExclusive > win.to,
    continued: first < win.from,
  };
}

/** Human label for a window, e.g. "w/c 19 Oct", "19 Oct – 22 Nov 2026". */
export function windowLabel(zoom: CalendarZoom, win: CalendarWindow): string {
  const last = addDays(win.to, -1);
  if (zoom === "week") return `w/c ${formatShortDate(win.from)}`;
  const sameYear = win.from.getUTCFullYear() === last.getUTCFullYear();
  return `${sameYear ? formatShortDate(win.from) : formatDate(win.from)} – ${formatDate(last)}`;
}
