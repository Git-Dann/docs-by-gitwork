/**
 * Day-binning for the activity heatmap (the vendored EasyUI `ActivityHeatmap` in
 * `src/components/ui/easyui/activity-heatmap.tsx` draws it; this module feeds it).
 *
 * Framework-free and DOM-free, so the server builds the series and the tests pin it.
 *
 *  1. **Days are UTC calendar days, keyed `YYYY-MM-DD`** — the same convention as
 *     `portal-analytics-helpers.ts` (`startOfUtcDay` / `ymd`), so a heatmap cell and the
 *     throughput chart beside it can never disagree about which day a task landed on.
 *  2. **The series is gapless.** Every day in the window is present, zeros included, so "no
 *     activity" is a stated fact for each day rather than an absence the chart has to infer.
 *  3. **Weeks start on Monday** (UK) wherever this module counts weeks.
 */

const MS_PER_DAY = 86_400_000;

export interface HeatmapDay {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Parse a `YYYY-MM-DD` key as a UTC midnight. Returns null for anything else. */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Reject rollovers like 2026-02-31 → 3 Mar.
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayRow(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Gapless per-day counts across [from, to] (both inclusive, UTC days). Events outside the window
 * are ignored. Capped at ~3 years of days so an absurd range can't build an unbounded array.
 */
export function countByDay(events: Date[], from: Date, to: Date): HeatmapDay[] {
  const start = utcMidnight(from);
  const end = utcMidnight(to);
  const counts = new Map<string, number>();
  for (let cursor = start, i = 0; cursor <= end && i < 1100; i += 1) {
    counts.set(dayKey(cursor), 0);
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  for (const e of events) {
    if (Number.isNaN(e.getTime())) continue;
    const key = dayKey(utcMidnight(e));
    const cur = counts.get(key);
    if (cur != null) counts.set(key, cur + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

/**
 * How many Monday-first week columns the days span — what the heatmap's `weeks` prop needs so
 * the grid shows the whole window and nothing earlier. 0 for no (valid) days.
 */
export function heatmapWeekCount(days: HeatmapDay[]): number {
  const keys = days.map((d) => d.date).filter((k) => parseDayKey(k)).sort();
  if (keys.length === 0) return 0;
  const first = parseDayKey(keys[0])!;
  const last = parseDayKey(keys[keys.length - 1])!;
  const monday = first.getTime() - weekdayRow(first) * MS_PER_DAY;
  return Math.floor((last.getTime() - monday) / (7 * MS_PER_DAY)) + 1;
}

/** "Mon 4 Aug 2026" — the long form used in the text fallback. */
export function formatHeatmapDay(key: string): string {
  const d = parseDayKey(key);
  if (!d) return key;
  return `${WEEKDAYS[weekdayRow(d)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
