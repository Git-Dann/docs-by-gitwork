/**
 * Moving a client's wiki Sheets onto their Board (CLAUDE.md §127). Pure: no Prisma, no I/O.
 * The reads and writes are src/server/sheets-to-board.ts.
 *
 * Sheets was retired because every sheet anyone used was a list of work, and the Board is where
 * work lives. Each live row becomes a PRODUCT CARD (§124) in a named list (`Task.boardList` = the
 * sheet's title), so the grouping survives and the coming Table view can show it as a table again.
 *
 * Rules, each the thing that keeps an item from being lost or doubled:
 *  - **Every non-empty cell is carried.** The title cell becomes the card's title; every other
 *    cell goes in the description as `**Column:** value`, in column order (`rowTaskDescription`,
 *    the same text "Send to board" wrote). Uploaded screenshots are also copied onto the card.
 *  - **Idempotent.** A card made from a row carries `externalRef = "sheet-row:<rowId>"`; a row
 *    whose ref is already on the client is skipped, so a second run makes nothing.
 *  - **A row already sent to the board keeps its work.** If its task still exists on this client:
 *    a task that is already a product card just joins the list; a dev task gets a new card in the
 *    task's own status (Done → the Done lane) and is linked to it, unless it already delivers
 *    another card. A task that is gone, or on another client, is treated as never sent.
 *  - **Status, priority, area and type are mapped only where they clearly match.** Anything
 *    unclear lands in the client's default backlog lane, with the original value still in the
 *    description.
 */

import { cellText, isSheetPerson, parseRowCells, parseSheetColumns, rowTaskDescription, rowTaskTitle } from "@/lib/table/cells";
import { parseSheetFileUrl } from "@/lib/table/files";
import { isMediaList } from "@/lib/table/media";
import { columnNameKey, type BoardColumnDef } from "@/lib/tasks/board-columns";
import { BOARD_LIST_MAX, type ItemType } from "@/lib/tasks/product-cards";
import type { SheetCells, SheetColumn } from "@/types/table";
import type { TaskStatus } from "@/types/tasks";

export const SHEET_ROW_REF_PREFIX = "sheet-row:";

export function sheetRowRef(rowId: string): string {
  return `${SHEET_ROW_REF_PREFIX}${rowId}`;
}

export interface SheetInput {
  id: string;
  title: string;
  /** Raw stored JSON; parsed defensively here. */
  columns: unknown;
  titleColumnId: string | null;
  rows: Array<{
    id: string;
    /** Raw stored JSON. */
    cells: unknown;
    taskId: string | null;
    createdByKind: string;
    createdByName: string | null;
  }>;
}

