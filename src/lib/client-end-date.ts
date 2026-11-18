/**
 * An engagement's end date on the Portal client page (client-detail.tsx). Colour is only for
 * meaning: "soon" inside END_SOON_DAYS, "past" once the date has gone, otherwise nothing.
 */

export const END_SOON_DAYS = 30;

/** Whole days from today (UTC) to a YYYY-MM-DD or ISO date; negative once passed. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const target = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  const day = Date.UTC(new Date(target).getUTCFullYear(), new Date(target).getUTCMonth(), new Date(target).getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((day - today) / 86_400_000);
}

export type EndDateState = { days: number; state: "past" | "soon" | null };

export function endDateState(date: string, now: Date = new Date()): EndDateState {
  const days = daysUntil(date, now);
  return { days, state: days < 0 ? "past" : days <= END_SOON_DAYS ? "soon" : null };
}
