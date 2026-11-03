/**
 * Calendar dates as `YYYY-MM-DD` strings — the value a native `<input type="date">` holds,
 * and the contract `DatePicker` keeps so it can replace one without touching its caller.
 *
 * ⚠️ A calendar date is not an instant. The traps this file exists to avoid:
 *
 * - `new Date("2026-03-29")` is UTC midnight, so reading it back with local getters (or
 *   formatting it in the viewer's zone) gives 28 March anywhere west of Greenwich.
 * - Adding 86,400,000 ms to a local midnight lands at 23:00 the same day on the night the
 *   clocks go back, so "tomorrow" is today.
 *
 * So: a string becomes a LOCAL-midnight `Date` built from its year/month/day fields
 * (`isoToDate`) and goes back through those same fields (`dateToISO`) — never through
 * `toISOString()` — and any stepping is done on fields (`new Date(y, m, d + 1)`), which the
 * vendored EasyUI calendar already does. Display formatting runs in UTC on a UTC-built
 * date, so the viewer's zone can't move it either.
 *
 * Pure, framework-free, no dependencies.
 */

export type CalendarParts = { year: number; month: number; day: number };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a month (`month` 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `"2026-11-03"` → `{ year: 2026, month: 11, day: 3 }`. Anything else — a full ISO
 * timestamp, `"2026-02-30"`, `""` — is `null`, exactly as a native date input shows an
 * invalid value as empty rather than guessing.
 */
export function parseISODate(value: string | null | undefined): CalendarParts | null {
  if (!value) return null;
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isISODate(value: string | null | undefined): value is string {
  return parseISODate(value) !== null;
}

/** `{ 2026, 11, 3 }` → `"2026-11-03"`. */
export function formatISODate({ year, month, day }: CalendarParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `"2026-11-03"` → local midnight on 3 Nov 2026. Throws on an invalid string. */
export function isoToDate(iso: string): Date {
  const p = parseISODate(iso);
  if (!p) throw new Error(`Not a calendar date: ${iso}`);
  return new Date(p.year, p.month - 1, p.day);
}

/** A `Date` → the calendar day it falls on in local time, as `YYYY-MM-DD`. */
export function dateToISO(date: Date): string {
  return formatISODate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/** True when `iso` falls inside `[min, max]`. An empty bound is no bound. */
export function isWithinBounds(iso: string, min?: string | null, max?: string | null): boolean {
  if (isISODate(min) && iso < min) return false;
  if (isISODate(max) && iso > max) return false;
  return true;
}

/**
 * Today as the user's own clock reads it — a deadline set "today" at 00:30 in Auckland is
 * the 4th there, whatever UTC says.
 */
export function todayISO(now: Date = new Date()): string {
  return dateToISO(now);
}

const DISPLAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** `"2026-11-03"` → `"3 Nov 2026"`. Formatted in UTC, so the viewer's zone can't move it. */
export function formatDisplayDate(iso: string): string {
  const p = parseISODate(iso);
  if (!p) throw new Error(`Not a calendar date: ${iso}`);
  return DISPLAY.format(new Date(Date.UTC(p.year, p.month - 1, p.day)));
}
