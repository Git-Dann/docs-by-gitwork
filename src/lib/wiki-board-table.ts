/**
 * The Board's Table view (src/components/clients/wiki/wiki-board-table.tsx): the same cards as the
 * Board, as spreadsheet rows. Pure, so the component, the demo and the tests share every rule.
 *
 * Sheets were retired in Nov 2026 (§127): "sheets is just a view" (Dan). What people liked about a
 * sheet was the grid: scan a long list, edit a cell in place, paste rows in from Google Sheets,
 * copy them back out. This is that grid over the Board's own cards, so a list of things to build
 * is never a second copy of the plan.
 *
 * Rules worth knowing:
 *   - Grouping by List is the default whenever any card is in a list; "No list" is always last.
 *   - Sorting is a view, never a write, and blanks go LAST in both directions (the sheet rule,
 *     `sortSheetRows`, reused here).
 *   - Editing goes through the same routes as the card dialog, one field per request, so every
 *     rule the server applies to an edit (no assignees ever, the team's dev tasks untouchable by
 *     the client) applies to a cell too. `cellEditable` is only what the UI offers.
 *   - A paste never loses a cell: a column that maps to no card field goes into the description
 *     as a "**Column:** value" line, the way Wedge's sheets were moved onto the Board.
 */

import { exportSheet, parseDelimited, parseSheetDate } from "@/lib/table/cells";
import { sortSheetRows } from "@/lib/table/sort";
import { BOARD_LIST_MAX, ITEM_TYPE_LABELS, TIERS, TIER_LABELS, isItemType } from "@/lib/tasks/product-cards";
import { BOARD_LIMITS, clientMayActOn } from "@/lib/wiki-board";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/types/tasks";
import type { SheetCells, SheetColumn } from "@/types/table";
import type { WikiBoardCard } from "@/types/wiki-board";

/* ─────────────────────────────────────────────────────────── columns ── */

export const TABLE_COLUMN_KEYS = [
  "title",
  "type",
  "list",
  "lane",
  "release",
  "area",
  "priority",
  "tier",
  "hours",
  "due",
  "dependsOn",
  "images",
  "people",
  "updated",
] as const;
export type TableColumnKey = (typeof TABLE_COLUMN_KEYS)[number];

export interface TableColumn {
  key: TableColumnKey;
  label: string;
  /** Px, the grid's starting width. */
  width: number;
  sortable: boolean;
}

export const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: "title", label: "Title", width: 280, sortable: true },
  { key: "type", label: "Type", width: 110, sortable: true },
  { key: "list", label: "List", width: 170, sortable: true },
  { key: "lane", label: "Column", width: 160, sortable: true },
  { key: "release", label: "Release", width: 150, sortable: true },
  { key: "area", label: "Area", width: 150, sortable: true },
  { key: "priority", label: "Priority", width: 100, sortable: true },
  { key: "tier", label: "Tier", width: 100, sortable: true },
  { key: "hours", label: "Hours", width: 80, sortable: true },
  { key: "due", label: "Due", width: 120, sortable: true },
  { key: "dependsOn", label: "Depends on", width: 180, sortable: false },
  { key: "images", label: "Screenshots", width: 110, sortable: true },
  { key: "people", label: "People", width: 140, sortable: true },
  { key: "updated", label: "Updated", width: 120, sortable: true },
];

/** What the table needs to know about the board to label and order things. */
export interface TableContext {
  lanes: ReadonlyArray<{ key: string; label: string }>;
  releases: ReadonlyArray<{ id: string; label: string }>;
}

