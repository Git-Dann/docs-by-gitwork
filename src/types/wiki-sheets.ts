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
  | "person"
  | "media";

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

/**
 * A person picked from the client's directory (§73.1). The id is opaque and the same
 * vocabulary the @mention picker uses: `team:<userId>` · `client:<wikiUserId>` ·
 * `contact:primary`. Never carries an email. A person cell may also hold plain text —
 * values typed before the picker existed, and pasted names that matched nobody.
 */
export interface SheetPerson {
  id: string;
  name: string;
  kind: "TEAM" | "CLIENT";
}

/** One link in a `media` cell: an image, a video or a file elsewhere. Never fetched by us. */
export interface SheetMediaItem {
  url: string;
  title?: string;
}

/**
 * A stored value. Strings for text-like types and dates (`YYYY-MM-DD`); a person cell
 * holds a `SheetPerson` (or legacy plain text); a media cell holds a list of links.
 */
export type SheetCellValue = string | number | boolean | SheetPerson | SheetMediaItem[];

export type SheetCells = Record<string, SheetCellValue>;

export type SheetActorKind = "TEAM" | "CLIENT";

/** Someone on a linked task, as the Board column shows them. Never an email or a user id. */
export interface SheetTaskPerson {
  /** Team copy: full name. Client copy: first name + last initial ("Priya S."). */
  name: string;
  initials: string;
}

/**
 * The live task behind a row (§73.1) — read from the board on every load, never stored on
 * the row (§47.2). Null when the row isn't on the board, or its task has gone.
 */
export interface SheetRowTask {
  /** Team copy only; null in the client's copy. */
  title: string | null;
  assignees: SheetTaskPerson[];
  /** `YYYY-MM-DD`, or null. */
  dueDate: string | null;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

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
  /** The linked task, live (§73.1). Cut down for the client by `forPublicSheets`. */
  task: SheetRowTask | null;
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
  /** Row height in px set by the team (§73.1). Null = auto (single line). */
  height: number | null;
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
