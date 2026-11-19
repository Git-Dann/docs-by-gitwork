/**
 * A card grid that never leaves empty slots on its last row.
 *
 * Four monitors in a three-wide grid left two empty slots under the fourth — about two
 * thirds of a row of nothing (wiki audit, Nov 2026). The columns are chosen from the count,
 * and when a row still cannot be filled its last card stretches to close it.
 *
 * Phone: one column. From `md`: two. From `xl` (when `maxCols` is 3): three, unless the
 * count fits two columns exactly (2 or 4 cards), which reads better as a 2×2 than 3 + 1.
 *
 * ⚠️ Every class here is written out in full, because Tailwind only emits classes it can
 * find as literal strings in the source.
 */
export interface CardGrid {
  /** Classes for the grid container. */
  container: string;
  /** Classes for the card at `index` (0-based). */
  item: (index: number) => string;
}

export function xlColumns(count: number, maxCols: 2 | 3 = 3): 1 | 2 | 3 {
  if (count <= 1) return 1;
  if (maxCols === 2) return 2;
  return count % 3 === 0 || count >= 5 ? 3 : 2;
}

export function cardGrid(count: number, maxCols: 2 | 3 = 3): CardGrid {
  if (count <= 1) return { container: "grid grid-cols-1 gap-3", item: () => "" };

  const xl = xlColumns(count, maxCols);
  const container = `grid grid-cols-1 gap-3 md:grid-cols-2${xl === 3 ? " xl:grid-cols-3" : ""}`;
  const last = count - 1;

  return {
    container,
    item: (index) => {
      if (index !== last) return "";
      const parts: string[] = [];
      // Two columns from md: an odd count leaves the last card alone on its row.
      const mdAlone = count % 2 === 1;
      if (mdAlone) parts.push("md:col-span-2");
      if (xl === 3) {
        const remainder = count % 3;
        if (remainder === 1) parts.push("xl:col-span-3");
        else if (remainder === 2) parts.push("xl:col-span-2");
        else if (mdAlone) parts.push("xl:col-span-1");
      }
      return parts.join(" ");
    },
  };
}

/** Empty slots on the last row at a given column count — what `cardGrid` exists to keep at 0. */
export function emptySlots(count: number, columns: number, item: (index: number) => string, prefix: "md" | "xl"): number {
  if (count === 0) return 0;
  let used = 0;
  for (let i = 0; i < count; i++) {
    const cls = item(i);
    const md = /md:col-span-(\d)/.exec(cls);
    const xl = /xl:col-span-(\d)/.exec(cls);
    const span = prefix === "xl" ? Number(xl?.[1] ?? md?.[1] ?? 1) : Number(md?.[1] ?? 1);
    used += Math.min(span, columns);
  }
  const rem = used % columns;
  return rem === 0 ? 0 : columns - rem;
}
