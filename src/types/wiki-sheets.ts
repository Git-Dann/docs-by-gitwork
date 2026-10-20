/**
 * Sheets — client-editable spreadsheets on a client's wiki (CLAUDE.md §73).
 *
 * The replacement for the Google Sheet a client keeps of "things we want built": a typed
 * grid both sides can edit, where any row can be sent to the developers' task board and the
 * sheet then follows that task. Columns are JSON on the sheet; rows are their own table and
 * are written cell by cell, so the client and the team editing different cells never clobber
 * each other. The rules live in `src/lib/wiki-sheets.ts`.
 */

import type { RequestStage } from "@/lib/wiki-request-stage";

export type SheetColumnType =
  | "text"
  | "long_text"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "link"
  | "person";

export interface SheetColumn {
  /** Stable within one sheet so cells can key on it. Not a database id. */
  id: string;
  title: string;
  type: SheetColumnType;
  /** Only for `select`. */
  options?: string[];
  /** Preferred width in px; the grid picks a default by type when absent. */
  width?: number;
  /** Whether the client may change this column's cells (sheet must also allow editing). */
  clientEditable: boolean;
}

/** A stored value. Strings for text-like types and dates (`YYYY-MM-DD`). */
export type SheetCellValue = string | number | boolean;

export type SheetCells = Record<string, SheetCellValue>;

export type SheetActorKind = "TEAM" | "CLIENT";

export interface WikiSheetRow {
  id: string;
  orderKey: number;
  cells: SheetCells;
  taskId: string | null;
  /**
   * Where the linked task has got to — derived from the board at read, never stored
   * (§47.2). Null when the row has not been sent. A `taskId` whose task can't be found
   * reads as REVIEWING, never as scheduled.
   */
  stage: RequestStage | null;
  /** Team copy only: who the linked task is assigned to. Always [] in the client's copy. */
  assignees: string[];
  createdByKind: SheetActorKind;
  createdByName: string | null;
  /** Team copy only; always null in the client's copy (ownership is resolved server-side). */
  createdByWikiUserId: string | null;
  /**
   * The viewer added this row and may remove it. Decided on the server for the viewer of
   * the client's page (`applySheetViewer`), so client user ids never reach the browser.
   * Always false in the team copy — the team may remove any row.
   */
  mine: boolean;
  updatedByKind: SheetActorKind | null;
  updatedByName: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface WikiSheet {
  id: string;
  title: string;
  description: string | null;
  orderKey: number;
  columns: SheetColumn[];
  titleColumnId: string | null;
  clientCanEdit: boolean;
  clientCanAddRows: boolean;
  clientCanSendToBoard: boolean;
  /** Live rows first, in order. Soft-deleted rows are only ever in the team copy. */
  rows: WikiSheetRow[];
  updatedAt: string;
}

export interface WikiSheetsSection {
  enabled: boolean;
  sheets: WikiSheet[];
}
