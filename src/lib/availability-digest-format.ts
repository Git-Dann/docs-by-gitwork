// The words of the morning "who's off" Slack post (src/server/availability-digest.ts).
// Pure: no database, no Slack, so every wording rule here is tested.
//
// What the post has to make obvious, because people misread the old one:
//   - which week or day it is about, and that it comes from approved leave in Backstage
//     (not from anyone's calendar);
//   - the exact day(s) each person is off, written once ("Wed 11 Nov", never "11 Nov–11 Nov");
//   - whether it is a half day ("½ day"), so a half day doesn't read as a whole one;
//   - when they're back, for anything longer than a half day.

export type DigestMode = "daily" | "weekly";

export interface DigestLeave {
  name: string;
  type: string; // LeaveType: ANNUAL | SICK | UNPAID | OTHER
  startDate: Date;
  endDate: Date;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}

const KIND: Record<string, string> = {
  ANNUAL: "holiday",
  SICK: "sick leave",
  UNPAID: "unpaid leave",
  OTHER: "leave",
};

const DAY = 86_400_000;

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(utcDay(d).getTime() + n * DAY);
}
function isWeekend(d: Date): boolean {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}
function sameDay(a: Date, b: Date): boolean {
  return utcDay(a).getTime() === utcDay(b).getTime();
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** "Wed 11 Nov" (adds the year only when it isn't `yearOf`'s). */
export function dayLabel(d: Date, yearOf?: Date): string {
  const base = `${WEEKDAY.format(d)} ${d.getUTCDate()} ${MONTH.format(d)}`;
  return yearOf && yearOf.getUTCFullYear() !== d.getUTCFullYear() ? `${base} ${d.getUTCFullYear()}` : base;
}

/** One day once; a range without repeating a shared month: "Mon 9 – Fri 13 Nov", "Fri 30 Oct – Tue 3 Nov". */
export function rangeLabel(from: Date, to: Date, yearOf?: Date): string {
  if (sameDay(from, to)) return dayLabel(from, yearOf);
  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();
  const left = sameMonth ? `${WEEKDAY.format(from)} ${from.getUTCDate()}` : dayLabel(from, yearOf);
  return `${left} – ${dayLabel(to, yearOf)}`;
}

/** Monday (UTC) of the week holding `d`. */
export function mondayOf(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

/** First weekday after `d`. */
export function nextWorkingDay(d: Date): Date {
  let x = addDays(d, 1);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}

/** Weekdays from `from` to `to`, both included. Bank holidays aren't known here, so they count. */
export function weekdaysBetween(from: Date, to: Date): number {
  let n = 0;
  for (let x = utcDay(from); x.getTime() <= utcDay(to).getTime(); x = addDays(x, 1)) {
    if (!isWeekend(x)) n += 1;
  }
  return n;
}

function isSingleHalfDay(l: DigestLeave): boolean {
  return sameDay(l.startDate, l.endDate) && (l.halfDayStart || l.halfDayEnd);
}

/** The half days inside a longer booking, named: "½ day on Mon 9 Nov". */
function halfDayNotes(l: DigestLeave, yearOf: Date): string[] {
  if (sameDay(l.startDate, l.endDate)) return [];
  const out: string[] = [];
  if (l.halfDayStart) out.push(`½ day on ${dayLabel(l.startDate, yearOf)}`);
  if (l.halfDayEnd) out.push(`½ day on ${dayLabel(l.endDate, yearOf)}`);
  return out;
}

/** One person's line in the weekly round-up. */
export function weeklyLine(l: DigestLeave, ref: Date): string {
  const kind = KIND[l.type] ?? "leave";
  const parts = [rangeLabel(l.startDate, l.endDate, ref)];
  if (isSingleHalfDay(l)) {
    parts.push("½ day", kind);
  } else {
    parts.push(kind, ...halfDayNotes(l, ref), `back ${dayLabel(nextWorkingDay(l.endDate), ref)}`);
  }
  return `• *${l.name}* — ${parts.join(" · ")}`;
}

/** One person's line in the daily post, about `today`. */
export function dailyLine(l: DigestLeave, today: Date): string {
  const kind = KIND[l.type] ?? "leave";
  const halfToday =
    (l.halfDayStart && sameDay(today, l.startDate)) || (l.halfDayEnd && sameDay(today, l.endDate));
  if (isSingleHalfDay(l)) return `• *${l.name}* — ½ day · ${kind}`;

  const parts = [halfToday ? `${kind} (½ day today)` : kind];
  if (sameDay(today, l.endDate)) {
    parts.push(`last day, back ${dayLabel(nextWorkingDay(l.endDate), today)}`);
  } else {
    const left = weekdaysBetween(today, l.endDate);
    parts.push(`until ${dayLabel(l.endDate, today)}`, `back ${dayLabel(nextWorkingDay(l.endDate), today)}`);
    if (left > 1) parts.push(`${left} working days left`);
  }
  return `• *${l.name}* — ${parts.join(" · ")}`;
}

/** The whole post, or null when nobody is off. `leave` must already be the approved rows in range. */
export function formatAvailabilityDigest(
  leave: DigestLeave[],
  mode: DigestMode,
  ref: Date,
): string | null {
  if (leave.length === 0) return null;
  const today = utcDay(ref);
  const sorted = [...leave].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.name.localeCompare(b.name),
  );
  const people = new Set(sorted.map((l) => l.name)).size;
  const count = `${people} ${people === 1 ? "person" : "people"}`;

  const heading =
    mode === "weekly"
      ? `*Who's off this week · ${rangeLabel(mondayOf(today), addDays(mondayOf(today), 4), today)}*`
      : `*Who's off today · ${dayLabel(today)}*`;
  const lines = sorted.map((l) => (mode === "weekly" ? weeklyLine(l, today) : dailyLine(l, today)));
  const footer =
    mode === "weekly"
      ? `_${count} off this week · approved leave in Foundry Backstage · a daily post follows Tue–Fri_`
      : `_${count} off today · approved leave in Foundry Backstage_`;

  return [heading, "", ...lines, "", footer].join("\n");
}
