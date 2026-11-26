/**
 * One way to sort a table, shared by every table that sorts (course requests, tasks, requests,
 * team, money, the code portfolio). Pure and tested.
 *
 * - One column at a time; clicking it again reverses it; a new column starts in its natural
 *   direction (counts and dates high/recent first, names A–Z).
 * - An empty value (null, undefined, "") goes LAST whichever way the column is flipped, so
 *   reversing a column never floods the top with blanks.
 * - Text compares ignoring case and accents, with numbers in natural order ("v2" < "v10").
 * - Stable: rows that compare equal keep the order they came in.
 */
export type SortDir = "asc" | "desc";
export interface TableSort<K extends string = string> {
  key: K;
  dir: SortDir;
}

export type SortValue = string | number | Date | boolean | null | undefined;

function blank(v: SortValue): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (v instanceof Date && Number.isNaN(v.getTime()));
}

/** Compare two values for a column; empties sort last in both directions. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ea = blank(a);
  const eb = blank(b);
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") {
    return sign * a.trim().localeCompare(b.trim(), "en-GB", { sensitivity: "base", numeric: true });
  }
  const n = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === "boolean" ? (v ? 1 : 0) : Number(v));
  return sign * (n(a) - n(b));
}

/** Rows ordered by one column, stably. `valueOf` returns the column's value for a row. */
export function sortRows<T>(rows: readonly T[], valueOf: (row: T) => SortValue, dir: SortDir): T[] {
  return rows
    .map((row, i) => ({ row, i, v: valueOf(row) }))
    .sort((x, y) => compareSortValues(x.v, y.v, dir) || x.i - y.i)
    .map((x) => x.row);
}

/** Clicking a column: the same one flips; a new one starts in `firstDir` (default ascending). */
export function nextSort<K extends string>(current: TableSort<K> | null, key: K, firstDir: SortDir = "asc"): TableSort<K> {
  return current && current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir };
}

/** An ISO date string as a sortable number, or null. */
export function dateValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