function day(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A card's value in a column, as plain text: for display, search and export. */
export function cellText(card: WikiBoardCard, key: TableColumnKey, ctx: TableContext): string {
  switch (key) {
    case "title":
      return card.title;
    case "type":
      return isItemType(card.itemType) ? ITEM_TYPE_LABELS[card.itemType] : card.isCard ? "" : "Dev task";
    case "list":
      return card.list ?? "";
    case "lane":
      return ctx.lanes.find((l) => l.key === card.laneKey)?.label ?? "";
    case "release":
      return card.release?.label ?? "";
    case "area":
      return card.area ?? "";
    case "priority":
      return TASK_PRIORITY_LABELS[card.priority] ?? "";
    case "tier":
      return card.tier && (TIERS as readonly string[]).includes(card.tier) ? TIER_LABELS[card.tier as (typeof TIERS)[number]] : "";
    case "hours":
      return card.estimateHours === null ? "" : String(card.estimateHours);
    case "due":
      return day(card.dueDate);
    case "dependsOn":
      return card.dependsOn.map((d) => d.title).join(", ");
    case "images":
      return card.images.length ? String(card.images.length) : "";
    case "people":
      return card.people.join(", ");
    case "updated":
      return day(card.updatedAt);
  }
}

/* ─────────────────────────────────────────────────────────── editing ── */

/** The cells a table offers to edit. Assignees ("People") never: that is the team's alone (§126). */
export const EDITABLE_COLUMNS = ["title", "type", "list", "lane", "release", "area", "priority", "tier", "hours", "due"] as const;
export type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

export function isEditableColumn(key: TableColumnKey): key is EditableColumn {
  return (EDITABLE_COLUMNS as readonly string[]).includes(key);
}

/**
 * Whether this viewer may act on this card from the table. The client: their product cards and
 * the cards they added, never the team's dev tasks. The team previewing the client's view gets
 * the client's answer. The server checks the same rule on every write.
 */
export function mayActOnCard(card: Pick<WikiBoardCard, "isCard" | "addedByClient">, asClient: boolean): boolean {
  return !asClient || clientMayActOn(card);
}

/**
 * Whether a cell is offered for editing. A dev task (not a product card the client added) is only
 * ever moved between columns, by the team; its fields are edited on the task board.
 */
export function cellEditable(card: Pick<WikiBoardCard, "isCard" | "addedByClient">, key: TableColumnKey, asClient: boolean): boolean {
  if (!isEditableColumn(key)) return false;
  if (!mayActOnCard(card, asClient)) return false;
  const card_ = card.isCard || card.addedByClient;
  if (!card_) return key === "lane";
  return true;
}

/**
 * The PATCH body for one edited cell, or the reason it can't be saved. Exactly one field, so the
 * card's thread records exactly what changed. `lane` isn't a PATCH: it's a move (null here).
 */
export function cellPatch(
  key: EditableColumn,
  raw: string,
  ctx: TableContext,
): { ok: true; patch: Record<string, unknown> | null } | { ok: false; error: string } {
  const v = raw.trim();
  switch (key) {
    case "title":
      if (!v) return { ok: false, error: "Give the card a title." };
      if (v.length > BOARD_LIMITS.title) return { ok: false, error: `Keep the title under ${BOARD_LIMITS.title} characters.` };
      return { ok: true, patch: { title: v } };
    case "type":
      if (v !== "feature" && v !== "bug" && v !== "feedback") return { ok: false, error: "Choose Feature, Bug or Feedback." };
      return { ok: true, patch: { itemType: v } };
    case "list":
      if (v.length > BOARD_LIST_MAX) return { ok: false, error: `Keep the list name under ${BOARD_LIST_MAX} characters.` };
      return { ok: true, patch: { list: v || null } };
    case "area":
      if (v.length > BOARD_LIMITS.area) return { ok: false, error: `Keep the area under ${BOARD_LIMITS.area} characters.` };
      return { ok: true, patch: { area: v || null } };
    case "release":
      if (v && !ctx.releases.some((r) => r.id === v)) return { ok: false, error: "That release isn't on this board." };
      return { ok: true, patch: { releaseId: v || null } };
    case "priority":
      if (!(TASK_PRIORITIES as string[]).includes(v)) return { ok: false, error: "Choose Low, Medium or High." };
      return { ok: true, patch: { priority: v } };
    case "tier":
      if (v && !(TIERS as readonly string[]).includes(v)) return { ok: false, error: "Choose Free, Premium or Scoping." };
      return { ok: true, patch: { tier: v || null } };
    case "hours": {
      if (!v) return { ok: true, patch: { estimateHours: null } };
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > BOARD_LIMITS.estimateHours) {
        return { ok: false, error: `Hours are a number from 0 to ${BOARD_LIMITS.estimateHours}.` };
      }
      return { ok: true, patch: { estimateHours: n } };
    }
    case "due": {
      if (!v) return { ok: true, patch: { dueDate: null } };
      const iso = parseSheetDate(v);
      if (!iso) return { ok: false, error: "Use a date like 21/11/2026." };
      return { ok: true, patch: { dueDate: iso } };
    }
    case "lane":
      if (!ctx.lanes.some((l) => l.key === v)) return { ok: false, error: "That column isn't on this board." };
      return { ok: true, patch: null };
  }
}

