/**
 * Typed table columns and cells. Written for the wiki's Sheets (CLAUDE.md §73); kept when
 * Sheets was retired (§127) for the Board's coming Table view and to read the old sheets'
 * stored rows. The rules live in `src/lib/table/cells.ts`.
 */

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
