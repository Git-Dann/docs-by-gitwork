/**
 * Old app URLs keep working after a page moves: a redirect stub at the old path sends the
 * reader to the new one WITH the query string, so a filtered link (`?status=RECHECK_DUE`)
 * or a notification deep link lands on the same view rather than a bare page.
 *
 * Pure, so it can be unit-tested. Used by the /app/codeclear stubs (CLAUDE.md §87).
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** `target` with every search param from the old URL appended, in order. */
export function withSearch(target: string, searchParams: SearchParamsRecord | undefined): string {
  if (!searchParams) return target;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const qs = query.toString();
  if (!qs) return target;
  return `${target}${target.includes("?") ? "&" : "?"}${qs}`;
}

/** Where each legacy /app/codeclear path lives now. Order matters: most specific first. */
export const CODECLEAR_MOVES: ReadonlyArray<{ from: RegExp; to: (m: RegExpMatchArray) => string }> = [
  { from: /^\/app\/codeclear\/devsignal\/(challenges|model|notice)$/, to: (m) => `/app/staff/hiring/devsignal/${m[1]}` },
  { from: /^\/app\/codeclear\/devsignal\/([^/]+)$/, to: (m) => `/app/staff/hiring/devsignal/${m[1]}` },
  { from: /^\/app\/codeclear\/devsignal$/, to: () => "/app/staff/hiring/devsignal" },
  { from: /^\/app\/codeclear\/pipeline$/, to: () => "/app/staff/hiring/pipeline" },
  { from: /^\/app\/codeclear\/candidates\/([^/]+)$/, to: (m) => `/app/staff/hiring/candidates/${m[1]}` },
  { from: /^\/app\/codeclear\/candidates$/, to: () => "/app/staff/developers" },
  { from: /^\/app\/codeclear\/archived$/, to: () => "/app/staff?view=archived" },
  { from: /^\/app\/codeclear$/, to: () => "/app/staff/hiring" },
];

/** The current path for a legacy /app/codeclear path, or null when it isn't one we moved. */
export function movedCodeclearPath(pathname: string): string | null {
  for (const { from, to } of CODECLEAR_MOVES) {
    const m = pathname.match(from);
    if (m) return to(m);
  }
  return null;
}