/* ─────────────────────────────────────────────────────────── grouping ── */

export const TABLE_GROUP_BY = ["list", "lane", "release", "none"] as const;
export type TableGroupBy = (typeof TABLE_GROUP_BY)[number];

export const TABLE_GROUP_LABELS: Record<TableGroupBy, string> = {
  list: "List",
  lane: "Column",
  release: "Release",
  none: "None",
};

/** List when any card is in one (that's what lists are for); otherwise the board's columns. */
export function defaultGroupBy(cards: ReadonlyArray<Pick<WikiBoardCard, "list">>): TableGroupBy {
  return cards.some((c) => c.list) ? "list" : "lane";
}

export interface TableGroup {
  key: string;
  label: string;
  cards: WikiBoardCard[];
  /** What a card added at the foot of this group starts with. */
  seed: { list?: string | null; laneKey?: string; releaseId?: string | null };
}

const COLLATOR = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" });

/**
 * The cards in groups, each group keeping the cards' order. Lists sort by name (naturally, so
 * "Sprint 2" comes before "Sprint 10"); columns and releases keep the board's order. The group
 * for cards with nothing set is always last, and an empty group isn't shown.
 */
export function groupTableCards(cards: readonly WikiBoardCard[], by: TableGroupBy, ctx: TableContext): TableGroup[] {
  if (by === "none") return cards.length ? [{ key: "all", label: "All cards", cards: [...cards], seed: {} }] : [];
  if (by === "list") {
    const names = new Map<string, string>();
    for (const c of cards) {
      const name = c.list?.trim();
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    const out: TableGroup[] = [...names.entries()]
      .sort((a, b) => COLLATOR.compare(a[1], b[1]))
      .map(([k, name]) => ({
        key: `list:${k}`,
        label: name,
        cards: cards.filter((c) => c.list?.trim().toLowerCase() === k),
        seed: { list: name },
      }));
    const none = cards.filter((c) => !c.list?.trim());
    if (none.length) out.push({ key: "list:", label: "No list", cards: none, seed: { list: null } });
    return out;
  }
  if (by === "lane") {
    const out: TableGroup[] = ctx.lanes
      .map((l): TableGroup => ({ key: `lane:${l.key}`, label: l.label, cards: cards.filter((c) => c.laneKey === l.key), seed: { laneKey: l.key } }))
      .filter((g) => g.cards.length > 0);
    const known = new Set(ctx.lanes.map((l) => l.key));
    const stray = cards.filter((c) => !known.has(c.laneKey));
    if (stray.length) out.push({ key: "lane:", label: "Other", cards: stray, seed: {} });
    return out;
  }
  const out: TableGroup[] = ctx.releases
    .map((r): TableGroup => ({ key: `release:${r.id}`, label: r.label, cards: cards.filter((c) => c.release?.id === r.id), seed: { releaseId: r.id } }))
    .filter((g) => g.cards.length > 0);
  const none = cards.filter((c) => !c.release || !ctx.releases.some((r) => r.id === c.release!.id));
  if (none.length) out.push({ key: "release:", label: "No release", cards: none, seed: { releaseId: null } });
  return out;
}

/* ─────────────────────────────────────────────────────────── sorting ── */

export type TableSortDir = "asc" | "desc";
export interface TableSort {
  key: TableColumnKey;
  dir: TableSortDir;
}

/**
 * The cards in `sort` order, through the sheet sorter (`sortSheetRows`): blanks last both ways,
 * ties keep the board's order, and a ranked field (priority, column, release, type, tier) sorts by
 * its rank rather than alphabetically. Null keeps the order given.
 */
export function sortTableCards(cards: readonly WikiBoardCard[], sort: TableSort | null, ctx: TableContext): WikiBoardCard[] {
  if (!sort) return [...cards];
  const col = TABLE_COLUMNS.find((c) => c.key === sort.key);
  if (!col?.sortable) return [...cards];
  const column = sortColumn(sort.key, ctx);
  const rows = cards.map((card) => ({ card, cells: { v: sortValue(card, sort.key, ctx) } as SheetCells, stage: null }));
  return sortSheetRows(rows, [column], { key: "v", dir: sort.dir }).map((r) => r.card);
}

function sortColumn(key: TableColumnKey, ctx: TableContext): SheetColumn {
  const base = { id: "v", title: key, clientEditable: false };
  switch (key) {
    case "hours":
    case "images":
      return { ...base, type: "number" };
    case "due":
    case "updated":
      return { ...base, type: "date" };
    case "priority":
      return { ...base, type: "select", options: TASK_PRIORITIES.map((p) => TASK_PRIORITY_LABELS[p]) };
    case "lane":
      return { ...base, type: "select", options: ctx.lanes.map((l) => l.label) };
    case "release":
      return { ...base, type: "select", options: ctx.releases.map((r) => r.label) };
    case "tier":
      return { ...base, type: "select", options: TIERS.map((t) => TIER_LABELS[t]) };
    case "type":
      return { ...base, type: "select", options: ["Feature", "Sub-item", "Bug", "Feedback", "Dev task"] };
    default:
      return { ...base, type: "text" };
  }
}

function sortValue(card: WikiBoardCard, key: TableColumnKey, ctx: TableContext): string | number {
  switch (key) {
    case "hours":
      return card.estimateHours ?? "";
    case "images":
      // No screenshots sorts with the blanks, last.
      return card.images.length || "";
    case "due":
      return card.dueDate?.slice(0, 10) ?? "";
    case "updated":
      return card.updatedAt.slice(0, 10);
    default:
      return cellText(card, key, ctx);
  }
}

/* ─────────────────────────────────────────────────────────── export ── */

/** The visible rows as CSV (download) or TSV (paste into Google Sheets). Formula injection neutralised. */
export function exportTable(
  cards: readonly WikiBoardCard[],
  columns: readonly TableColumnKey[],
  ctx: TableContext,
  delimiter: "," | "\t",
): string {
  const cols: SheetColumn[] = columns.map((key) => ({
    id: key,
    title: TABLE_COLUMNS.find((c) => c.key === key)?.label ?? key,
    type: "text",
    clientEditable: false,
  }));
  const rows = cards.map((card) => ({
    cells: Object.fromEntries(columns.map((key) => [key, cellText(card, key, ctx)])) as SheetCells,
  }));
  return exportSheet(cols, rows, delimiter);
}

/* ─────────────────────────────────────────────────────────── paste ── */

/** The most rows one paste adds. A bigger list goes in a few pastes. */
export const TABLE_PASTE_MAX = 200;

export const PASTE_FIELDS = ["title", "type", "list", "lane", "release", "area", "priority", "tier", "hours", "due", "description"] as const;
export type PasteField = (typeof PASTE_FIELDS)[number];

export const PASTE_FIELD_LABELS: Record<PasteField, string> = {
  title: "Title",
  type: "Type",
  list: "List",
  lane: "Column",
  release: "Release",
  area: "Area",
  priority: "Priority",
  tier: "Tier",
  hours: "Hours",
  due: "Due date",
  description: "Description",
};

const HEADER_GUESSES: Array<[PasteField, RegExp]> = [
  ["title", /^(title|name|item|issue|feature|summary|task|card|request)s?$/],
  ["type", /^(type|kind|item type|category)$/],
  ["list", /^(list|sheet|group)$/],
  ["lane", /^(column|status|stage|lane|state)$/],
  ["release", /^(release|version|milestone|build target)$/],
  ["area", /^(area|module|section|feature area|product area)$/],
  ["priority", /^(priority|prio|importance)$/],
  ["tier", /^(tier|plan)$/],
  ["hours", /^(hours|estimate|estimate \(hours\)|est|effort \(hours\))$/],
  ["due", /^(due|due date|deadline|date due|target date)$/],
  ["description", /^(description|detail|details|body|notes?)$/],
];

/** The card field a pasted header most likely means, or null (its values go into the description). */
export function guessPasteField(header: string): PasteField | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [field, re] of HEADER_GUESSES) if (re.test(h)) return field;
  return null;
}

