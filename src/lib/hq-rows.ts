/**
 * How tall a row of HQ tiles should be, so no tile is left mostly empty.
 *
 * Tiles in a row share one height. If that height comes from the TALLEST tile, every shorter
 * tile beside it is padded with empty space (Dan: "we absolutely cannot have large gaps"). So
 * the row takes the SHORTEST tile's natural height, never below a floor (so a tile with almost
 * nothing in it can't squash the row) and never above the band's cap. Taller tiles scroll
 * inside: nothing is hidden, and the only empty space left is the floor minus a nearly empty
 * tile's content.
 */
export function rowHeight(naturals: number[], floor: number, cap: number): number {
  const positive = naturals.filter((n) => Number.isFinite(n) && n > 0);
  if (positive.length === 0) return floor;
  return Math.max(floor, Math.min(cap, Math.min(...positive)));
}

/** Tile indexes per row for a band laid out `perRow` to a row. */
export function rowsOf(count: number, perRow: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Array.from({ length: Math.min(perRow, count - i) }, (_, k) => i + k));
  return rows;
}