/** The task a row was sent to, as far as the move needs it. */
export interface LinkedTask {
  id: string;
  clientId: string;
  status: TaskStatus;
  itemType: string | null;
  productCardId: string | null;
  boardList: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type TaskPriorityValue = "LOW" | "MEDIUM" | "HIGH";

export interface SheetUpload {
  key: string;
  filename: string;
}

export interface RowPlan {
  rowId: string;
  sheetId: string;
  sheetTitle: string;
  /**
   * create       → a new card;
   * join-card    → the row's task is already a product card: it joins the list;
   * already      → done before (a card carries this row's ref, or the card is already in a list).
   */
  action: "create" | "join-card" | "already";
  title: string;
  description: string;
  itemType: ItemType;
  priority: TaskPriorityValue;
  area: string | null;
  status: TaskStatus;
  /** A board column of that status, or null for the status's default lane. */
  columnId: string | null;
  boardList: string;
  /** A dev task to link to the new card (only one that delivers no card yet). */
  linkDevTaskId: string | null;
  /** The existing card the row joins (join-card / already-by-list). */
  cardTaskId: string | null;
  /** Why something the reader might expect didn't happen, in a sentence. Null when nothing to say. */
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByKind: string;
  createdByName: string | null;
  /** Non-empty cells in the row, every one of which is on the card. */
  cellsCarried: number;
  /** Screenshots uploaded into the row's media cells, to copy onto the card. */
  uploads: SheetUpload[];
}

export interface SheetsToBoardPlan {
  rows: RowPlan[];
  counts: {
    sheets: number;
    rows: number;
    create: number;
    /** New cards that also link the dev task the row was sent to. */
    linkDevTask: number;
    joinCard: number;
    already: number;
    cellsCarried: number;
    uploads: number;
  };
}

/** A sheet of bugs / QA findings, judged by its title or by columns only a bug list has. */
export function isQaSheet(title: string, columns: readonly SheetColumn[]): boolean {
  if (/\b(qa|bugs?|test(ing)?|defects?)\b/i.test(title)) return true;
  return columns.some((c) => /^(expected|expected result|actual|actual result|steps|steps to reproduce|build|reproduce)$/i.test(c.title.trim()));
}

function columnTitled(columns: readonly SheetColumn[], title: string): SheetColumn | undefined {
  return columns.find((c) => c.title.trim().toLowerCase() === title);
}

function textOf(columns: readonly SheetColumn[], cells: SheetCells, title: string): string {
  const col = columnTitled(columns, title);
  return col ? cellText(col, cells[col.id]).replace(/\s+/g, " ").trim() : "";
}

/** A row's own Type cell, when it names a card type. Sub-items need a parent, so they aren't taken. */
export function itemTypeFromCell(value: string): ItemType | null {
  const v = value.trim().toLowerCase();
  if (v === "feature" || v === "feature request") return "feature";
  if (v === "bug") return "bug";
  if (v === "feedback") return "feedback";
  return null;
}

export function priorityFromCell(value: string): TaskPriorityValue | null {
  const v = value.trim().toLowerCase();
  if (/^(urgent|critical|highest|high|p0|p1)$/.test(v)) return "HIGH";
  if (/^(medium|med|normal|p2)$/.test(v)) return "MEDIUM";
  if (/^(low|lowest|p3|p4)$/.test(v)) return "LOW";
  return null;
}

/**
 * Sheet status words that mean a board column by another name. Only ever looked up against the
 * client's own columns: a client without a "Triage" column gets its default lane instead.
 */
const STATUS_ALIASES: Record<string, string> = {
  futureitem: "futureidea",
  future: "futureidea",
  todecide: "triage",
  inreviewdoc: "triage",
  needsreview: "triage",
};

/**
 * The board column a sheet's Status value names, among the client's BACKLOG and To do columns.
 * A row that hasn't been sent to the board isn't work in progress, so nothing maps further along.
 */
export function columnForStatus(value: string, columns: readonly BoardColumnDef[]): BoardColumnDef | null {
  const key = columnNameKey(value).replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  const want = STATUS_ALIASES[key] ?? key;
  return (
    columns.find(
      (c) => (c.stage === "BACKLOG" || c.stage === "TODO") && columnNameKey(c.name).replace(/[^a-z0-9]/g, "") === want,
    ) ?? null
  );
}

/** Every non-empty cell in a row: what the move promises to carry. */
export function nonEmptyCells(columns: readonly SheetColumn[], cells: SheetCells): number {
  return columns.filter((c) => {
    const v = cells[c.id];
    if (v === undefined || v === null) return false;
    if (isMediaList(v)) return v.length > 0;
    if (isSheetPerson(v)) return Boolean(v.name.trim());
    return cellText(c, v).trim() !== "";
  }).length;
}

/** Screenshots uploaded into the row (`/api/wiki/files/<key>/<name>`), in cell order. Links elsewhere stay links. */
export function rowUploads(columns: readonly SheetColumn[], cells: SheetCells): SheetUpload[] {
  const out: SheetUpload[] = [];
  const seen = new Set<string>();
  for (const c of columns) {
    const v = cells[c.id];
    if (!isMediaList(v)) continue;
    for (const item of v) {
      const f = parseSheetFileUrl(item.url);
      if (f && !seen.has(f.key)) {
        seen.add(f.key);
        out.push({ key: f.key, filename: f.filename });
      }
    }
  }
  return out;
}

export function planSheetsToBoard(input: {
  clientId: string;
  sheets: readonly SheetInput[];
  /** Every `externalRef` already on the client's tasks. */
  existingRefs: ReadonlySet<string>;
  /** The tasks rows were sent to, by id (any client; checked here). */
  linkedTasks: ReadonlyMap<string, LinkedTask>;
  boardColumns: readonly BoardColumnDef[];
}): SheetsToBoardPlan {
  const rows: RowPlan[] = [];
  for (const sheet of input.sheets) {
    const columns = parseSheetColumns(sheet.columns);
    const qa = isQaSheet(sheet.title, columns);
    const boardList = sheet.title.trim().slice(0, BOARD_LIST_MAX) || "Sheet";
    const shape = { title: sheet.title, columns, titleColumnId: sheet.titleColumnId };
    for (const row of sheet.rows) {
      const cells = parseRowCells(row.cells, columns);
      const title = rowTaskTitle(shape, cells) ?? `Untitled row from "${boardList}"`;
      const by = row.createdByName?.trim();
      const description = rowTaskDescription(shape, cells, null) + (by ? `\nAdded to the sheet by ${by}.` : "");
      const itemType = itemTypeFromCell(textOf(columns, cells, "type")) ?? (qa ? "bug" : "feature");
      const priority = priorityFromCell(textOf(columns, cells, "priority")) ?? "MEDIUM";
      const area = textOf(columns, cells, "area").slice(0, 80) || null;
      const base = {
        rowId: row.id,
        sheetId: sheet.id,
        sheetTitle: sheet.title,
        title,
        description,
        itemType,
        priority,
        area,
        boardList,
        createdByKind: row.createdByKind,
        createdByName: row.createdByName,
        cellsCarried: nonEmptyCells(columns, cells),
        uploads: rowUploads(columns, cells),
        startedAt: null as string | null,
        completedAt: null as string | null,
        linkDevTaskId: null as string | null,
        cardTaskId: null as string | null,
        note: null as string | null,
      };

      if (input.existingRefs.has(sheetRowRef(row.id))) {
        rows.push({ ...base, action: "already", status: "BACKLOG", columnId: null, note: "Already on the board." });
        continue;
      }

      const task = row.taskId ? input.linkedTasks.get(row.taskId) : undefined;
      // A task on another client is treated exactly like one that's gone: never linked, never read.
      const sent = task && task.clientId === input.clientId ? task : null;

      if (sent?.itemType) {
        // Already a product card: the row and the card are the same item. It joins the list.
        rows.push({
          ...base,
          action: sent.boardList ? "already" : "join-card",
          status: sent.status,
          columnId: null,
          cardTaskId: sent.id,
          note: sent.boardList ? "Its card is already in a list." : "Its task is already a card; the card joins the list.",
        });
        continue;
      }

      if (sent) {
        rows.push({
          ...base,
          action: "create",
          status: sent.status,
          columnId: null,
          startedAt: sent.startedAt,
          completedAt: sent.completedAt,
          linkDevTaskId: sent.productCardId ? null : sent.id,
          note: sent.productCardId ? "Its dev task already delivers another card, so it isn't relinked." : null,
        });
        continue;
      }

      const column = columnForStatus(textOf(columns, cells, "status"), input.boardColumns);
      rows.push({
        ...base,
        action: "create",
        status: column?.stage ?? "BACKLOG",
        columnId: column?.id ?? null,
        note: row.taskId ? "It was sent to the board, but that task no longer exists." : null,
      });
    }
  }

  const count = (a: RowPlan["action"]) => rows.filter((r) => r.action === a).length;
  return {
    rows,
    counts: {
      sheets: input.sheets.length,
      rows: rows.length,
      create: count("create"),
      linkDevTask: rows.filter((r) => r.action === "create" && r.linkDevTaskId).length,
      joinCard: count("join-card"),
      already: count("already"),
      cellsCarried: rows.filter((r) => r.action !== "already").reduce((n, r) => n + r.cellsCarried, 0),
      uploads: rows.filter((r) => r.action !== "already").reduce((n, r) => n + r.uploads.length, 0),
    },
  };
}
