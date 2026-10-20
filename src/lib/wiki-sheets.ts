/**
 * Sheets — the pure rules behind a client-editable wiki spreadsheet (no Prisma, no React).
 *
 * The grid, the server, the validators and the MCP tools all go through this file, so a cell
 * typed in the wiki, pasted from Google Sheets or written by Claude over MCP obeys the same
 * types and the same limits (the §72 pattern). Three jobs:
 *
 *   1. **Values.** `coerceCellValue` turns whatever arrived — a typed string, a pasted
 *      "TRUE", "03/11/2026", "£1,200" — into the one stored shape for that column type, or
 *      says in a sentence why it can't. Stored JSON is re-parsed on read, so a hand-edited
 *      row can never render a value its column cannot hold.
 *   2. **Structure.** Column ops, limits, paste-import planning and CSV/TSV export.
 *   3. **Judgement, derived.** A row's stage on the task board is derived from the linked
 *      task at read time (`deriveSheetRowStage`), never stored — the §47.2 rule. And the
 *      client's write permissions are pure predicates here so the server, the UI and the
 *      tests cannot disagree about them.
 */

import { deriveRequestStage, type RequestStage, type WikiTaskStatus } from "@/lib/wiki-request-stage";
import { safeSheetLink } from "@/lib/wiki-sheet-links";
import { LAYOUT_LIMITS, clampColumnWidth } from "@/lib/wiki-sheet-layout";
import { MEDIA_LIMITS, coerceMedia, isMediaList, mediaTitle } from "@/lib/wiki-sheet-media";
import type {
  SheetCells,
  SheetCellValue,
  SheetColumn,
  SheetColumnType,
  SheetMediaItem,
  SheetPerson,
} from "@/types/wiki-sheets";

export { safeSheetLink };

export const SHEET_LIMITS = {
  maxColumns: 40,
  maxRows: 2000,
  maxSheets: 40,
  maxTitle: 120,
  maxDescription: 600,
  maxColumnTitle: 60,
  maxOptions: 50,
  maxOption: 60,
  maxText: 500,
  maxLongText: 5000,
  maxLink: 2048,
  maxPerson: 120,
  /** One paste / one MCP call. */
  maxBatch: 500,
  minWidth: LAYOUT_LIMITS.minWidth,
  maxWidth: LAYOUT_LIMITS.maxWidth,
  minRowHeight: LAYOUT_LIMITS.minRowHeight,
  maxRowHeight: LAYOUT_LIMITS.maxRowHeight,
  maxMedia: MEDIA_LIMITS.maxItems,
} as const;

export const COLUMN_TYPES: readonly SheetColumnType[] = [
  "text",
  "long_text",
  "number",
  "date",
  "select",
  "checkbox",
  "link",
  "person",
  "media",
];

export const COLUMN_TYPE_LABEL: Record<SheetColumnType, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  link: "Link",
  person: "Person",
  media: "Images & video",
};

/** How a value is written, per type — shown in MCP descriptions and the add-column menu. */
export const COLUMN_TYPE_FORMAT: Record<SheetColumnType, string> = {
  text: `short text, up to ${SHEET_LIMITS.maxText} characters`,
  long_text: `text, up to ${SHEET_LIMITS.maxLongText} characters`,
  number: 'a number (commas, "£" / "$" / "€" and "%" are stripped)',
  date: 'a date: "YYYY-MM-DD" or UK "DD/MM/YYYY"',
  select: "one of the column's options (matched without case)",
  checkbox: 'true/false (also "yes"/"no", "1"/"0", "x", "✓")',
  link: "an http(s) URL; a bare domain gets https:// added",
  person:
    "a person on this client's list — their name or email, matched exactly (unknown or ambiguous is refused)",
  media: `image/video links: a URL, several separated by spaces, an array of URLs, or {url, title} objects (up to ${MEDIA_LIMITS.maxItems})`,
};

