/**
 * Sorting a wiki sheet, and splitting it into Workstream and Done — the pure half. No React.
 *
 * Sorting is a VIEW, never a write: it changes what this viewer sees and nothing else. The
 * stored order (the team's drag order) is untouched, so "Sheet order" always brings it back.
 *
 * Rules, each the thing a spreadsheet user expects:
 * - A dropdown column sorts by its OPTION order, not alphabetically — "High, Medium, Low"
 *   is a ranking, and A→Z would put High, Low, Medium. The choice is labelled with the
 *   first and last options ("High → Low"), so it says what it does whatever the options are.
 * - Text sorts naturally ("Item 2" before "Item 10", "02" before "10") and ignores case.
 * - Empty cells go LAST in both directions. Flipping the direction should reverse the data,
 *   not bring 30 blank rows to the top.
 * - Ties keep the sheet order, so sorting by Priority keeps each priority in drag order.
 */

import { STAGE_LABEL, STAGE_ORDER, type RequestStage } from "@/lib/wiki-request-stage";
import { isSheetPerson } from "@/lib/wiki-sheets";
import type { SheetCellValue, SheetColumn, WikiSheetRow } from "@/types/wiki-sheets";

/** Sort by the Board column (the linked task's stage). Not a column id — those are short slugs. */
export const STAGE_SORT_KEY = "__board";

export type SheetSortDir = "asc" | "desc";

export interface SheetSort {
  key: string;
  dir: SheetSortDir;
}

export interface SortChoice {
  /** `key:dir`, for a <select>. */
  value: string;
  label: string;
  key: string;
  dir: SheetSortDir;
}

/** The two halves of a sheet. Rows whose task is done leave the workstream. */
export type SheetView = "workstream" | "done";

/** Done or Closed — finished with, either on the board or by the team filing it. */
export function isDoneStage(stage: RequestStage | null | undefined): boolean {
  return stage === "DONE" || stage === "CLOSED";
}

export function inView(row: Pick<WikiSheetRow, "stage">, view: SheetView): boolean {
  return view === "done" ? isDoneStage(row.stage) : !isDoneStage(row.stage);
}

const COLLATOR = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" });

/** Media has no meaningful order. Everything else does. */
function sortable(c: Pick<SheetColumn, "type">): boolean {
  return c.type !== "media";
}

function selectOptions(c: Pick<SheetColumn, "options">): string[] {
  return (c.options ?? []).filter((o) => o.trim() !== "");
}

function directionLabels(c: Pick<SheetColumn, "type" | "options">): [string, string] {
  switch (c.type) {
    case "number":
      return ["0 → 9", "9 → 0"];
    case "date":
      return ["Oldest first", "Newest first"];
    case "checkbox":
      return ["Ticked first", "Unticked first"];
    case "select": {
      const o = selectOptions(c);
      if (o.length >= 2) return [`${o[0]} → ${o[o.length - 1]}`, `${o[o.length - 1]} → ${o[0]}`];
      return ["A → Z", "Z → A"];
    }
    default:
      return ["A → Z", "Z → A"];
  }
}

const BOARD_LABELS: [string, string] = [`Not on board → ${STAGE_LABEL.DONE}`, `${STAGE_LABEL.DONE} → Not on board`];

/** Every way this sheet can be sorted, in column order, with the Board last. */
export function sortChoices(columns: readonly SheetColumn[]): SortChoice[] {
  const out: SortChoice[] = [];
  const add = (key: string, title: string, [up, down]: [string, string]) => {
    out.push({ value: `${key}:asc`, label: `${title} · ${up}`, key, dir: "asc" });
    out.push({ value: `${key}:desc`, label: `${title} · ${down}`, key, dir: "desc" });
  };
  for (const c of columns) if (sortable(c)) add(c.id, c.title, directionLabels(c));
  add(STAGE_SORT_KEY, "Board", BOARD_LABELS);
  return out;
}

/** A stored or chosen `key:dir` back into a sort — null when it no longer names a column. */
export function parseSort(value: string | null | undefined, columns: readonly SheetColumn[]): SheetSort | null {
  if (!value) return null;
  const i = value.lastIndexOf(":");
  if (i <= 0) return null;
  const key = value.slice(0, i);
  const dir = value.slice(i + 1);
  if (dir !== "asc" && dir !== "desc") return null;
  if (key !== STAGE_SORT_KEY && !columns.some((c) => c.id === key && sortable(c))) return null;
  return { key, dir };
}

export function encodeSort(sort: SheetSort | null): string {
  return sort ? `${sort.key}:${sort.dir}` : "";
}

/** What a cell sorts by. `null` is empty — always last. */
type Key = number | string | null;

function cellKey(c: SheetColumn, v: SheetCellValue | undefined): Key {
  switch (c.type) {
    case "checkbox":
      // An unset checkbox is unticked, not empty.
      return v === true ? 0 : 1;
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    case "date":
      return typeof v === "string" && v.trim() ? v : null;
    case "select": {
      if (typeof v !== "string" || !v.trim()) return null;
      const options = selectOptions(c);
      const i = options.findIndex((o) => o.toLowerCase() === v.trim().toLowerCase());
      // A value no longer among the options sorts after every option that is.
      return i >= 0 ? i : options.length;
    }
    case "person":
      return isSheetPerson(v) ? v.name : typeof v === "string" && v.trim() ? v.trim() : null;
    default:
      return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
  }
}

function stageKey(stage: RequestStage | null): number {
  return stage ? STAGE_ORDER.indexOf(stage) + 1 : 0;
}

function compareKeys(a: Exclude<Key, null>, b: Exclude<Key, null>): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return COLLATOR.compare(String(a), String(b));
}

/**
 * The rows in `sort` order — a new array; the input is not touched. `null` returns them as
 * they came, which is the sheet order.
 */
export function sortSheetRows<T extends Pick<WikiSheetRow, "cells" | "stage">>(
  rows: readonly T[],
  columns: readonly SheetColumn[],
  sort: SheetSort | null,
): T[] {
  if (!sort) return [...rows];
  const column = sort.key === STAGE_SORT_KEY ? null : columns.find((c) => c.id === sort.key);
  if (sort.key !== STAGE_SORT_KEY && (!column || !sortable(column))) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyed = rows.map((row, index) => ({
    row,
    index,
    key: (column ? cellKey(column, row.cells[column.id]) : stageKey(row.stage)) as Key,
  }));
  keyed.sort((x, y) => {
    if (x.key === null || y.key === null) {
      if (x.key === y.key) return x.index - y.index;
      return x.key === null ? 1 : -1;
    }
    return sign * compareKeys(x.key, y.key) || x.index - y.index;
  });
  return keyed.map((k) => k.row);
}

/* ── this viewer's choice, kept in their browser ── */

export function sortStorageKey(sheetId: string): string {
  return `foundry.wiki.sheet.sort.v1.${sheetId}`;
}

export function readStoredSort(sheetId: string): string | null {
  try {
    return window.localStorage.getItem(sortStorageKey(sheetId));
  } catch {
    return null;
  }
}

export function writeStoredSort(sheetId: string, sort: SheetSort | null): void {
  try {
    if (sort) window.localStorage.setItem(sortStorageKey(sheetId), encodeSort(sort));
    else window.localStorage.removeItem(sortStorageKey(sheetId));
  } catch {
    // Blocked storage: the sort still applies, it just isn't remembered.
  }
}
