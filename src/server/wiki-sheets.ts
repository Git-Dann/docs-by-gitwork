/**
 * Sheets — load and edit a client's wiki spreadsheets, and send rows to the task board.
 *
 * The rules (types, limits, coercion, paste, stage, client permissions) live in
 * `src/lib/wiki-sheets.ts`; this file only reads and writes.
 *
 * Two kinds of writer, and the difference is enforced HERE, not in the UI:
 *
 *   - **Team** (internal routes by client slug, and MCP): anything — structure, any cell,
 *     delete/restore any row, send to the board.
 *   - **Client** (public routes by share token, hardened posture — `sheets-access.ts`): only
 *     cells in client-editable columns of client-editable sheets; add rows if the sheet
 *     allows; soft-delete only rows they created; send to the board only if the sheet
 *     allows. Never structure. Every check below is tested.
 *
 * Cells are merged per cell in SQL (`cells || patch - removed`), never replaced as a whole
 * row, so the client and the team editing different cells of one row at the same moment
 * cannot clobber each other. Last write wins per cell.
 *
 * A row's board stage is derived from its task at read (§47.2) — nothing writes it back.
 */
import { Prisma, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SHEET_LIMITS,
  clientCanDeleteRow,
  clientCanEditColumn,
  coerceCellValue,
  convertValues,
  deriveSheetRowStage,
  parseRowCells,
  parseSheetColumns,
  rowTaskDescription,
  rowTaskTitle,
  sheetLimitError,
  shouldNotifyClientEdit,
  uniqueColumnTitle,
  newSheetColumnId,
  cleanOptions,
  isSheetPerson,
} from "@/lib/wiki-sheets";
import type {
  SheetActorKind,
  SheetCells,
  SheetCellValue,
  SheetColumn,
  SheetColumnType,
  SheetRowTask,
  WikiSheet,
  WikiSheetRow,
  WikiSheetsSection,
} from "@/types/wiki-sheets";
import { dispatchNotification } from "@/server/notifications";
import { sheetPeopleDirectory } from "@/server/wiki-intake-mentions";
import { clampColumnWidth, clampRowHeight, mergeRowOrder } from "@/lib/wiki-sheet-layout";
import { deriveRowTask, publicRowTask, taskAssignees } from "@/lib/wiki-sheet-board";

/* ───────────────────────────────────────────────────────── errors ── */

export class SheetError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const notFound = (what = "Sheet") => new SheetError(`${what} not found`, 404);
const forbidden = (message: string) => new SheetError(message, 403);

/* ──────────────────────────────────────────────────────── selects ── */

const SHEET_ORDER = [
  { orderKey: "asc" },
  { createdAt: "asc" },
] as const satisfies Prisma.WikiSheetOrderByWithRelationInput[];

const ROW_ORDER = [
  { orderKey: "asc" },
  { createdAt: "asc" },
] as const satisfies Prisma.WikiSheetRowOrderByWithRelationInput[];

const ROW_SELECT = {
  id: true,
  orderKey: true,
  cells: true,
  taskId: true,
  createdByKind: true,
  createdByName: true,
  createdByWikiUserId: true,
  updatedByKind: true,
  updatedByName: true,
  height: true,
  deletedAt: true,
  updatedAt: true,
} as const satisfies Prisma.WikiSheetRowSelect;

const SHEET_SELECT = {
  id: true,
  wikiId: true,
  title: true,
  description: true,
  orderKey: true,
  columns: true,
  titleColumnId: true,
  clientCanEdit: true,
  clientCanAddRows: true,
  clientCanSendToBoard: true,
  clientNotifiedAt: true,
  updatedAt: true,
} as const satisfies Prisma.WikiSheetSelect;

type SheetRecord = Prisma.WikiSheetGetPayload<{ select: typeof SHEET_SELECT }>;
type RowRecord = Prisma.WikiSheetRowGetPayload<{ select: typeof ROW_SELECT }>;

interface TaskInfo {
  status: TaskStatus;
  assignees: string[];
  task: SheetRowTask;
}

const TASK_PERSON = { name: true, email: true } as const satisfies Prisma.UserSelect;

/**
 * ONE query for every linked task on the page — status, title, dates and assignees (the
 * join plus the legacy single assignee, which `taskAssignees` falls back to as tasks.ts
 * does). No N+1, and nothing else from the task is selected, so nothing else can leak.
 */
const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
  assignees: { select: TASK_PERSON },
  assignee: { select: TASK_PERSON },
} as const satisfies Prisma.TaskSelect;

async function loadTaskInfo(taskIds: readonly (string | null)[]): Promise<Map<string, TaskInfo>> {
  const ids = [...new Set(taskIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: TASK_SELECT });
  return new Map(
    tasks.map((t) => [
      t.id,
      {
        status: t.status,
        assignees: taskAssignees({ assignees: t.assignees ?? [], assignee: t.assignee ?? null }),
        task: deriveRowTask({ ...t, assignees: t.assignees ?? [], assignee: t.assignee ?? null }),
      },
    ]),
  );
}