/** Default grid widths, by type. */
export const DEFAULT_WIDTH: Record<SheetColumnType, number> = {
  text: 200,
  long_text: 280,
  number: 110,
  date: 130,
  select: 150,
  checkbox: 90,
  link: 200,
  person: 170,
  media: 220,
};

export function columnWidth(column: SheetColumn): number {
  return column.width ?? DEFAULT_WIDTH[column.type];
}

/**
 * The bounds an AUTOMATIC width stays inside, per type (§73.1). A short ref column of
 * "01, 02, 03" comes out at the floor rather than a flat 200px; a column of paragraphs
 * stops at its cap and the rest wraps or truncates. A width the team set by hand is
 * not bound by these — only by the 60–600px limits.
 */
export const AUTO_WIDTH_BOUNDS: Record<SheetColumnType, { min: number; max: number }> = {
  text: { min: 64, max: 320 },
  long_text: { min: 140, max: 360 },
  number: { min: 64, max: 140 },
  date: { min: 96, max: 130 },
  select: { min: 80, max: 220 },
  checkbox: { min: 64, max: 120 },
  link: { min: 120, max: 280 },
  person: { min: 120, max: 220 },
  media: { min: 150, max: 300 },
};

/** px per character: body text at 13px, the mono caps header at 10px with letter-spacing. */
const BODY_CHAR = 7.2;
const HEAD_CHAR = 7.6;
/** Cell padding (px-2) and a little air. */
const CELL_PAD = 22;

/** What a value takes up on screen, in characters (plus fixed extras per type, in px). */
function valueExtent(column: SheetColumn, value: SheetCellValue | undefined): number {
  if (value === undefined || value === null) return 0;
  if (column.type === "checkbox") return 18;
  if (column.type === "media") {
    const items = Array.isArray(value) ? value : [];
    // One chip: icon + a title clipped at 160px. Two fit before "+N".
    return Math.min(2, items.length) * 150 + (items.length > 2 ? 24 : 0);
  }
  const text = cellText(column, value);
  // Long text measures its first line only — it wraps or truncates past the cap anyway.
  const line = column.type === "long_text" ? (text.split("\n")[0] ?? "") : text;
  const extra = column.type === "select" ? 16 : column.type === "person" ? 26 : 0;
  return Math.min(line.length, 80) * BODY_CHAR + extra;
}

/**
 * An automatic column width, estimated from the header and a sample of values by character
 * count — deterministic, no DOM, so it is the same on the server, in a test and on every
 * screen. The widest of (header, values) plus padding, inside the type's bounds. The grid
 * uses it for every column without a saved width, and double-click auto-fit uses it too.
 */
export function estimateColumnWidth(
  column: SheetColumn,
  values: readonly (SheetCellValue | undefined)[],
  opts: { headerExtra?: number; sample?: number } = {},
): number {
  const bounds = AUTO_WIDTH_BOUNDS[column.type];
  const header = column.title.length * HEAD_CHAR + (opts.headerExtra ?? 0);
  let widest = header;
  for (const v of values.slice(0, opts.sample ?? 200)) widest = Math.max(widest, valueExtent(column, v));
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, widest + CELL_PAD)));
}

/* ─────────────────────────────────────────────────────────────── ids ── */

let counter = 0;
/** A short, collision-safe column id. Not a database id. */
export function newSheetColumnId(): string {
  counter += 1;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `col-${rand}${counter.toString(36)}`;
}

/* ──────────────────────────────────────────────────────────── values ── */

export type CoerceResult = { ok: true; value: SheetCellValue | null } | { ok: false; error: string };

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "done", "on"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "", "off"]);

/** `YYYY-MM-DD`, validated against the real calendar (no 31 February). */
function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseSheetDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  // UK first — this is a UK agency and its clients paste UK dates. 03/11/2026 is 3 November.
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/* ─────────────────────────────────────────────────────────── people ── */

/** `team:<id>` · `client:<id>` · `contact:primary` — the @mention picker's vocabulary. */
const PERSON_ID = /^(team|client|contact):[A-Za-z0-9_-]{1,80}$/;

