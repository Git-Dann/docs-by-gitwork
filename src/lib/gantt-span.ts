/**
 * Where a feature block sits on a Gantt.
 *
 * Its own start and end dates when it has both. Otherwise an ESTIMATE from its tasks:
 * the first task due date to the last. A block with neither gets no bar at all.
 *
 * One rule for every Gantt — the internal task board, the client's wiki timeline, the
 * linked-client timeline under it, and the public /timeline share. Four places used to
 * do this for themselves; three estimated and drew the estimate as if it were a real
 * schedule, and the fourth (linked clients) didn't estimate at all, so YG Intelligence's
 * phases showed no bars while their tasks were due across Oct–Dec.
 *
 * `estimated` is the honest part: the chart draws an estimated bar dashed and says so,
 * because nobody set those dates.
 */

export interface BlockSpan {
  startDate: string;
  endDate: string;
  estimated: boolean;
}

type DateLike = Date | string | null | undefined;

function iso(d: DateLike): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function blockSpan(block: { startDate: DateLike; endDate: DateLike }, taskDueDates: DateLike[]): BlockSpan | null {
  const start = iso(block.startDate);
  const end = iso(block.endDate);
  if (start && end) return { startDate: start, endDate: end, estimated: false };

  const dues = taskDueDates.map(iso).filter((d): d is string => d !== null).sort();
  const s = start ?? dues[0] ?? null;
  const e = end ?? dues[dues.length - 1] ?? null;
  if (!s || !e) return null;
  // A block with only a start set, and every task due before it, would otherwise draw
  // a bar that ends before it begins.
  return s <= e ? { startDate: s, endDate: e, estimated: true } : { startDate: e, endDate: e, estimated: true };
}
