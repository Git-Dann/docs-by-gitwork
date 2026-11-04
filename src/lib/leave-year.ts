/**
 * Which holiday year someone is in.
 *
 * Asked for by Dan (Nov 2026): Gitwork staff's holidays run from their start date, so a
 * person's year begins on the anniversary of the day they joined. Someone with no start
 * date on their Staff record keeps the calendar year, as everyone did before.
 *
 * Pure and date-only (UTC midnight), so the server's allowance and anything that shows the
 * period agree to the day.
 */

export type LeaveYear = {
  /** First day of the year, UTC midnight. */
  start: Date;
  /** Last day of the year, UTC midnight (inclusive). */
  end: Date;
  /** True when it runs from a start date, false for the calendar year. */
  fromStartDate: boolean;
};

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The anniversary of `start` in `year`. 29 February falls on 28 February in a year that
 * has no 29th, rather than rolling into March.
 */
export function anniversaryIn(start: Date, year: number): Date {
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastOfMonth)));
}

function dayBefore(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

export function leaveYearFor(startDate: Date | null | undefined, today: Date = new Date()): LeaveYear {
  const now = utcDay(today);
  if (!startDate || Number.isNaN(startDate.getTime())) {
    const y = now.getUTCFullYear();
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: new Date(Date.UTC(y, 11, 31)),
      fromStartDate: false,
    };
  }
  const joined = utcDay(startDate);
  // Not started yet: their first year begins on the day they join.
  if (joined.getTime() > now.getTime()) {
    return { start: joined, end: dayBefore(anniversaryIn(joined, joined.getUTCFullYear() + 1)), fromStartDate: true };
  }
  let start = anniversaryIn(joined, now.getUTCFullYear());
  if (start.getTime() > now.getTime()) start = anniversaryIn(joined, now.getUTCFullYear() - 1);
  // The first year starts on the joining day itself, never an anniversary before it.
  if (start.getTime() < joined.getTime()) start = joined;
  const end = dayBefore(anniversaryIn(joined, start.getUTCFullYear() + 1));
  return { start, end, fromStartDate: true };
}

/** "14 Mar 2026 – 13 Mar 2027", for showing which year an allowance covers. */
export function formatLeaveYear(year: { start?: string | Date | null; end?: string | Date | null }): string {
  const start = year.start ? new Date(year.start) : null;
  const end = year.end ? new Date(year.end) : null;
  // Intl throws on an invalid date, so a missing or bad value renders nothing, never a crash.
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