export function isSheetPerson(value: unknown): value is SheetPerson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    PERSON_ID.test(v.id) &&
    typeof v.name === "string" &&
    v.name.trim() !== "" &&
    (v.kind === "TEAM" || v.kind === "CLIENT")
  );
}

/** Two initials for a chip: "Priya Shah" → "PS", "harry@x.com" → "H". */
export function personInitials(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0]?.[0] ?? "?"];
  return letters.join("").toUpperCase();
}

/** A directory entry; the server's carries an email, the browser's never does. */
export interface PersonEntry extends SheetPerson {
  email?: string | null;
}

export type PersonMatch =
  | { ok: true; person: SheetPerson }
  | { ok: false; reason: "none" | "ambiguous"; matches: SheetPerson[] };

/**
 * Find ONE person by email or by name, exactly and without case. Never a fuzzy guess:
 * putting the wrong name in a cell is worse than saying "who did you mean?".
 */
export function resolvePersonRef(people: readonly PersonEntry[], text: string): PersonMatch {
  const key = text.replace(/\s+/g, " ").trim().toLowerCase();
  const strip = ({ id, name, kind }: PersonEntry): SheetPerson => ({ id, name, kind });
  if (!key) return { ok: false, reason: "none", matches: [] };
  const byEmail = people.filter((p) => p.email && p.email.trim().toLowerCase() === key);
  const hits = byEmail.length ? byEmail : people.filter((p) => p.name.replace(/\s+/g, " ").trim().toLowerCase() === key);
  if (hits.length === 1) return { ok: true, person: strip(hits[0]) };
  return { ok: false, reason: hits.length ? "ambiguous" : "none", matches: hits.map(strip) };
}

/** Value equality for cells (objects and lists included) — the grid's "did it change?". */
export function sameCellValue(a: SheetCellValue | null | undefined, b: SheetCellValue | null | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return false;
  return JSON.stringify(x) === JSON.stringify(y);
}

/**
 * Turn an incoming value into the stored value for `column`, or explain why it can't be.
 *
 * Empty in, `null` out — for every type. Null means "clear the cell"; the cell is then
 * absent from the stored row rather than stored as "".
 */
export function coerceCellValue(column: Pick<SheetColumn, "type" | "options" | "title">, raw: unknown): CoerceResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "string" && raw.trim() === "" && column.type !== "checkbox") {
    return { ok: true, value: null };
  }
  const label = column.title ? `"${column.title}"` : "This column";
  if (column.type === "media") return coerceMedia(raw, label);
  if (column.type === "person" && raw && typeof raw === "object") {
    if (!isSheetPerson(raw)) return { ok: false, error: `${label} takes a person from the list.` };
    return {
      ok: true,
      value: { id: raw.id, name: clip(raw.name.replace(/\s+/g, " ").trim(), SHEET_LIMITS.maxPerson), kind: raw.kind },
    };
  }
  switch (column.type) {
    case "text":
    case "long_text":
    case "person": {
      if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
        return { ok: false, error: `${label} takes text.` };
      }
      const max =
        column.type === "long_text"
          ? SHEET_LIMITS.maxLongText
          : column.type === "person"
            ? SHEET_LIMITS.maxPerson
            : SHEET_LIMITS.maxText;
      // Long text keeps its line breaks; a one-line cell does not.
      const text =
        column.type === "long_text"
          ? String(raw).replace(/\r\n?/g, "\n").trim()
          : String(raw).replace(/\s+/g, " ").trim();
      return { ok: true, value: text ? clip(text, max) : null };
    }
    case "number": {
      if (typeof raw === "number") {
        return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, error: `${label} takes a number.` };
      }
      if (typeof raw !== "string") return { ok: false, error: `${label} takes a number.` };
      const cleaned = raw.trim().replace(/[,\s£$€%]/g, "");
      if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) {
        return { ok: false, error: `${label} takes a number — "${clip(raw.trim(), 30)}" isn't one.` };
      }
      const n = Number(cleaned);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${label} takes a number.` };
    }
    case "date": {
      if (typeof raw !== "string") return { ok: false, error: `${label} takes a date (YYYY-MM-DD).` };
      const date = parseSheetDate(raw);
      return date
        ? { ok: true, value: date }
        : { ok: false, error: `${label} takes a date — "${clip(raw.trim(), 30)}" isn't one (use YYYY-MM-DD).` };
    }
    case "select": {
      const text = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
      const options = column.options ?? [];
      const hit = options.find((o) => o.toLowerCase() === text.toLowerCase());
      if (hit) return { ok: true, value: hit };
      return {
        ok: false,
        error: options.length
          ? `${label} must be one of: ${options.join(", ")}.`
          : `${label} has no options yet — add some before choosing one.`,
      };
    }
    case "checkbox": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const word = String(raw).trim().toLowerCase();
      if (TRUE_WORDS.has(word)) return { ok: true, value: true };
      if (FALSE_WORDS.has(word)) return { ok: true, value: false };
      return { ok: false, error: `${label} is a checkbox — use true or false.` };
    }
    case "link": {
      if (typeof raw !== "string") return { ok: false, error: `${label} takes a link.` };
      const url = safeSheetLink(raw);
      return url ? { ok: true, value: url } : { ok: false, error: `${label} takes an http(s) link.` };
    }
  }
}

