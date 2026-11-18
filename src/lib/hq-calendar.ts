/**
 * "Now / next" for the HQ calendar: the meeting happening now, or the next one today or
 * later. All-day events (a date with no time) are never "next": they don't start at a time
 * you can be late for.
 */

export type MeetingLike = { start: string; end: string };

function timed(iso: string): boolean {
  return iso.includes("T");
}

export function nowOrNext<T extends MeetingLike>(events: T[], now: Date): { event: T; live: boolean } | null {
  const t = now.getTime();
  let best: T | null = null;
  for (const ev of events) {
    if (!timed(ev.start)) continue;
    const start = Date.parse(ev.start);
    const end = Date.parse(ev.end);
    if (Number.isNaN(start)) continue;
    if (start <= t && (Number.isNaN(end) ? start + 30 * 60_000 : end) > t) return { event: ev, live: true };
    if (start > t && (!best || start < Date.parse(best.start))) best = ev;
  }
  return best ? { event: best, live: false } : null;
}

/** "in 5 min", "in 1 h 20 min", "tomorrow 09:15", "Fri 13:45". */
export function startsIn(iso: string, now: Date): string {
  const start = new Date(iso);
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
  const hhmm = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `in ${h} h ${m} min` : `in ${h} h`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (start.toDateString() === tomorrow.toDateString()) return `tomorrow ${hhmm}`;
  return `${start.toLocaleDateString("en-GB", { weekday: "short" })} ${hhmm}`;
}