/** Whether the first pasted row is a header: any of its cells names a field. */
export function looksLikeHeader(row: readonly string[]): boolean {
  return row.some((c) => guessPasteField(c) !== null);
}

/** One card a paste will add: the fields the add route takes, plus where it should end up. */
export interface PastedCard {
  title: string;
  itemType: "feature" | "bug" | "feedback";
  list: string | null;
  /** The column to move it to after it's added, when that isn't an early column (null = stay). */
  moveToLaneKey: string | null;
  releaseId: string | null;
  area: string | null;
  priority: TaskPriority;
  tier: string | null;
  estimateHours: number | null;
  dueDate: string | null;
  description: string | null;
}

export interface PastePlan {
  header: string[];
  /** One entry per pasted column: the field it fills, or null (→ description). */
  mapping: Array<PasteField | null>;
  cards: PastedCard[];
  /** Rows with no title, left out. */
  skippedRows: number;
  problems: string[];
}

function matchLabel<T>(value: string, options: ReadonlyArray<{ id: T; label: string }>): T | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return options.find((o) => o.label.toLowerCase() === v)?.id;
}

function pasteType(v: string): PastedCard["itemType"] | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (t === "bug" || t === "bugs" || t === "defect" || t === "issue") return "bug";
  if (t === "feedback" || t === "idea" || t === "suggestion") return "feedback";
  if (t === "feature" || t === "features" || t === "story") return "feature";
  return null;
}