function kind(value: string | null): SheetActorKind | null {
  return value === "CLIENT" ? "CLIENT" : value === "TEAM" ? "TEAM" : null;
}

function serializeRow(row: RowRecord, columns: SheetColumn[], tasks: Map<string, TaskInfo>): WikiSheetRow {
  const task = row.taskId ? tasks.get(row.taskId) : undefined;
  return {
    id: row.id,
    orderKey: row.orderKey,
    cells: parseRowCells(row.cells, columns),
    taskId: row.taskId,
    stage: deriveSheetRowStage(row.taskId, task?.status ?? null),
    assignees: task?.assignees ?? [],
    task: task?.task ?? null,
    createdByKind: kind(row.createdByKind) ?? "TEAM",
    createdByName: row.createdByName,
    createdByWikiUserId: row.createdByWikiUserId,
    mine: false,
    updatedByKind: kind(row.updatedByKind),
    updatedByName: row.updatedByName,
    height: clampRowHeight(row.height),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeSheet(
  sheet: SheetRecord,
  rows: RowRecord[],
  tasks: Map<string, TaskInfo>,
): WikiSheet {
  const columns = parseSheetColumns(sheet.columns);
  return {
    id: sheet.id,
    title: sheet.title,
    description: sheet.description,
    orderKey: sheet.orderKey,
    columns,
    titleColumnId: sheet.titleColumnId,
    clientCanEdit: sheet.clientCanEdit,
    clientCanAddRows: sheet.clientCanAddRows,
    clientCanSendToBoard: sheet.clientCanSendToBoard,
    // Live rows first in their order, then the soft-deleted ones (team copy only).
    rows: [...rows]
      .sort((a, b) => Number(Boolean(a.deletedAt)) - Number(Boolean(b.deletedAt)))
      .map((r) => serializeRow(r, columns, tasks)),
    updatedAt: sheet.updatedAt.toISOString(),
  };
}

export const EMPTY_SHEETS: WikiSheetsSection = { enabled: false, sheets: [] };

/** The TEAM copy. The client's copy is cut down from this by `forPublicSheets`. */
export async function loadWikiSheets(clientId: string): Promise<WikiSheetsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      sheetsEnabled: true,
      sheets: {
        orderBy: SHEET_ORDER,
        select: { ...SHEET_SELECT, rows: { orderBy: ROW_ORDER, select: ROW_SELECT } },
      },
    },
  });
  if (!wiki) return EMPTY_SHEETS;
  const tasks = await loadTaskInfo(wiki.sheets.flatMap((s) => s.rows.map((r) => r.taskId)));
  return {
    enabled: wiki.sheetsEnabled,
    sheets: wiki.sheets.map(({ rows, ...sheet }) => serializeSheet(sheet, rows, tasks)),
  };
}

/**
 * The client's copy: nothing while the section is off; otherwise no soft-deleted rows and
 * no assignee names (the client sees the stage, as on Requests — who on our team is on it
 * is ours to say).
 */
export function forPublicSheets(section: WikiSheetsSection): WikiSheetsSection {
  if (!section.enabled) return EMPTY_SHEETS;
  return {
    enabled: true,
    sheets: section.sheets.map((s) => ({
      ...s,
      rows: s.rows
        .filter((r) => !r.deletedAt)
        .map((r) => ({
          ...r,
          assignees: [],
          // Stage, first name + last initial, due date, when it moved — nothing else (§73.1).
          task: publicRowTask(r.task),
          createdByWikiUserId: null,
          mine: false,
        })),
    })),
  };
}

/**
 * Mark the rows the viewer of the client's page added (`mine`), so the page can offer to
 * remove exactly those. Read from the database rather than the DTO, because the client's
 * DTO deliberately carries no client user ids. Same shape as `applyCommentViewer`.
 */
export async function applySheetViewer<T extends { sheets: WikiSheetsSection }>(
  dto: T,
  wikiUserId: string | null,
): Promise<T> {
  if (!wikiUserId) return dto;
  const ids = dto.sheets.sheets.flatMap((s) => s.rows.map((r) => r.id));
  if (ids.length === 0) return dto;
  const owners = await prisma.wikiSheetRow.findMany({
    where: { id: { in: ids } },
    select: { id: true, createdByKind: true, createdByWikiUserId: true },
  });
  const mine = new Set(owners.filter((o) => clientCanDeleteRow(o, wikiUserId)).map((o) => o.id));
  return {
    ...dto,
    sheets: {
      ...dto.sheets,
      sheets: dto.sheets.sheets.map((s) => ({
        ...s,
        rows: s.rows.map((r) => ({ ...r, mine: mine.has(r.id) })),
      })),
    },
  };
}

