"use client";

/**
 * A table's sort, remembered in this browser per table (`storageKey`). Null = the table's own
 * default order. Read after mount (the server render has no storage), and every read and write is
 * guarded: blocked storage just means it isn't remembered.
 */
import { useCallback, useEffect, useState } from "react";
import { nextSort, type SortDir, type TableSort } from "@/lib/table-sort";

export function useStoredSort<K extends string>(
  storageKey: string,
  keys: readonly K[],
  firstDir: Partial<Record<K, SortDir>> = {},
): { sort: TableSort<K> | null; sortBy: (key: K) => void; setSort: (s: TableSort<K> | null) => void } {
  const [sort, setSortState] = useState<TableSort<K> | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as TableSort<K> | null;
      if (saved && (keys as readonly string[]).includes(saved.key) && (saved.dir === "asc" || saved.dir === "desc")) setSortState(saved);
    } catch {
      // Unreadable: keep the default order.
    }
    // `keys` is a constant list per table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const setSort = useCallback(
    (next: TableSort<K> | null) => {
      setSortState(next);
      try {
        if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
        else window.localStorage.removeItem(storageKey);
      } catch {
        // Not remembered; it still applies now.
      }
    },
    [storageKey],
  );
  const sortBy = useCallback(
    (key: K) =>
      setSortState((cur) => {
        const next = nextSort(cur, key, firstDir[key] ?? "asc");
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Not remembered.
        }
        return next;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );
  return { sort, sortBy, setSort };
}