/** A cell's value as plain text — the grid's display, search, export and task description. */
export function cellText(column: Pick<SheetColumn, "type">, value: SheetCellValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (isMediaList(value)) return value.map((m) => m.url).join(" ");
  if (isSheetPerson(value)) return value.name;
  if (typeof value === "object") return "";
  if (column.type === "checkbox") return value === true ? "TRUE" : "FALSE";
  if (column.type === "date" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  return String(value);
}

/* ─────────────────────────────────────────────────────────── columns ── */

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const t = value.replace(/\s+/g, " ").trim();
  return clip(t, max);
}

function isColumnType(value: unknown): value is SheetColumnType {
  return typeof value === "string" && (COLUMN_TYPES as readonly string[]).includes(value);
}

/** Options for a select column: trimmed, clipped, de-duplicated without case, capped. */
export function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const o = str(item, SHEET_LIMITS.maxOption);
    if (!o || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
    if (out.length >= SHEET_LIMITS.maxOptions) break;
  }
  return out;
}

/** Whatever is stored, what reaches a renderer is a well-formed, de-duplicated column list. */
export function parseSheetColumns(raw: unknown): SheetColumn[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetColumn[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    let id = str(r.id, 60);
    if (!id || ids.has(id)) id = newSheetColumnId();
    ids.add(id);
    const type: SheetColumnType = isColumnType(r.type) ? r.type : "text";
    const col: SheetColumn = {
      id,
      title: str(r.title, SHEET_LIMITS.maxColumnTitle) || "Untitled",
      type,
      clientEditable: r.clientEditable !== false,
    };
    if (type === "select") col.options = cleanOptions(r.options);
    if (typeof r.width === "number" && Number.isFinite(r.width)) col.width = clampColumnWidth(r.width);
    out.push(col);
    if (out.length >= SHEET_LIMITS.maxColumns) break;
  }
  return out;
}

/**
 * Stored cells re-parsed against the columns: a cell for a column not in the sheet is
 * dropped, and a value its column can no longer hold (the column's type changed) is dropped
 * rather than drawn as something it isn't.
 */
export function parseRowCells(raw: unknown, columns: readonly SheetColumn[]): SheetCells {
  const out: SheetCells = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const col of columns) {
    if (!(col.id in r)) continue;
    const res = coerceCellValue(col, r[col.id]);
    if (res.ok && res.value !== null) out[col.id] = res.value;
  }
  return out;
}