/** Publishable = has at least one column. An empty sheet would land a client on a blank grid. */
export function isPublishableSheet(sheet: Pick<WikiSheet, "columns">): boolean {
  return sheet.columns.length > 0;
}

export async function setWikiSheetsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, sheetsEnabled: enabled },
    update: { sheetsEnabled: enabled },
    select: { id: true },
  });
}

/* ──────────────────────────────────────────────────────── scoping ── */

/** A sheet is addressed through its wiki, so an id from another client's wiki can't be touched. */
export type SheetScope = { clientId: string } | { wikiId: string };

function scopeWhere(scope: SheetScope): Prisma.WikiSheetWhereInput {
  return "clientId" in scope ? { wiki: { clientId: scope.clientId } } : { wikiId: scope.wikiId };
}

async function getSheetRecord(scope: SheetScope, sheetId: string): Promise<SheetRecord> {
  const sheet = await prisma.wikiSheet.findFirst({
    where: { id: sheetId, ...scopeWhere(scope) },
    select: SHEET_SELECT,
  });
  if (!sheet) throw notFound();
  return sheet;
}

export async function getWikiSheet(scope: SheetScope, sheetId: string): Promise<WikiSheet> {
  const sheet = await getSheetRecord(scope, sheetId);
  const rows = await prisma.wikiSheetRow.findMany({
    where: { sheetId: sheet.id },
    orderBy: ROW_ORDER,
    select: ROW_SELECT,
  });
  return serializeSheet(sheet, rows, await loadTaskInfo(rows.map((r) => r.taskId)));
}

/* ──────────────────────────────────────────────────────── actors ── */

export type SheetActor =
  | { kind: "TEAM"; name: string; userId: string | null }
  | { kind: "CLIENT"; name: string; wikiUserId: string | null };

function createdBy(actor: SheetActor) {
  return {
    createdByKind: actor.kind,
    createdByName: actor.name,
    createdByUserId: actor.kind === "TEAM" ? actor.userId : null,
    createdByWikiUserId: actor.kind === "CLIENT" ? actor.wikiUserId : null,
    updatedByKind: actor.kind,
    updatedByName: actor.name,
  };
}

/* ───────────────────────────────────────────────── sheet structure ── */

export interface SheetColumnInput {
  id?: string;
  title: string;
  type?: SheetColumnType;
  options?: string[];
  width?: number;
  clientEditable?: boolean;
}

export interface SheetInput {
  title: string;
  description?: string | null;
  columns?: SheetColumnInput[];
  titleColumnId?: string | null;
  clientCanEdit?: boolean;
  clientCanAddRows?: boolean;
  clientCanSendToBoard?: boolean;
}

function buildColumns(input: SheetColumnInput[], existing: SheetColumn[] = []): SheetColumn[] {
  const all = [...existing];
  for (const c of input) {
    all.push({
      id: c.id?.trim() || newSheetColumnId(),
      title: uniqueColumnTitle(all, c.title),
      type: c.type ?? "text",
      options: c.type === "select" ? cleanOptions(c.options) : undefined,
      width: c.width,
      clientEditable: c.clientEditable ?? true,
    });
  }
  return parseSheetColumns(all);
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Turn `{ columnIdOrTitle: value }` into stored cells, refusing anything that doesn't fit. */
export function cellsFromInput(
  columns: readonly SheetColumn[],
  input: Record<string, unknown>,
  opts: { byTitle?: boolean; editable?: (c: SheetColumn) => boolean } = {},
): { set: SheetCells; clear: string[] } {
  const set: SheetCells = {};
  const clear: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const col =
      columns.find((c) => c.id === key) ??
      (opts.byTitle ? columns.find((c) => c.title.toLowerCase() === key.trim().toLowerCase()) : undefined);
    if (!col) throw new SheetError(`There is no column "${key}" in this sheet.`);
    if (opts.editable && !opts.editable(col)) {
      throw forbidden(`"${col.title}" can't be changed from the client's side.`);
    }
    const res = coerceCellValue(col, raw);
    if (!res.ok) throw new SheetError(res.error);
    if (res.value === null) clear.push(col.id);
    else set[col.id] = res.value;
  }
  return { set, clear };
}

/**
 * A person picked into a cell must be on THIS side's list for THIS client (§73.1): the team
 * picks from the team members who can see the client plus the client's people; a client
 * picks from the restricted list their own page sees. The id is checked against that list
 * and the stored name/kind are taken from it, never from the request — so a client can't
 * inject an arbitrary id, or a real id under a made-up name. Plain-text person values (from
 * before the picker, or an unmatched paste) are left as text. Mutates `cellsList` in place.
 */
