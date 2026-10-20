/**
 * Comparisons — the pure rules behind a comparison table (no Prisma, no React).
 *
 * The editor, the server, the validator and the MCP tools all go through this file, so a
 * table edited in the wiki and one written by Claude over MCP obey the same limits and the
 * same cell vocabulary. Columns and rows are JSON in the database (replaced wholesale on
 * every write), which is why `parseComparisonContent` exists: whatever is stored, what
 * reaches a renderer is always a well-formed table — unknown states read as blank, text is
 * clipped, cells for a deleted column are dropped and every id is unique.
 */

import type {
  ComparisonCell,
  ComparisonCellState,
  ComparisonColumn,
  ComparisonRow,
} from "@/types/wiki-comparisons";

export const COMPARISON_LIMITS = {
  /** Harry's ceiling. Past this a table is a spreadsheet, not a comparison. */
  maxColumns: 45,
  maxRows: 300,
  maxTables: 40,
  maxTableTitle: 120,
  maxDescription: 600,
  maxColumnTitle: 60,
  maxColumnSubtitle: 60,
  maxLabel: 160,
  maxNote: 300,
  /** A cell is a short value ("10 GB", "£9/mo"), not a paragraph. */
  maxText: 40,
} as const;

export const CELL_STATES: readonly ComparisonCellState[] = ["yes", "no", "partial", "text", "none"];

/** What a cell means, in words — the accessible name of every glyph, and the legend. */
export const CELL_LABEL: Record<ComparisonCellState, string> = {
  yes: "Included",
  partial: "Partly included",
  no: "Not included",
  text: "Value",
  none: "Not stated",
};

export interface ComparisonContent {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
}

/* ─────────────────────────────────────────────────────────────── ids ── */