function pastePriority(v: string): TaskPriority | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (t === "low" || t === "p3" || t === "p4") return "LOW";
  if (t === "medium" || t === "med" || t === "normal" || t === "p2") return "MEDIUM";
  if (t === "high" || t === "urgent" || t === "critical" || t === "p1" || t === "p0") return "HIGH";
  return null;
}

/**
 * Plan a paste from Google Sheets (or Excel, or CSV): which pasted column fills which card field,
 * and the cards it makes. Nothing pasted is lost: a column mapped to nothing, and anything that
 * didn't fit its field (an unknown type, a date it couldn't read), goes into the description as
 * "**Column:** value", in column order.
 */
export function planTablePaste(
  text: string,
  ctx: TableContext & { addLaneKeys: readonly string[] },
  opts: { list?: string | null; mapping?: ReadonlyArray<PasteField | null>; hasHeader?: boolean } = {},
): PastePlan {
  const rows = parseDelimited(text);
  const problems: string[] = [];
  if (!rows.length) return { header: [], mapping: [], cards: [], skippedRows: 0, problems: ["Paste some rows first."] };
  const width = Math.max(...rows.map((r) => r.length));
  const hasHeader = opts.hasHeader ?? looksLikeHeader(rows[0]);
  const header = hasHeader
    ? Array.from({ length: width }, (_, i) => rows[0][i]?.trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  let body = hasHeader ? rows.slice(1) : rows;
  let mapping: Array<PasteField | null> =
    opts.mapping && opts.mapping.length === width
      ? [...opts.mapping]
      : header.map((h) => (hasHeader ? guessPasteField(h) : null));
  // Without a title column the first column is the title: a pasted list is usually titles first.
  if (!mapping.includes("title")) mapping = mapping.map((m, i) => (i === 0 && m === null ? "title" : m));
  // A field fills from one column; a second column guessed as the same field goes to the description.
  const seen = new Set<PasteField>();
  mapping = mapping.map((m) => {
    if (!m || m === "description") return m;
    if (seen.has(m)) return null;
    seen.add(m);
    return m;
  });
  if (!mapping.includes("title")) problems.push("Choose which column is the title.");
  if (body.length > TABLE_PASTE_MAX) {
    problems.push(`Only the first ${TABLE_PASTE_MAX} rows of a paste are added. Paste the rest after.`);
    body = body.slice(0, TABLE_PASTE_MAX);
  }
  const lanes = ctx.lanes.map((l) => ({ id: l.key, label: l.label }));
  const releases = ctx.releases.map((r) => ({ id: r.id, label: r.label }));
  const tiers = TIERS.map((t) => ({ id: t as string, label: TIER_LABELS[t] }));
  const cards: PastedCard[] = [];
  let skippedRows = 0;
  for (const row of body) {
    const card: PastedCard = {
      title: "",
      itemType: "feature",
      list: opts.list?.trim() ? opts.list.trim().slice(0, BOARD_LIST_MAX) : null,
      moveToLaneKey: null,
      releaseId: null,
      area: null,
      priority: "MEDIUM",
      tier: null,
      estimateHours: null,
      dueDate: null,
      description: null,
    };
    const extra: string[] = [];
    const keep = (i: number, value: string) => {
      if (value.trim()) extra.push(`**${header[i]}:** ${value.trim()}`);
    };
    mapping.forEach((field, i) => {
      const value = (row[i] ?? "").trim();
      if (!value) return;
      switch (field) {
        case "title":
          card.title = value.slice(0, BOARD_LIMITS.title);
          if (value.length > BOARD_LIMITS.title) keep(i, value);
          return;
        case "type": {
          const t = pasteType(value);
          if (t) card.itemType = t;
          else keep(i, value);
          return;
        }
        case "list":
          card.list = value.slice(0, BOARD_LIST_MAX);
          return;
        case "lane": {
          const key = matchLabel(value, lanes);
          if (key && !ctx.addLaneKeys.includes(key)) card.moveToLaneKey = key;
          if (!key) keep(i, value);
          return;
        }
        case "release": {
          const id = matchLabel(value, releases);
          if (id) card.releaseId = id;
          else keep(i, value);
          return;
        }
        case "area":
          card.area = value.slice(0, BOARD_LIMITS.area);
          return;
        case "priority": {
          const p = pastePriority(value);
          if (p) card.priority = p;
          else keep(i, value);
          return;
        }
        case "tier": {
          const t = matchLabel(value, tiers);
          if (t) card.tier = t;
          else keep(i, value);
          return;
        }
        case "hours": {
          const n = Number(value.replace(/h(ours?)?$/i, "").trim());
          if (Number.isFinite(n) && n >= 0 && n <= BOARD_LIMITS.estimateHours) card.estimateHours = n;
          else keep(i, value);
          return;
        }
        case "due": {
          const iso = parseSheetDate(value);
          if (iso) card.dueDate = iso;
          else keep(i, value);
          return;
        }
        case "description":
          extra.push(mapping.filter((m) => m === "description").length > 1 ? `**${header[i]}:** ${value}` : value);
          return;
        default:
          keep(i, value);
      }
    });
    if (!card.title) {
      skippedRows += 1;
      continue;
    }
    const description = extra.join("\n\n").slice(0, BOARD_LIMITS.description);
    card.description = description || null;
    cards.push(card);
  }
  if (skippedRows) problems.push(`${skippedRows} row${skippedRows === 1 ? " has" : "s have"} no title and won't be added.`);
  return { header, mapping, cards, skippedRows, problems };
}

/* ─────────────────────────────────────────────────────────── bulk ── */

export const BULK_FIELDS = ["list", "lane", "release", "area", "priority", "tier"] as const;
export type BulkField = (typeof BULK_FIELDS)[number];

export const BULK_FIELD_LABELS: Record<BulkField, string> = {
  list: "List",
  lane: "Column",
  release: "Release",
  area: "Area",
  priority: "Priority",
  tier: "Tier",
};

/**
 * Which selected cards a bulk change reaches: the ones this viewer may change that field on. The
 * rest are counted so the bar can say "3 of your selection are Gitwork's own tasks".
 */
export function bulkTargets(
  cards: readonly WikiBoardCard[],
  selected: ReadonlySet<string>,
  field: BulkField | "delete",
  asClient: boolean,
): { cards: WikiBoardCard[]; skipped: number } {
  const picked = cards.filter((c) => selected.has(c.id));
  // Deleting is for cards, never a dev task, whoever asks: a dev task is deleted on the task board.
  const ok = picked.filter((c) => cellEditable(c, field === "delete" ? "title" : field, asClient));
  return { cards: ok, skipped: picked.length - ok.length };
}

/* ─────────────────────────────────────────────────────────── this viewer's choices ── */

export type BoardView = "board" | "table" | "timeline" | "calendar";

export interface BoardPrefs {
  view?: BoardView;
  groupBy?: TableGroupBy;
  sort?: TableSort | null;
}

export function boardPrefsKey(boardKey: string): string {
  return `foundry.board.prefs.v1.${boardKey}`;
}

const VIEWS: readonly BoardView[] = ["board", "table", "timeline", "calendar"];

/** This viewer's last view, grouping and sort for this board. Anything unreadable is ignored. */
export function parseBoardPrefs(raw: string | null): BoardPrefs {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: BoardPrefs = {};
    if (typeof v.view === "string" && (VIEWS as readonly string[]).includes(v.view)) out.view = v.view as BoardView;
    if (typeof v.groupBy === "string" && (TABLE_GROUP_BY as readonly string[]).includes(v.groupBy)) out.groupBy = v.groupBy as TableGroupBy;
    const s = v.sort as Record<string, unknown> | null | undefined;
    if (s && typeof s.key === "string" && (TABLE_COLUMN_KEYS as readonly string[]).includes(s.key) && (s.dir === "asc" || s.dir === "desc")) {
      out.sort = { key: s.key as TableColumnKey, dir: s.dir };
    }
    return out;
  } catch {
    return {};
  }
}

export function readBoardPrefs(boardKey: string): BoardPrefs {
  try {
    return parseBoardPrefs(window.localStorage.getItem(boardPrefsKey(boardKey)));
  } catch {
    return {};
  }
}

export function writeBoardPrefs(boardKey: string, prefs: BoardPrefs): void {
  try {
    window.localStorage.setItem(boardPrefsKey(boardKey), JSON.stringify(prefs));
  } catch {
    // Blocked storage just means the default view next time.
  }
}

/** The lists in use on the board, by name, for suggestions. Case-insensitive: "QA" and "qa" are one. */
export function boardLists(cards: ReadonlyArray<Pick<WikiBoardCard, "list">>): string[] {
  const names = new Map<string, string>();
  for (const c of cards) {
    const name = c.list?.trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => COLLATOR.compare(a, b));
}