export async function verifyPeople(
  key: { clientId: string } | { wikiId: string },
  side: "team" | "client",
  cellsList: SheetCells[],
): Promise<void> {
  const picked = cellsList.flatMap((cells) =>
    Object.entries(cells).filter(([, v]) => isSheetPerson(v)).map(([k]) => ({ cells, k })),
  );
  if (picked.length === 0) return;
  const byId = new Map((await sheetPeopleDirectory(key, side)).map((p) => [p.id, p]));
  for (const { cells, k } of picked) {
    const v = cells[k] as { id: string; name: string };
    const hit = byId.get(v.id);
    if (!hit) throw new SheetError(`"${v.name}" isn't someone who can be picked on this sheet.`);
    cells[k] = { id: hit.id, name: hit.name, kind: hit.kind };
  }
}

export async function createWikiSheet(
  clientId: string,
  input: SheetInput & { rows?: Record<string, unknown>[] },
  actor: SheetActor,
): Promise<WikiSheet> {
  const columns = buildColumns(input.columns ?? []);
  const limit = sheetLimitError({ columns: input.columns ?? [], rowCount: input.rows?.length ?? 0 });
  if (limit) throw new SheetError(limit);
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, _count: { select: { sheets: true } } },
  });
  if (wiki._count.sheets >= SHEET_LIMITS.maxSheets) {
    throw new SheetError(`A wiki can hold at most ${SHEET_LIMITS.maxSheets} sheets.`);
  }
  // Validate every row before writing anything — all or nothing.
  const rows = (input.rows ?? []).map((r) => cellsFromInput(columns, r, { byTitle: true }).set);
  await verifyPeople({ clientId }, "team", rows);
  const last = await prisma.wikiSheet.findFirst({
    where: { wikiId: wiki.id },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const titleColumnId =
    input.titleColumnId && columns.some((c) => c.id === input.titleColumnId) ? input.titleColumnId : null;
  const sheet = await prisma.wikiSheet.create({
    data: {
      wikiId: wiki.id,
      title: input.title.trim().slice(0, SHEET_LIMITS.maxTitle),
      description: input.description?.trim().slice(0, SHEET_LIMITS.maxDescription) || null,
      columns: json(columns),
      titleColumnId,
      clientCanEdit: input.clientCanEdit ?? true,
      clientCanAddRows: input.clientCanAddRows ?? true,
      clientCanSendToBoard: input.clientCanSendToBoard ?? false,
      orderKey: (last?.orderKey ?? -1) + 1,
    },
    select: { id: true },
  });
  if (rows.length) {
    await prisma.wikiSheetRow.createMany({
      data: rows.map((cells, i) => ({ sheetId: sheet.id, orderKey: i + 1, cells: json(cells), ...createdBy(actor) })),
    });
  }
  return getWikiSheet({ clientId }, sheet.id);
}

export async function updateWikiSheet(
  clientId: string,
  sheetId: string,
  patch: Partial<Omit<SheetInput, "columns">>,
): Promise<WikiSheet> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const columns = parseSheetColumns(sheet.columns);
  if (patch.titleColumnId && !columns.some((c) => c.id === patch.titleColumnId)) {
    throw new SheetError("The title column must be one of the sheet's columns.");
  }
  await prisma.wikiSheet.update({
    where: { id: sheet.id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, SHEET_LIMITS.maxTitle) } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim().slice(0, SHEET_LIMITS.maxDescription) || null }
        : {}),
      ...(patch.titleColumnId !== undefined ? { titleColumnId: patch.titleColumnId } : {}),
      ...(patch.clientCanEdit !== undefined ? { clientCanEdit: patch.clientCanEdit } : {}),
      ...(patch.clientCanAddRows !== undefined ? { clientCanAddRows: patch.clientCanAddRows } : {}),
      ...(patch.clientCanSendToBoard !== undefined ? { clientCanSendToBoard: patch.clientCanSendToBoard } : {}),
    },
  });
  return getWikiSheet({ clientId }, sheet.id);
}

export async function deleteWikiSheet(clientId: string, sheetId: string): Promise<void> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  await prisma.wikiSheet.delete({ where: { id: sheet.id } });
}

export async function reorderWikiSheets(clientId: string, order: string[]): Promise<void> {
  const owned = await prisma.wikiSheet.findMany({
    where: { id: { in: order }, wiki: { clientId } },
    select: { id: true },
  });
  const ids = new Set(owned.map((s) => s.id));
  await prisma.$transaction(
    order.filter((id) => ids.has(id)).map((id, i) => prisma.wikiSheet.update({ where: { id }, data: { orderKey: i } })),
  );
}