/** Find a column by exact id, else by title without case. MCP and paste address columns by title. */
export function findColumn(columns: readonly SheetColumn[], ref: string): SheetColumn | undefined {
  const key = ref.trim().toLowerCase();
  return columns.find((c) => c.id === ref) ?? columns.find((c) => c.title.toLowerCase() === key);
}

/** The column a task title comes from: the chosen one, else the first text column. */
export function titleColumn(
  columns: readonly SheetColumn[],
  titleColumnId: string | null | undefined,
): SheetColumn | undefined {
  return (
    (titleColumnId ? columns.find((c) => c.id === titleColumnId) : undefined) ??
    columns.find((c) => c.type === "text") ??
    columns.find((c) => c.type === "long_text")
  );
}

export function sheetLimitError(input: { columns?: readonly unknown[]; rowCount?: number }): string | null {
  if (input.columns && input.columns.length > SHEET_LIMITS.maxColumns) {
    return `A sheet can have at most ${SHEET_LIMITS.maxColumns} columns.`;
  }
  if (input.rowCount !== undefined && input.rowCount > SHEET_LIMITS.maxRows) {
    return `A sheet can have at most ${SHEET_LIMITS.maxRows} rows.`;
  }
  return null;
}

/** A unique title among `columns` ("Notes", "Notes 2", …). */
export function uniqueColumnTitle(columns: readonly SheetColumn[], wanted: string): string {
  const base = str(wanted, SHEET_LIMITS.maxColumnTitle) || "Column";
  const taken = new Set(columns.map((c) => c.title.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const t = clip(`${base} ${i}`, SHEET_LIMITS.maxColumnTitle);
    if (!taken.has(t.toLowerCase())) return t;
  }
}

/** Convert existing values when a column's type changes. Returns how many could not convert. */
export function convertValues(
  from: SheetColumn,
  to: SheetColumn,
  values: readonly (SheetCellValue | undefined)[],
): { values: (SheetCellValue | null)[]; failed: number } {
  let failed = 0;
  const out = values.map((v) => {
    if (v === undefined) return null;
    const asText = from.type === to.type ? v : from.type === "checkbox" ? String(v) : cellText(from, v);
    const res = coerceCellValue(to, from.type === to.type ? v : asText);
    if (!res.ok) {
      failed += 1;
      return null;
    }
    return res.value;
  });
  return { values: out, failed };
}

/* ────────────────────────────────────────────────── paste / export ── */

/**
 * Parse tab- or comma-separated text, as Google Sheets and Excel put on the clipboard.
 * RFC 4180 quoting: a quoted field may contain the delimiter, a newline, and `""` for a
 * quote. The delimiter is a tab when the first line has one — that is what a copy from
 * Google Sheets produces — else a comma.
 */
export function parseDelimited(text: string, delimiter?: "\t" | ","): string[][] {
  const src = text.replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const delim = delimiter ?? (firstLine.includes("\t") ? "\t" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing blank line from the clipboard is not a row.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ImportPlan {
  /** Columns to create first (unmatched headers), as text columns. */
  newColumns: SheetColumn[];
  /** For each pasted column, the sheet column it lands in (null = skipped). */
  mapping: (string | null)[];
  rows: SheetCells[];
  /** Cells that could not be stored, in words, for the preview. */
  problems: string[];
  skippedColumns: string[];
  /** Pasted names in person columns that matched nobody (or several people) — kept as text. */
  unmatchedPeople: number;
}

/**
 * Plan a paste. With headers, each pasted column matches an existing column by title
 * (without case); an unmatched header becomes a new text column when `allowNewColumns`
 * (the team), and is skipped otherwise (the client never changes structure). Without
 * headers, pasted columns fill the sheet's columns left to right.
 */
export function planImport(
  grid: string[][],
  columns: readonly SheetColumn[],
  opts: {
    firstRowHeaders: boolean;
    allowNewColumns: boolean;
    isEditable?: (c: SheetColumn) => boolean;
    /** The person directory. A pasted name matching exactly one person becomes that person. */
    people?: readonly PersonEntry[];
  },
): ImportPlan {
  let unmatchedPeople = 0;
  const problems: string[] = [];
  const skippedColumns: string[] = [];
  const newColumns: SheetColumn[] = [];
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const all = [...columns];
  const mapping: (string | null)[] = [];
  const editable = opts.isEditable ?? (() => true);

  if (opts.firstRowHeaders) {
    const headers = grid[0] ?? [];
    for (let i = 0; i < width; i++) {
      const h = (headers[i] ?? "").trim();
      const hit = h ? findColumn(all, h) : undefined;
      if (hit) {
        if (editable(hit)) mapping.push(hit.id);
        else {
          mapping.push(null);
          skippedColumns.push(hit.title);
        }
        continue;
      }
      if (h && opts.allowNewColumns && all.length < SHEET_LIMITS.maxColumns) {
        const col: SheetColumn = {
          id: newSheetColumnId(),
          title: uniqueColumnTitle(all, h),
          type: "text",
          clientEditable: true,
        };
        all.push(col);
        newColumns.push(col);
        mapping.push(col.id);
      } else {
        mapping.push(null);
        if (h) skippedColumns.push(h);
      }
    }
  } else {
    const targets = columns.filter(editable);
    for (let i = 0; i < width; i++) mapping.push(targets[i]?.id ?? null);
  }

  const body = opts.firstRowHeaders ? grid.slice(1) : grid;
  const rows: SheetCells[] = [];
  body.slice(0, SHEET_LIMITS.maxBatch).forEach((line, r) => {
    const cells: SheetCells = {};
    mapping.forEach((colId, c) => {
      if (!colId) return;
      const col = all.find((x) => x.id === colId)!;
      const text = line[c] ?? "";
      if (col.type === "person" && text.trim()) {
        // A name that matches exactly one person becomes that person; anything else is kept
        // as plain text (and counted, so the preview can say so) rather than guessed.
        const hit = opts.people ? resolvePersonRef(opts.people, text) : null;
        if (hit?.ok) {
          cells[colId] = hit.person;
          return;
        }
        unmatchedPeople += 1;
      }
      const res = coerceCellValue(col, text);
      if (res.ok) {
        if (res.value !== null) cells[colId] = res.value;
      } else if (problems.length < 20) {
        problems.push(`Row ${r + 1}: ${res.error}`);
      }
    });
    if (Object.keys(cells).length > 0) rows.push(cells);
  });
  if (body.length > SHEET_LIMITS.maxBatch) {
    problems.push(`Only the first ${SHEET_LIMITS.maxBatch} rows of a paste are imported.`);
  }
  return { newColumns, mapping, rows, problems, skippedColumns, unmatchedPeople };
}

/** Spreadsheet formula injection: a cell starting = + - @ would run when the CSV is opened. */
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeField(value: string, delimiter: string): string {
  if (delimiter === "\t") {
    // A TSV for the clipboard: tabs and newlines inside a value would split it, so they
    // become spaces. Google Sheets reads that back as one cell.
    return value.replace(/[\t\r\n]+/g, " ");
  }
  const safe = neutralise(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV (for download) or TSV (for paste into Google Sheets), header row first. */
export function exportSheet(
  columns: readonly SheetColumn[],
  rows: readonly { cells: SheetCells; stage?: RequestStage | null }[],
  delimiter: "," | "\t",
  opts: { stageLabel?: (s: RequestStage | null) => string } = {},
): string {
  const head = columns.map((c) => c.title);
  if (opts.stageLabel) head.push("Board");
  const lines = [head.map((h) => escapeField(h, delimiter)).join(delimiter)];
  for (const row of rows) {
    const fields = columns.map((c) => cellText(c, row.cells[c.id]));
    if (opts.stageLabel) fields.push(opts.stageLabel(row.stage ?? null));
    lines.push(fields.map((f) => escapeField(f, delimiter)).join(delimiter));
  }
  return lines.join(delimiter === "," ? "\r\n" : "\n");
}

/* ──────────────────────────────────────────────────── board / stage ── */

/**
 * Where a row's task has got to. Null = not on the board. A row with a `taskId` whose task
 * could not be found reads as REVIEWING ("with the team"), never SCHEDULED — reusing
 * `deriveRequestStage` so the sheet and the Requests page use one vocabulary (§47.2).
 */
export function deriveSheetRowStage(
  taskId: string | null,
  taskStatus: WikiTaskStatus | null,
): RequestStage | null {
  if (!taskId) return null;
  return deriveRequestStage("TRIAGED", taskStatus);
}

/** The task title for a row, from the title column; falls back to the sheet's name. */
export function rowTaskTitle(
  sheet: { title: string; columns: readonly SheetColumn[]; titleColumnId: string | null },
  cells: SheetCells,
): string | null {
  const col = titleColumn(sheet.columns, sheet.titleColumnId);
  const text = col ? cellText(col, cells[col.id]).replace(/\s+/g, " ").trim() : "";
  return text ? clip(text, 200) : null;
}

/** The task description: every other non-empty cell as `**Column:** value`, plus a link back. */
export function rowTaskDescription(
  sheet: { title: string; columns: readonly SheetColumn[]; titleColumnId: string | null },
  cells: SheetCells,
  sheetUrl: string | null,
): string {
  const title = titleColumn(sheet.columns, sheet.titleColumnId);
  const lines: string[] = [];
  for (const col of sheet.columns) {
    if (col.id === title?.id) continue;
    const value = cells[col.id];
    if (isMediaList(value) && value.length) {
      // Media goes on the task as real links, each under its tidy title.
      lines.push(`**${col.title}:**\n${value.map((m) => `- [${markdownText(mediaTitle(m))}](${m.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`).join("\n")}`);
      continue;
    }
    const text = cellText(col, value);
    if (!text) continue;
    lines.push(col.type === "long_text" ? `**${col.title}:**\n${text}` : `**${col.title}:** ${text}`);
  }
  const link = sheetUrl ? `From the sheet [${sheet.title}](${sheetUrl}).` : `From the sheet "${sheet.title}".`;
  return [...lines, "", link].join("\n").trim();
}

/* ──────────────────────────────────────────────── client permissions ── */

export interface SheetPermissions {
  clientCanEdit: boolean;
  clientCanAddRows: boolean;
  clientCanSendToBoard: boolean;
}

/** May the client change this column's cells? Both the sheet and the column must allow it. */
export function clientCanEditColumn(sheet: SheetPermissions, column: Pick<SheetColumn, "clientEditable">): boolean {
  return sheet.clientCanEdit && column.clientEditable;
}

/** A client may remove only a row they created, and only with their own wiki user id. */
export function clientCanDeleteRow(
  row: { createdByKind: string; createdByWikiUserId: string | null },
  wikiUserId: string | null,
): boolean {
  return row.createdByKind === "CLIENT" && Boolean(wikiUserId) && row.createdByWikiUserId === wikiUserId;
}

/** Team is told about client edits at most once per sheet per window. */
export const CLIENT_EDIT_NOTIFY_WINDOW_MS = 15 * 60_000;

export function shouldNotifyClientEdit(lastNotifiedAt: Date | null, now: Date): boolean {
  return !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() >= CLIENT_EDIT_NOTIFY_WINDOW_MS;
}

/* ──────────────────────────────────────────────────────────── search ── */

/** A title inside `[…]` must not close the link early. */
function markdownText(text: string): string {
  return text.replace(/[[\]]/g, "");
}

/** All of a row's cell text, for the fuzzy search. Media is searched by its titles. */
export function rowSearchText(columns: readonly SheetColumn[], cells: SheetCells): string {
  return columns
    .map((c) => {
      const v = cells[c.id];
      return isMediaList(v) ? v.map((m: SheetMediaItem) => mediaTitle(m)).join(" ") : cellText(c, v);
    })
    .filter(Boolean)
    .join(" ");
}