let counter = 0;
/** A short, collision-safe id for a new column or row. Not a database id. */
export function newComparisonId(prefix: "col" | "row"): string {
  counter += 1;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}${counter.toString(36)}`;
}

/* ──────────────────────────────────────────────────────────── parsing ── */

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const t = value.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

function isState(value: unknown): value is ComparisonCellState {
  return typeof value === "string" && (CELL_STATES as readonly string[]).includes(value);
}

/** One cell. An unknown state is blank; a text cell with no text is blank too. */
export function parseCell(raw: unknown): ComparisonCell {
  if (!raw || typeof raw !== "object") return { state: "none" };
  const r = raw as Record<string, unknown>;
  const state: ComparisonCellState = isState(r.state) ? r.state : "none";
  const text = str(r.text, COMPARISON_LIMITS.maxText);
  if (state === "text") return text ? { state, text } : { state: "none" };
  if (state === "none") return { state };
  // A qualifier on a tick ("✓ 5 seats") is kept; it is drawn beside the glyph.
  return text ? { state, text } : { state };
}

/** Unique ids: a missing or repeated id is replaced, so two cells can never share a key. */
function uniqueId(raw: unknown, seen: Set<string>, fallback: string): string {
  let id = typeof raw === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "";
  if (!id || seen.has(id)) {
    id = fallback;
    let n = 1;
    while (seen.has(id)) id = `${fallback}-${n++}`;
  }
  seen.add(id);
  return id;
}

export function parseColumns(value: unknown): ComparisonColumn[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ComparisonColumn[] = [];
  for (const raw of value) {
    if (out.length >= COMPARISON_LIMITS.maxColumns) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = uniqueId(r.id, seen, `col-${out.length + 1}`);
    const title = str(r.title, COMPARISON_LIMITS.maxColumnTitle) || `Column ${out.length + 1}`;
    const subtitle = str(r.subtitle, COMPARISON_LIMITS.maxColumnSubtitle);
    out.push({
      id,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(r.highlight === true ? { highlight: true } : {}),
    });
  }
  return out;
}

export function parseRows(value: unknown, columns: ComparisonColumn[]): ComparisonRow[] {
  if (!Array.isArray(value)) return [];
  const colIds = new Set(columns.map((c) => c.id));
  const seen = new Set<string>();
  const out: ComparisonRow[] = [];
  for (const raw of value) {
    if (out.length >= COMPARISON_LIMITS.maxRows) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const kind = r.kind === "group" ? "group" : "row";
    const id = uniqueId(r.id, seen, `row-${out.length + 1}`);
    const label = str(r.label, COMPARISON_LIMITS.maxLabel);
    const note = str(r.note, COMPARISON_LIMITS.maxNote);
    const cells: Record<string, ComparisonCell> = {};
    if (kind === "row" && r.cells && typeof r.cells === "object" && !Array.isArray(r.cells)) {
      for (const [colId, cell] of Object.entries(r.cells as Record<string, unknown>)) {
        // A cell for a deleted column is dropped, not drawn under the wrong heading.
        if (!colIds.has(colId)) continue;
        const parsed = parseCell(cell);
        if (parsed.state !== "none") cells[colId] = parsed;
      }
    }
    out.push({ id, kind, label, ...(note ? { note } : {}), cells });
  }
  return out;
}

export function parseComparisonContent(columns: unknown, rows: unknown): ComparisonContent {
  const cols = parseColumns(columns);
  return { columns: cols, rows: parseRows(rows, cols) };
}

/* ───────────────────────────────────────────────────────── validation ── */

/**
 * The one limit check, shared by the Zod schema, the editor and the MCP tools. Returns a
 * sentence a person can act on, or null. Parsing clips silently on READ (a stored table
 * must always render); a WRITE that breaks a limit is refused and told why.
 */
export function comparisonLimitError(content: {
  columns: { title?: unknown }[];
  rows: unknown[];
}): string | null {
  const { maxColumns, maxRows } = COMPARISON_LIMITS;
  if (content.columns.length > maxColumns) {
    return `A comparison can have at most ${maxColumns} columns (this one has ${content.columns.length}).`;
  }
  if (content.rows.length > maxRows) {
    return `A comparison can have at most ${maxRows} rows (this one has ${content.rows.length}).`;
  }
  return null;
}

export function canAddColumn(content: ComparisonContent): boolean {
  return content.columns.length < COMPARISON_LIMITS.maxColumns;
}

/** Cells only for columns that exist, blank cells omitted, groups carry none. */
export function normaliseContent(content: ComparisonContent): ComparisonContent {
  return parseComparisonContent(content.columns, content.rows);
}

/** Something a client could read: at least one column and one labelled feature row. */
export function isPublishable(content: ComparisonContent): boolean {
  return (
    content.columns.length > 0 &&
    content.rows.some((r) => r.kind === "row" && r.label.trim().length > 0)
  );
}

/* ────────────────────────────────────────────────────────────── cells ── */

const CYCLE: ComparisonCellState[] = ["yes", "partial", "no", "none"];

/** Click-to-cycle: ✓ → ◐ → ✕ → blank → ✓. A text cell starts the cycle again at ✓. */
export function cycleCellState(state: ComparisonCellState): ComparisonCellState {
  const i = CYCLE.indexOf(state);
  return i === -1 ? "yes" : CYCLE[(i + 1) % CYCLE.length];
}

const YES = new Set(["yes", "y", "true", "included", "include", "✓", "✔", "✔️", "✅", "tick", "check"]);
const NO = new Set([
  "no", "n", "false", "not included", "excluded", "✕", "✗", "✘", "×", "x", "❌", "-", "—", "–", "cross",
]);
const PARTIAL = new Set(["partial", "partly", "limited", "some", "◐", "~", "half", "partially"]);
const NONE = new Set(["", "none", "blank", "null", "n/a", "na", "empty", "clear"]);

/**
 * Turn a value an agent (or a paste) wrote into a cell: "yes" / "no" / "partial" and their
 * common synonyms and glyphs map to those states; "none"/"" clear the cell; anything else
 * is a short text value, clipped to `maxText`.
 */
export function parseCellValue(input: unknown): ComparisonCell {
  if (input === true) return { state: "yes" };
  if (input === false) return { state: "no" };
  if (input === null || input === undefined) return { state: "none" };
  const raw = String(input).replace(/\s+/g, " ").trim();
  const key = raw.toLowerCase();
  if (YES.has(key)) return { state: "yes" };
  if (NO.has(key)) return { state: "no" };
  if (PARTIAL.has(key)) return { state: "partial" };
  if (NONE.has(key)) return { state: "none" };
  return parseCell({ state: "text", text: raw });
}

/** How a cell reads in plain text — for MCP output and the copy-to-clipboard path. */
export function cellToText(cell: ComparisonCell | undefined): string {
  if (!cell || cell.state === "none") return "";
  if (cell.state === "text") return cell.text ?? "";
  const base = cell.state;
  return cell.text ? `${base} (${cell.text})` : base;
}

/* ───────────────────────────────────────────────────────────── summary ── */

export interface ColumnCount {
  columnId: string;
  yes: number;
  partial: number;
  no: number;
  text: number;
  /** Feature rows (groups excluded), so "12 of 18" has an honest denominator. */
  rows: number;
}

export function columnCounts(content: ComparisonContent): ColumnCount[] {
  const features = content.rows.filter((r) => r.kind === "row");
  return content.columns.map((c) => {
    const count: ColumnCount = { columnId: c.id, yes: 0, partial: 0, no: 0, text: 0, rows: features.length };
    for (const r of features) {
      const s = r.cells[c.id]?.state;
      if (s === "yes" || s === "partial" || s === "no" || s === "text") count[s] += 1;
    }
    return count;
  });
}

/* ───────────────────────────────────────────────────────────── layout ── */

export interface ComparisonLayout {
  /**
   * `fit` — 2 to 5 columns share the card width evenly (table-layout: fixed, width 100%).
   * `scroll` — 6+ columns get a comfortable fixed width each and the table scrolls sideways
   * inside its own scroller, with the feature column pinned.
   */
  mode: "fit" | "scroll";
  /** Each plan column's width in px when scrolling; the floor below which `fit` gives up. */
  columnWidth: number;
  /** The pinned feature-name column. */
  featureWidth: number;
  /** The whole table's minimum width — what the scroller scrolls across. */
  minTableWidth: number;
}

/** Past this many columns an even split crushes each one below a readable width. */
export const FIT_MAX_COLUMNS = 5;

export function comparisonLayout(columnCount: number, compact = false): ComparisonLayout {
  const featureWidth = compact ? 148 : 240;
  if (columnCount <= FIT_MAX_COLUMNS) {
    const columnWidth = compact ? 84 : 120;
    return {
      mode: "fit",
      columnWidth,
      featureWidth,
      minTableWidth: featureWidth + Math.max(columnCount, 1) * columnWidth,
    };
  }
  // Wide tables tighten a little so more columns are on screen at once.
  const columnWidth = columnCount > 15 ? 112 : 128;
  return {
    mode: "scroll",
    columnWidth,
    featureWidth,
    minTableWidth: featureWidth + columnCount * columnWidth,
  };
}

/* ──────────────────────────────────────────────── editing (immutable) ── */

export function addColumns(
  content: ComparisonContent,
  columns: { title: string; subtitle?: string; highlight?: boolean }[],
): ComparisonContent {
  const total = content.columns.length + columns.length;
  if (total > COMPARISON_LIMITS.maxColumns) {
    throw new Error(
      `A comparison can have at most ${COMPARISON_LIMITS.maxColumns} columns — it has ` +
        `${content.columns.length}, so ${columns.length} more would make ${total}.`,
    );
  }
  const added = columns.map((c) => ({
    id: newComparisonId("col"),
    title: str(c.title, COMPARISON_LIMITS.maxColumnTitle) || "New column",
    ...(str(c.subtitle, COMPARISON_LIMITS.maxColumnSubtitle)
      ? { subtitle: str(c.subtitle, COMPARISON_LIMITS.maxColumnSubtitle) }
      : {}),
    ...(c.highlight ? { highlight: true } : {}),
  }));
  return { ...content, columns: [...content.columns, ...added] };
}

export function updateColumn(
  content: ComparisonContent,
  columnId: string,
  patch: Partial<Pick<ComparisonColumn, "title" | "subtitle" | "highlight">>,
): ComparisonContent {
  return {
    ...content,
    columns: content.columns.map((c) => {
      if (c.id !== columnId) return c;
      const next: ComparisonColumn = { ...c };
      if (patch.title !== undefined) {
        next.title = str(patch.title, COMPARISON_LIMITS.maxColumnTitle) || c.title;
      }
      if (patch.subtitle !== undefined) {
        const s = str(patch.subtitle, COMPARISON_LIMITS.maxColumnSubtitle);
        if (s) next.subtitle = s;
        else delete next.subtitle;
      }
      if (patch.highlight !== undefined) {
        if (patch.highlight) next.highlight = true;
        else delete next.highlight;
      }
      return next;
    }),
  };
}

/** Removes the column AND every cell under it, so nothing is orphaned in storage. */
export function removeColumn(content: ComparisonContent, columnId: string): ComparisonContent {
  return {
    columns: content.columns.filter((c) => c.id !== columnId),
    rows: content.rows.map((r) => {
      if (!(columnId in r.cells)) return r;
      const cells = { ...r.cells };
      delete cells[columnId];
      return { ...r, cells };
    }),
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function moveColumn(content: ComparisonContent, columnId: string, delta: number): ComparisonContent {
  const i = content.columns.findIndex((c) => c.id === columnId);
  return { ...content, columns: move(content.columns, i, i + delta) };
}

export function addRows(
  content: ComparisonContent,
  rows: { kind?: "row" | "group"; label: string; note?: string; cells?: Record<string, ComparisonCell> }[],
  atIndex?: number,
): ComparisonContent {
  const total = content.rows.length + rows.length;
  if (total > COMPARISON_LIMITS.maxRows) {
    throw new Error(
      `A comparison can have at most ${COMPARISON_LIMITS.maxRows} rows — it has ` +
        `${content.rows.length}, so ${rows.length} more would make ${total}.`,
    );
  }
  const colIds = new Set(content.columns.map((c) => c.id));
  const added: ComparisonRow[] = rows.map((r) => {
    const kind = r.kind === "group" ? "group" : "row";
    const cells: Record<string, ComparisonCell> = {};
    if (kind === "row") {
      for (const [id, cell] of Object.entries(r.cells ?? {})) {
        if (!colIds.has(id)) continue;
        const parsed = parseCell(cell);
        if (parsed.state !== "none") cells[id] = parsed;
      }
    }
    const note = str(r.note, COMPARISON_LIMITS.maxNote);
    return {
      id: newComparisonId("row"),
      kind,
      label: str(r.label, COMPARISON_LIMITS.maxLabel),
      ...(note ? { note } : {}),
      cells,
    };
  });
  const at = atIndex === undefined ? content.rows.length : Math.max(0, Math.min(atIndex, content.rows.length));
  const next = [...content.rows];
  next.splice(at, 0, ...added);
  return { ...content, rows: next };
}

export function updateRow(
  content: ComparisonContent,
  rowId: string,
  patch: { label?: string; note?: string; kind?: "row" | "group" },
): ComparisonContent {
  return {
    ...content,
    rows: content.rows.map((r) => {
      if (r.id !== rowId) return r;
      const next: ComparisonRow = { ...r };
      if (patch.label !== undefined) next.label = str(patch.label, COMPARISON_LIMITS.maxLabel);
      if (patch.note !== undefined) {
        const n = str(patch.note, COMPARISON_LIMITS.maxNote);
        if (n) next.note = n;
        else delete next.note;
      }
      if (patch.kind !== undefined) {
        next.kind = patch.kind;
        if (patch.kind === "group") next.cells = {};
      }
      return next;
    }),
  };
}

export function removeRow(content: ComparisonContent, rowId: string): ComparisonContent {
  return { ...content, rows: content.rows.filter((r) => r.id !== rowId) };
}

export function moveRow(content: ComparisonContent, rowId: string, delta: number): ComparisonContent {
  const i = content.rows.findIndex((r) => r.id === rowId);
  return { ...content, rows: move(content.rows, i, i + delta) };
}

/** Set one cell. A group row has no cells, so writing to one is refused. */
export function setCell(
  content: ComparisonContent,
  rowId: string,
  columnId: string,
  cell: ComparisonCell,
): ComparisonContent {
  if (!content.columns.some((c) => c.id === columnId)) throw new Error("No such column.");
  return {
    ...content,
    rows: content.rows.map((r) => {
      if (r.id !== rowId) return r;
      if (r.kind === "group") throw new Error(`"${r.label}" is a group heading and has no cells.`);
      const parsed = parseCell(cell);
      const cells = { ...r.cells };
      if (parsed.state === "none") delete cells[columnId];
      else cells[columnId] = parsed;
      return { ...r, cells };
    }),
  };
}

/* ─────────────────────────────────────────────────── finding by name ── */

function key(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Find a column by id or by title (case- and spacing-insensitive). An ambiguous title is
 * an error rather than a guess — writing a tick under the wrong plan is the one mistake a
 * comparison table cannot afford.
 */
export function findColumn(content: ComparisonContent, ref: string): ComparisonColumn {
  const byId = content.columns.find((c) => c.id === ref);
  if (byId) return byId;
  const hits = content.columns.filter((c) => key(c.title) === key(ref));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    throw new Error(`"${ref}" matches ${hits.length} columns — pass the column id instead.`);
  }
  throw new Error(
    `No column "${ref}". Columns: ${content.columns.map((c) => c.title).join(", ") || "(none)"}.`,
  );
}

export function findRow(content: ComparisonContent, ref: string): ComparisonRow {
  const byId = content.rows.find((r) => r.id === ref);
  if (byId) return byId;
  const hits = content.rows.filter((r) => key(r.label) === key(ref));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    throw new Error(`"${ref}" matches ${hits.length} rows — pass the row id instead.`);
  }
  throw new Error(`No row "${ref}".`);
}

/** Cells keyed by column TITLE (how a person or an agent writes them) → keyed by id. */
export function cellsByTitle(
  content: ComparisonContent,
  values: Record<string, unknown> | undefined,
): Record<string, ComparisonCell> {
  const out: Record<string, ComparisonCell> = {};
  for (const [ref, value] of Object.entries(values ?? {})) {
    const col = findColumn(content, ref);
    const cell = parseCellValue(value);
    if (cell.state !== "none") out[col.id] = cell;
  }
  return out;
}

/* ─────────────────────────────────────────────────────────── templates ── */

export interface ComparisonTemplate {
  id: string;
  label: string;
  blurb: string;
  build: () => ComparisonContent;
}

function template(
  columns: { title: string; highlight?: boolean }[],
  rows: { label: string; kind?: "group"; values?: string[] }[],
): ComparisonContent {
  const base = addColumns({ columns: [], rows: [] }, columns);
  return addRows(
    base,
    rows.map((r) => ({
      kind: r.kind ?? "row",
      label: r.label,
      cells: Object.fromEntries(
        (r.values ?? []).map((v, i) => [base.columns[i]?.id ?? "", parseCellValue(v)]),
      ),
    })),
  );
}

export const COMPARISON_TEMPLATES: ComparisonTemplate[] = [
  {
    id: "free-premium",
    label: "Free vs Premium",
    blurb: "Two plans, side by side.",
    build: () =>
      template(
        [{ title: "Free" }, { title: "Premium", highlight: true }],
        [
          { label: "Core", kind: "group" },
          { label: "Feature one", values: ["yes", "yes"] },
          { label: "Feature two", values: ["partial", "yes"] },
          { label: "Extras", kind: "group" },
          { label: "Feature three", values: ["no", "yes"] },
        ],
      ),
  },
  {
    id: "tiers",
    label: "Free / Pro / Enterprise",
    blurb: "Three tiers, the middle one recommended.",
    build: () =>
      template(
        [{ title: "Free" }, { title: "Pro", highlight: true }, { title: "Enterprise" }],
        [
          { label: "Price", values: ["£0", "£9/mo", "Talk to us"] },
          { label: "Features", kind: "group" },
          { label: "Feature one", values: ["yes", "yes", "yes"] },
          { label: "Feature two", values: ["no", "yes", "yes"] },
          { label: "Support", kind: "group" },
          { label: "Priority support", values: ["no", "partial", "yes"] },
        ],
      ),
  },
  {
    id: "competitors",
    label: "Us vs competitors",
    blurb: "The product against the alternatives.",
    build: () =>
      template(
        [{ title: "Us", highlight: true }, { title: "Competitor A" }, { title: "Competitor B" }],
        [
          { label: "Feature one", values: ["yes", "yes", "no"] },
          { label: "Feature two", values: ["yes", "partial", "partial"] },
          { label: "Feature three", values: ["yes", "no", "no"] },
        ],
      ),
  },
  {
    id: "blank",
    label: "Blank",
    blurb: "Two columns, nothing filled in.",
    build: () => template([{ title: "Option A" }, { title: "Option B" }], [{ label: "Feature" }]),
  },
];