export async function addSheetColumns(
  clientId: string,
  sheetId: string,
  input: SheetColumnInput[],
): Promise<WikiSheet> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const existing = parseSheetColumns(sheet.columns);
  if (existing.length + input.length > SHEET_LIMITS.maxColumns) {
    throw new SheetError(`A sheet can have at most ${SHEET_LIMITS.maxColumns} columns.`);
  }
  const columns = buildColumns(input, existing);
  await prisma.wikiSheet.update({ where: { id: sheet.id }, data: { columns: json(columns) } });
  return getWikiSheet({ clientId }, sheet.id);
}

export interface SheetColumnPatch {
  title?: string;
  type?: SheetColumnType;
  options?: string[];
  width?: number | null;
  clientEditable?: boolean;
  /** Move to this index. */
  position?: number;
}

/**
 * Rename / retype / re-option / move one column. Changing the type (or narrowing a
 * dropdown's options) converts every row's value; values that can't convert are cleared,
 * and how many is returned so the caller can say so rather than lose them silently.
 */
export async function updateSheetColumn(
  clientId: string,
  sheetId: string,
  columnId: string,
  patch: SheetColumnPatch,
): Promise<{ sheet: WikiSheet; cleared: number }> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const columns = parseSheetColumns(sheet.columns);
  const index = columns.findIndex((c) => c.id === columnId);
  if (index < 0) throw notFound("Column");
  const before = columns[index];
  const after: SheetColumn = { ...before };
  if (patch.title !== undefined) {
    after.title = uniqueColumnTitle(
      columns.filter((c) => c.id !== columnId),
      patch.title,
    );
  }
  if (patch.type !== undefined) after.type = patch.type;
  if (after.type === "select") {
    after.options = patch.options !== undefined ? cleanOptions(patch.options) : (before.options ?? []);
  } else {
    delete after.options;
  }
  if (patch.width !== undefined) {
    if (patch.width === null) delete after.width;
    else after.width = clampColumnWidth(patch.width);
  }
  if (patch.clientEditable !== undefined) after.clientEditable = patch.clientEditable;

  const next = columns.filter((c) => c.id !== columnId);
  const at = patch.position === undefined ? index : Math.max(0, Math.min(next.length, patch.position));
  next.splice(at, 0, after);
  const parsed = parseSheetColumns(next);

  let cleared = 0;
  const retyped =
    before.type !== after.type ||
    (after.type === "select" && (before.options ?? []).some((o) => !(after.options ?? []).includes(o)));
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.wikiSheet.update({ where: { id: sheet.id }, data: { columns: json(parsed) } }),
  ];
  if (retyped) {
    const rows = await prisma.wikiSheetRow.findMany({
      where: { sheetId: sheet.id },
      select: { id: true, cells: true },
    });
    for (const row of rows) {
      const cells = (row.cells && typeof row.cells === "object" ? row.cells : {}) as Record<string, SheetCellValue>;
      if (!(columnId in cells)) continue;
      const { values, failed } = convertValues(before, after, [cells[columnId]]);
      cleared += failed;
      const nextCells = { ...cells };
      if (values[0] === null) delete nextCells[columnId];
      else nextCells[columnId] = values[0];
      writes.push(prisma.wikiSheetRow.update({ where: { id: row.id }, data: { cells: json(nextCells) } }));
    }
  }
  await prisma.$transaction(writes);
  return { sheet: await getWikiSheet({ clientId }, sheet.id), cleared };
}

/** Remove a column. Its values stay in the stored rows but are never read again. */
export async function removeSheetColumn(clientId: string, sheetId: string, columnId: string): Promise<WikiSheet> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const columns = parseSheetColumns(sheet.columns);
  if (!columns.some((c) => c.id === columnId)) throw notFound("Column");
  await prisma.wikiSheet.update({
    where: { id: sheet.id },
    data: {
      columns: json(columns.filter((c) => c.id !== columnId)),
      ...(sheet.titleColumnId === columnId ? { titleColumnId: null } : {}),
    },
  });
  return getWikiSheet({ clientId }, sheet.id);
}

/* ─────────────────────────────────────────────────────────── rows ── */

export interface ClientWriter {
  wikiId: string;
  name: string;
  wikiUserId: string | null;
}

async function liveRowCount(sheetId: string): Promise<number> {
  return prisma.wikiSheetRow.count({ where: { sheetId, deletedAt: null } });
}

