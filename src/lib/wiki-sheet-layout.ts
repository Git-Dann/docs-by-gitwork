/**
 * Sheet layout — column widths, row heights and row order (CLAUDE.md §73.1). Pure.
 *
 * The grid, the server and the MCP tools all clamp and order through here, so a width
 * dragged in the grid and one written by Claude obey the same bounds.
 */

export const LAYOUT_LIMITS = {
  minWidth: 60,
  maxWidth: 600,
  minRowHeight: 28,
  maxRowHeight: 300,
} as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

export function clampColumnWidth(width: number): number {
  return Number.isFinite(width) ? clamp(width, LAYOUT_LIMITS.minWidth, LAYOUT_LIMITS.maxWidth) : LAYOUT_LIMITS.minWidth;
}

/** Null (or anything not a finite number) = auto height. */
export function clampRowHeight(height: number | null | undefined): number | null {
  if (height === null || height === undefined || !Number.isFinite(height)) return null;
  return clamp(height, LAYOUT_LIMITS.minRowHeight, LAYOUT_LIMITS.maxRowHeight);
}

/** Move `activeId` to where `overId` is (dnd-kit's arrayMove, by id). Unknown ids → unchanged. */
export function moveRow(ids: readonly string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

/**
 * The full new order of a sheet's rows: the ids given, in that order (unknown ones and
 * repeats dropped), then every row NOT mentioned in its current relative order — so a
 * partial order (only the live rows, or only the rows shown) never strands the rest.
 */
export function mergeRowOrder(current: readonly string[], wanted: readonly string[]): string[] {
  const known = new Set(current);
  const seen = new Set<string>();
  const head: string[] = [];
  for (const id of wanted) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    head.push(id);
  }
  return [...head, ...current.filter((id) => !seen.has(id))];
}

export type RowMove = { row: string; before?: string; after?: string };

/** Move one row before or after another. Throws a sentence when the request can't apply. */
export function planRowMove(current: readonly string[], move: RowMove): string[] {
  const target = move.before ?? move.after;
  if (!target || (move.before && move.after)) throw new Error("Give exactly one of before or after.");
  if (!current.includes(move.row)) throw new Error("The row to move isn't in this sheet.");
  if (!current.includes(target)) throw new Error("The row to move it next to isn't in this sheet.");
  if (target === move.row) return [...current];
  const rest = current.filter((id) => id !== move.row);
  const at = rest.indexOf(target) + (move.after ? 1 : 0);
  rest.splice(at, 0, move.row);
  return rest;
}

/* ───────────────────────── client-only layout (this browser, never sent) ── */

export interface LocalSheetLayout {
  cols: Record<string, number>;
  /** px, or 0 for "auto in this browser" (overriding a height the team set). */
  rows: Record<string, number>;
}

export function localLayoutKey(sheetId: string): string {
  return `foundry.wiki.sheet.layout.v1.${sheetId}`;
}

/** A client's own widths/heights. Blocked or corrupt storage reads as "nothing set". */
export function readLocalLayout(sheetId: string): LocalSheetLayout {
  try {
    const raw = window.localStorage.getItem(localLayoutKey(sheetId));
    if (!raw) return { cols: {}, rows: {} };
    const parsed = JSON.parse(raw) as Partial<LocalSheetLayout>;
    const clean = (o: unknown, fn: (n: number) => number | null) =>
      Object.fromEntries(
        Object.entries(o && typeof o === "object" ? (o as Record<string, unknown>) : {})
          .map(([k, v]) => [k, typeof v === "number" ? fn(v) : null])
          .filter((e): e is [string, number] => e[1] !== null),
      );
    // A row stored as 0 means "auto here" — this viewer reset a height the team had set.
    return {
      cols: clean(parsed.cols, clampColumnWidth),
      rows: clean(parsed.rows, (v) => (v === 0 ? 0 : clampRowHeight(v))),
    };
  } catch {
    return { cols: {}, rows: {} };
  }
}

export function writeLocalLayout(sheetId: string, layout: LocalSheetLayout): void {
  try {
    window.localStorage.setItem(localLayoutKey(sheetId), JSON.stringify(layout));
  } catch {
    /* private window or blocked storage: the resize just doesn't survive a reload */
  }
}