async function insertRows(sheet: SheetRecord, rows: SheetCells[], actor: SheetActor): Promise<string[]> {
  if (rows.length > SHEET_LIMITS.maxBatch) {
    throw new SheetError(`At most ${SHEET_LIMITS.maxBatch} rows can be added at once.`);
  }
  const count = await liveRowCount(sheet.id);
  if (count + rows.length > SHEET_LIMITS.maxRows) {
    throw new SheetError(`A sheet can have at most ${SHEET_LIMITS.maxRows} rows.`);
  }
  const last = await prisma.wikiSheetRow.findFirst({
    where: { sheetId: sheet.id },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const base = last?.orderKey ?? 0;
  const created = await prisma.$transaction(
    rows.map((cells, i) =>
      prisma.wikiSheetRow.create({
        data: { sheetId: sheet.id, orderKey: base + i + 1, cells: json(cells), ...createdBy(actor) },
        select: { id: true },
      }),
    ),
  );
  return created.map((r) => r.id);
}

/** Team: add rows. Cells keyed by column id or (with `byTitle`) by title. All or nothing. */
export async function addSheetRows(
  clientId: string,
  sheetId: string,
  rows: Record<string, unknown>[],
  actor: SheetActor,
  opts: { byTitle?: boolean } = {},
): Promise<{ sheet: WikiSheet; rowIds: string[] }> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const columns = parseSheetColumns(sheet.columns);
  const cells = rows.map((r) => cellsFromInput(columns, r, { byTitle: opts.byTitle }).set);
  await verifyPeople({ clientId }, "team", cells);
  const rowIds = await insertRows(sheet, cells, actor);
  return { sheet: await getWikiSheet({ clientId }, sheet.id), rowIds };
}

/**
 * Merge a cell patch into one row, in SQL, so concurrent edits to DIFFERENT cells both land.
 * `set` adds/overwrites keys; `clear` removes them.
 */
async function mergeCells(rowId: string, set: SheetCells, clear: string[], actor: SheetActor): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "WikiSheetRow"
    SET "cells" = (COALESCE("cells", '{}'::jsonb) || ${JSON.stringify(set)}::jsonb) - ${clear}::text[],
        "updatedByKind" = ${actor.kind},
        "updatedByName" = ${actor.name},
        "updatedAt" = NOW()
    WHERE "id" = ${rowId}`;
}

async function getRow(sheetId: string, rowId: string) {
  const row = await prisma.wikiSheetRow.findFirst({
    where: { id: rowId, sheetId },
    select: { id: true, taskId: true, cells: true, deletedAt: true, createdByKind: true, createdByWikiUserId: true },
  });
  if (!row) throw notFound("Row");
  return row;
}

/** Team: change some cells of one row. */
export async function updateSheetRowCells(
  clientId: string,
  sheetId: string,
  rowId: string,
  patch: Record<string, unknown>,
  actor: SheetActor,
  opts: { byTitle?: boolean } = {},
): Promise<void> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  await getRow(sheet.id, rowId);
  const { set, clear } = cellsFromInput(parseSheetColumns(sheet.columns), patch, opts);
  await verifyPeople({ clientId }, "team", [set]);
  await mergeCells(rowId, set, clear, actor);
}

/**
 * Team: set one row's height (null = back to auto). Layout, not content — it doesn't
 * count as an edit, so it leaves who-last-edited alone. There is no client equivalent:
 * a client's resizes live in their own browser (§73.1).
 */
export async function setSheetRowHeight(
  clientId: string,
  sheetId: string,
  rowId: string,
  height: number | null,
): Promise<number | null> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  await getRow(sheet.id, rowId);
  const value = clampRowHeight(height);
  await prisma.wikiSheetRow.updateMany({ where: { id: rowId, sheetId: sheet.id }, data: { height: value } });
  return value;
}

/** Team: soft-delete or restore rows. */
export async function setSheetRowsDeleted(
  clientId: string,
  sheetId: string,
  rowIds: string[],
  deleted: boolean,
): Promise<number> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  if (!deleted) {
    const restoring = await prisma.wikiSheetRow.count({
      where: { sheetId: sheet.id, id: { in: rowIds }, deletedAt: { not: null } },
    });
    if ((await liveRowCount(sheet.id)) + restoring > SHEET_LIMITS.maxRows) {
      throw new SheetError(`A sheet can have at most ${SHEET_LIMITS.maxRows} rows.`);
    }
  }
  const res = await prisma.wikiSheetRow.updateMany({
    where: { sheetId: sheet.id, id: { in: rowIds } },
    data: { deletedAt: deleted ? new Date() : null },
  });
  return res.count;
}

/**
 * Team only: reorder rows. `order` may be partial (the live rows, or just those shown); the
 * rows it doesn't mention keep their relative order after it, so nothing is stranded with
 * a colliding key. Ids from another sheet are ignored. Only rows whose position actually
 * changed are written. There is deliberately no client route for this (§73.1).
 */
export async function reorderSheetRows(clientId: string, sheetId: string, order: string[]): Promise<string[]> {
  const sheet = await getSheetRecord({ clientId }, sheetId);
  const current = await prisma.wikiSheetRow.findMany({
    where: { sheetId: sheet.id },
    orderBy: ROW_ORDER,
    select: { id: true, orderKey: true },
  });
  const next = mergeRowOrder(
    current.map((r) => r.id),
    order,
  );
  const keyOf = new Map(current.map((r) => [r.id, r.orderKey]));
  const writes = next
    .map((id, i) => ({ id, key: i + 1 }))
    .filter(({ id, key }) => keyOf.get(id) !== key)
    .map(({ id, key }) => prisma.wikiSheetRow.updateMany({ where: { id, sheetId: sheet.id }, data: { orderKey: key } }));
  if (writes.length) await prisma.$transaction(writes);
  return next;
}

/* ─────────────────────────────────────────────────── client writes ── */

async function clientSheet(writer: ClientWriter, sheetId: string): Promise<SheetRecord> {
  return getSheetRecord({ wikiId: writer.wikiId }, sheetId);
}

function clientActor(writer: ClientWriter): SheetActor {
  return { kind: "CLIENT", name: writer.name, wikiUserId: writer.wikiUserId };
}

/** Client: change cells. Only client-editable columns of a client-editable sheet. */
export async function clientUpdateCells(
  writer: ClientWriter,
  sheetId: string,
  rowId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const sheet = await clientSheet(writer, sheetId);
  if (!sheet.clientCanEdit) throw forbidden("This sheet is read-only for you.");
  const row = await getRow(sheet.id, rowId);
  if (row.deletedAt) throw notFound("Row");
  const { set, clear } = cellsFromInput(parseSheetColumns(sheet.columns), patch, {
    editable: (c) => clientCanEditColumn(sheet, c),
  });
  await verifyPeople({ wikiId: writer.wikiId }, "client", [set]);
  await mergeCells(rowId, set, clear, clientActor(writer));
  await notifyClientEdit(sheet, writer, "edited");
}

/** Client: add rows, if the sheet allows it. Cells only in client-editable columns. */
export async function clientAddRows(
  writer: ClientWriter,
  sheetId: string,
  rows: Record<string, unknown>[],
): Promise<string[]> {
  const sheet = await clientSheet(writer, sheetId);
  if (!sheet.clientCanAddRows) throw forbidden("Rows can't be added to this sheet from your side.");
  const columns = parseSheetColumns(sheet.columns);
  const cells = rows.map(
    (r) => cellsFromInput(columns, r, { editable: (c) => c.clientEditable }).set,
  );
  await verifyPeople({ wikiId: writer.wikiId }, "client", cells);
  const ids = await insertRows(sheet, cells, clientActor(writer));
  await notifyClientEdit(sheet, writer, "added rows to");
  return ids;
}

/** Client: soft-delete rows — only ones they created themselves. */
export async function clientDeleteRows(writer: ClientWriter, sheetId: string, rowIds: string[]): Promise<number> {
  const sheet = await clientSheet(writer, sheetId);
  const rows = await prisma.wikiSheetRow.findMany({
    where: { sheetId: sheet.id, id: { in: rowIds }, deletedAt: null },
    select: { id: true, createdByKind: true, createdByWikiUserId: true },
  });
  const notMine = rows.filter((r) => !clientCanDeleteRow(r, writer.wikiUserId));
  if (notMine.length > 0) throw forbidden("You can only remove rows you added.");
  const res = await prisma.wikiSheetRow.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { deletedAt: new Date() },
  });
  if (res.count > 0) await notifyClientEdit(sheet, writer, "removed rows from");
  return res.count;
}

/* ────────────────────────────────────────────────── send to board ── */

export interface SendResult {
  rowId: string;
  taskId: string;
  /** False when the row already had a live task — sending is idempotent. */
  created: boolean;
}

async function nextBacklogOrderKey(workspaceId: string, clientId: string): Promise<number> {
  const top = await prisma.task.findFirst({
    where: { workspaceId, clientId, status: "BACKLOG" },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  return (top?.orderKey ?? 0) + 1;
}

/**
 * Create a task on the client's board for each row. Idempotent: a row whose task still
 * exists returns that task rather than making a second one. A row whose task was deleted
 * can be sent again.
 */
export async function sendSheetRowsToBoard(
  scope: SheetScope,
  sheetId: string,
  rowIds: string[],
  actor: SheetActor,
  opts: { featureBlockId?: string | null; sheetUrl?: string | null } = {},
): Promise<SendResult[]> {
  const sheet = await getSheetRecord(scope, sheetId);
  if (actor.kind === "CLIENT" && !sheet.clientCanSendToBoard) {
    throw forbidden("Sending rows to the board isn't switched on for this sheet.");
  }
  if (rowIds.length > SHEET_LIMITS.maxBatch) {
    throw new SheetError(`At most ${SHEET_LIMITS.maxBatch} rows can be sent at once.`);
  }
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: sheet.wikiId },
    select: { client: { select: { id: true, workspaceId: true, slug: true, name: true } } },
  });
  if (!wiki) throw notFound();
  const client = wiki.client;

  let featureBlockId: string | null = null;
  if (opts.featureBlockId && actor.kind === "TEAM") {
    const block = await prisma.featureBlock.findFirst({
      where: { id: opts.featureBlockId, clientId: client.id },
      select: { id: true },
    });
    if (!block) throw new SheetError("That category isn't on this client's board.");
    featureBlockId = block.id;
  }

  const rows = await prisma.wikiSheetRow.findMany({
    where: { sheetId: sheet.id, id: { in: rowIds }, deletedAt: null },
    select: { id: true, taskId: true, cells: true },
  });
  if (rows.length !== new Set(rowIds).size) throw notFound("Row");

  const columns = parseSheetColumns(sheet.columns);
  const meta = { title: sheet.title, columns, titleColumnId: sheet.titleColumnId };
  const linked = await prisma.task.findMany({
    where: { id: { in: rows.map((r) => r.taskId).filter((id): id is string => Boolean(id)) } },
    select: { id: true },
  });
  const live = new Set(linked.map((t) => t.id));

  const results: SendResult[] = [];
  let orderKey = await nextBacklogOrderKey(client.workspaceId, client.id);
  for (const row of rows) {
    if (row.taskId && live.has(row.taskId)) {
      results.push({ rowId: row.id, taskId: row.taskId, created: false });
      continue;
    }
    const cells = parseRowCells(row.cells, columns);
    const title = rowTaskTitle(meta, cells);
    if (!title) {
      throw new SheetError("A row needs something in its title column before it can go on the board.");
    }
    const task = await prisma.task.create({
      data: {
        workspaceId: client.workspaceId,
        clientId: client.id,
        createdById: actor.kind === "TEAM" ? actor.userId : null,
        title,
        description: rowTaskDescription(meta, cells, opts.sheetUrl ?? null),
        status: "BACKLOG",
        featureBlockId,
        orderKey: orderKey++,
        metadata: {
          wikiSheet: {
            sheetId: sheet.id,
            rowId: row.id,
            sentBy: actor.name,
            sentByKind: actor.kind,
            sentAt: new Date().toISOString(),
          },
        },
      },
      select: { id: true },
    });
    // Guarded on the taskId we read, so two concurrent sends can't both stamp a task.
    const stamped = await prisma.wikiSheetRow.updateMany({
      where: { id: row.id, taskId: row.taskId },
      data: { taskId: task.id },
    });
    if (stamped.count === 0) {
      await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
      const fresh = await prisma.wikiSheetRow.findUnique({ where: { id: row.id }, select: { taskId: true } });
      results.push({ rowId: row.id, taskId: fresh?.taskId ?? task.id, created: false });
      continue;
    }
    results.push({ rowId: row.id, taskId: task.id, created: true });
  }

  const made = results.filter((r) => r.created).length;
  if (made > 0 && actor.kind === "CLIENT") {
    const title = (n: number) => `${client.name} sent ${n} row${n === 1 ? "" : "s"} from "${sheet.title}" to the board`;
    dispatchNotification({
      event: "tasks.client_request",
      workspaceId: client.workspaceId,
      target: { kind: "clientTeam" },
      clientId: client.id,
      title: title(made),
      titleForCount: title,
      actionUrl: `/app/portal/${client.slug}/tasks`,
      groupKey: `tasks.client_request:${client.id}`,
      count: made,
    });
  }
  return results;
}

/* ─────────────────────────────────────────────────── notifications ── */

/**
 * Tell the client's team that the client changed a sheet — at most once per sheet per
 * 15 minutes, so a client typing through twenty cells is one notification, not twenty.
 * The window is claimed with a conditional update so two simultaneous edits can't both send.
 */
async function notifyClientEdit(sheet: SheetRecord, writer: ClientWriter, verb: string): Promise<void> {
  try {
    const now = new Date();
    if (!shouldNotifyClientEdit(sheet.clientNotifiedAt, now)) return;
    const claimed = await prisma.wikiSheet.updateMany({
      where: { id: sheet.id, clientNotifiedAt: sheet.clientNotifiedAt },
      data: { clientNotifiedAt: now },
    });
    if (claimed.count === 0) return;
    const wiki = await prisma.clientWiki.findUnique({
      where: { id: sheet.wikiId },
      select: { client: { select: { id: true, workspaceId: true, slug: true, name: true } } },
    });
    if (!wiki) return;
    dispatchNotification({
      event: "wiki.sheet_client_edit",
      workspaceId: wiki.client.workspaceId,
      target: { kind: "clientTeam" },
      clientId: wiki.client.id,
      title: `${writer.name} ${verb} "${sheet.title}" (${wiki.client.name})`,
      actionUrl: `/app/portal/${wiki.client.slug}/wiki#sheets`,
      groupKey: `wiki.sheet_client_edit:${sheet.id}`,
      metadata: { wikiId: sheet.wikiId, sheetId: sheet.id },
    });
  } catch (err) {
    console.error("[wiki-sheets] client-edit notification failed", err);
  }
}
