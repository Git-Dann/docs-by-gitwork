/**
 * MCP tools for wiki Sheets (CLAUDE.md §73) — read and write a client's spreadsheets, and
 * send rows to the task board.
 *
 * Every write goes through the same server functions the grid uses, which go through the
 * same pure rules (`src/lib/wiki-sheets.ts`), so a value Claude writes is coerced and refused
 * exactly as one typed into the grid. Cells are addressed by COLUMN TITLE (case-insensitive);
 * rows by id or by the exact text of their title cell. Ambiguity is an error, never a guess.
 *
 * Writers need 'Manage clients', and `resolveClient` limits every call to the clients the
 * caller can see. Built as a factory so the handler can hand in its own `resolveClient` and
 * `textResult` rather than this file re-implementing them.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageClients, type EffectiveUser } from "@/server/auth/effective-user";
import {
  COLUMN_TYPES,
  COLUMN_TYPE_FORMAT,
  SHEET_LIMITS,
  cellText,
  findColumn,
  titleColumn,
} from "@/lib/wiki-sheets";
import { STAGE_LABEL } from "@/lib/wiki-request-stage";
import {
  SheetError,
  addSheetColumns,
  addSheetRows,
  cellsFromInput,
  createWikiSheet,
  deleteWikiSheet,

  loadWikiSheets,
  removeSheetColumn,
  sendSheetRowsToBoard,
  setSheetRowsDeleted,
  setWikiSheetsEnabled,
  updateSheetColumn,
  updateSheetRowCells,
  updateWikiSheet,
  type SheetActor,
} from "@/server/wiki-sheets";
import type { SheetColumnType, WikiSheet, WikiSheetRow } from "@/types/wiki-sheets";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export interface SheetToolDeps {
  resolveClient: (user: EffectiveUser, input: string) => Promise<{ id: string; slug: string; name: string }>;
  textResult: (payload: unknown, summary?: string) => Result;
}

export interface SheetToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (user: EffectiveUser, args: unknown) => Promise<Result>;
}

const TYPE_RULES =
  "Column types and how to write a value: " +
  COLUMN_TYPES.map((t) => `${t} = ${COLUMN_TYPE_FORMAT[t]}`).join("; ") +
  ". null or '' clears a cell.";

const LIMIT_RULES = `A sheet has at most ${SHEET_LIMITS.maxColumns} columns and ${SHEET_LIMITS.maxRows} rows; at most ${SHEET_LIMITS.maxBatch} rows per call; a wiki holds at most ${SHEET_LIMITS.maxSheets} sheets.`;

const CLIENT = { type: "string", description: "Client slug, name, or cuid (see list_clients)." };
const SHEET = { type: "string", description: "Sheet id or exact title (see list_sheets)." };

const COLUMN_JSON = {
  anyOf: [
    { type: "string", description: "A text column with this title." },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        type: { type: "string", enum: [...COLUMN_TYPES] },
        options: { type: "array", items: { type: "string" }, description: "Choices, for a select column." },
        clientEditable: { type: "boolean", description: "Whether the client may edit it (default true)." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  ],
};

const CELLS_JSON = {
  type: "object",
  description: 'Values keyed by COLUMN TITLE, e.g. {"Item": "Pricing page", "Priority": "High"}.',
  additionalProperties: { type: ["string", "number", "boolean", "null"] },
};

const ROW_REFS_JSON = {
  type: "array",
  items: { type: "string" },
  description: "Row ids, or the exact text of each row's title cell.",
};

const columnArg = z.union([
  z.string().trim().min(1).max(SHEET_LIMITS.maxColumnTitle),
  z.object({
    title: z.string().trim().min(1).max(SHEET_LIMITS.maxColumnTitle),
    type: z.enum(COLUMN_TYPES as readonly [SheetColumnType, ...SheetColumnType[]]).optional(),
    options: z.array(z.string().max(SHEET_LIMITS.maxOption)).max(SHEET_LIMITS.maxOptions).optional(),
    clientEditable: z.boolean().optional(),
  }),
]);
const cellsArg = z.record(z.string(), z.union([z.string().max(SHEET_LIMITS.maxLongText), z.number(), z.boolean(), z.null()]));
const ref = z.object({ client: z.string().min(1), sheet: z.string().min(1) });
const permissionArgs = {
  clientCanEdit: z.boolean().optional(),
  clientCanAddRows: z.boolean().optional(),
  clientCanSendToBoard: z.boolean().optional(),
};

const createSchema = z.object({
  client: z.string().min(1),
  title: z.string().trim().min(1).max(SHEET_LIMITS.maxTitle),
  description: z.string().max(SHEET_LIMITS.maxDescription).optional(),
  columns: z.array(columnArg).min(1).max(SHEET_LIMITS.maxColumns),
  titleColumn: z.string().optional(),
  rows: z.array(cellsArg).max(SHEET_LIMITS.maxBatch).optional(),
  ...permissionArgs,
});
const updateSchema = ref.extend({
  title: z.string().trim().min(1).max(SHEET_LIMITS.maxTitle).optional(),
  description: z.string().max(SHEET_LIMITS.maxDescription).nullable().optional(),
  titleColumn: z.string().nullable().optional(),
  ...permissionArgs,
});
const addColumnsSchema = ref.extend({ columns: z.array(columnArg).min(1).max(SHEET_LIMITS.maxColumns) });
const updateColumnSchema = ref.extend({
  column: z.string().min(1),
  title: z.string().trim().min(1).max(SHEET_LIMITS.maxColumnTitle).optional(),
  type: z.enum(COLUMN_TYPES as readonly [SheetColumnType, ...SheetColumnType[]]).optional(),
  options: z.array(z.string().max(SHEET_LIMITS.maxOption)).max(SHEET_LIMITS.maxOptions).optional(),
  clientEditable: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});
const removeColumnSchema = ref.extend({ column: z.string().min(1) });
const addRowsSchema = ref.extend({ rows: z.array(cellsArg).min(1).max(SHEET_LIMITS.maxBatch) });
const updateRowsSchema = ref.extend({
  updates: z
    .array(z.object({ row: z.string().min(1), cells: cellsArg }))
    .min(1)
    .max(SHEET_LIMITS.maxBatch),
});
const rowRefsSchema = ref.extend({
  rows: z.array(z.string().min(1)).min(1).max(SHEET_LIMITS.maxBatch),
});
const deleteRowsSchema = rowRefsSchema.extend({ restore: z.boolean().optional() });
const sendSchema = rowRefsSchema.extend({ category: z.string().optional() });
const getSchema = ref.extend({ includeDeleted: z.boolean().optional() });

function columnInput(c: z.infer<typeof columnArg>) {
  return typeof c === "string" ? { title: c } : c;
}

function actorOf(user: EffectiveUser): SheetActor {
  return { kind: "TEAM", name: user.name?.trim() || user.email || "Claude", userId: user.id };
}

async function resolveSheet(clientId: string, refText: string): Promise<WikiSheet> {
  const { sheets } = await loadWikiSheets(clientId);
  const byId = sheets.find((s) => s.id === refText);
  if (byId) return byId;
  const hits = sheets.filter((s) => s.title.trim().toLowerCase() === refText.trim().toLowerCase());
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new SheetError(`"${refText}" matches ${hits.length} sheets — pass the sheet id.`);
  throw new SheetError(`No sheet "${refText}". Sheets: ${sheets.map((s) => s.title).join(", ") || "(none)"}.`);
}

/** A row by id, else by the exact text of its title cell (live rows only). */
export function resolveRow(sheet: WikiSheet, refText: string, opts: { includeDeleted?: boolean } = {}): WikiSheetRow {
  const pool = opts.includeDeleted ? sheet.rows : sheet.rows.filter((r) => !r.deletedAt);
  const byId = pool.find((r) => r.id === refText);
  if (byId) return byId;
  const col = titleColumn(sheet.columns, sheet.titleColumnId);
  if (!col) throw new SheetError(`No row "${refText}" (this sheet has no title column — use row ids).`);
  const key = refText.trim().toLowerCase();
  const hits = pool.filter((r) => cellText(col, r.cells[col.id]).trim().toLowerCase() === key);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new SheetError(`"${refText}" matches ${hits.length} rows — pass row ids.`);
  throw new SheetError(`No row whose "${col.title}" is "${refText}".`);
}

/** What an agent reads: cells keyed by column title, plus the derived board stage. */
export function projectSheet(sheet: WikiSheet, opts: { includeDeleted?: boolean } = {}) {
  const title = titleColumn(sheet.columns, sheet.titleColumnId);
  return {
    id: sheet.id,
    title: sheet.title,
    description: sheet.description,
    titleColumn: title?.title ?? null,
    permissions: {
      clientCanEdit: sheet.clientCanEdit,
      clientCanAddRows: sheet.clientCanAddRows,
      clientCanSendToBoard: sheet.clientCanSendToBoard,
    },
    columns: sheet.columns.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      ...(c.options ? { options: c.options } : {}),
      clientEditable: c.clientEditable,
    })),
    rows: sheet.rows
      .filter((r) => opts.includeDeleted || !r.deletedAt)
      .map((r) => ({
        id: r.id,
        cells: Object.fromEntries(
          sheet.columns.filter((c) => r.cells[c.id] !== undefined).map((c) => [c.title, r.cells[c.id]]),
        ),
        board: r.stage ? STAGE_LABEL[r.stage] : "Not on board",
        taskId: r.taskId,
        ...(r.assignees.length ? { assignees: r.assignees } : {}),
        createdBy: r.createdByKind === "CLIENT" ? `client${r.createdByName ? ` (${r.createdByName})` : ""}` : "team",
        ...(r.deletedAt ? { deleted: true } : {}),
      })),
  };
}

function columnIdFor(sheet: { columns: WikiSheet["columns"] }, refText: string): string {
  const col = findColumn(sheet.columns, refText);
  if (!col) throw new SheetError(`No column "${refText}". Columns: ${sheet.columns.map((c) => c.title).join(", ")}.`);
  return col.id;
}

export function buildSheetTools({ resolveClient, textResult }: SheetToolDeps): SheetToolDef[] {
  return [
    {
      name: "list_sheets",
      description:
        "List a client's wiki Sheets (client-editable spreadsheets whose rows can be sent to the dev " +
        "task board). Returns each sheet's id, title, columns, row counts, how many rows are on the " +
        "board / done, what the client may do, and whether the section is on.",
      inputSchema: { type: "object", properties: { client: CLIENT }, required: ["client"], additionalProperties: false },
      handler: async (user, args) => {
        const { client } = z.object({ client: z.string().min(1) }).parse(args);
        const resolved = await resolveClient(user, client);
        const section = await loadWikiSheets(resolved.id);
        const sheets = section.sheets.map((s) => {
          const live = s.rows.filter((r) => !r.deletedAt);
          return {
            id: s.id,
            title: s.title,
            columns: s.columns.map((c) => `${c.title} (${c.type})`),
            rows: live.length,
            onBoard: live.filter((r) => r.stage).length,
            done: live.filter((r) => r.stage === "DONE").length,
            removed: s.rows.length - live.length,
            clientCanEdit: s.clientCanEdit,
            clientCanAddRows: s.clientCanAddRows,
            clientCanSendToBoard: s.clientCanSendToBoard,
          };
        });
        return textResult(
          { client: resolved, enabled: section.enabled, sheets },
          `${resolved.name} — ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}; section is ${section.enabled ? "on" : "off"}.`,
        );
      },
    },
    {
      name: "get_sheet",
      description:
        "Get one sheet in full: columns (id, title, type, options, clientEditable) and every row with " +
        "its cells keyed by COLUMN TITLE, its board stage (derived live from the task: Not on board, " +
        "Reviewing, Scheduled, In progress, In review, Done) and taskId. Removed rows are left out " +
        "unless includeDeleted is true.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, includeDeleted: { type: "boolean" } },
        required: ["client", "sheet"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        const parsed = getSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        return textResult(
          projectSheet(sheet, { includeDeleted: parsed.includeDeleted }),
          `"${sheet.title}" — ${sheet.columns.length} columns, ${sheet.rows.filter((r) => !r.deletedAt).length} rows.`,
        );
      },
    },
    {
      name: "create_sheet",
      description:
        "Create a sheet on a client's wiki, optionally with rows. " +
        TYPE_RULES +
        " " +
        LIMIT_RULES +
        " titleColumn names the column a task title comes from when a row is sent to the board " +
        "(default: the first text column). By default the client may edit cells and add rows but " +
        "NOT send rows to the board. Turns the Sheets section on. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          title: { type: "string" },
          description: { type: "string", description: "Shown to the client under the title." },
          columns: { type: "array", items: COLUMN_JSON },
          titleColumn: { type: "string", description: "Column title for task titles." },
          rows: { type: "array", items: CELLS_JSON },
          clientCanEdit: { type: "boolean" },
          clientCanAddRows: { type: "boolean" },
          clientCanSendToBoard: { type: "boolean" },
        },
        required: ["client", "title", "columns"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = createSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const columns = parsed.columns.map(columnInput);
        const titleIndex = parsed.titleColumn
          ? columns.findIndex((c) => c.title.toLowerCase() === parsed.titleColumn!.trim().toLowerCase())
          : -1;
        if (parsed.titleColumn && titleIndex < 0) throw new SheetError(`titleColumn "${parsed.titleColumn}" isn't one of the columns.`);
        const ids = columns.map((_, i) => `col-${i + 1}`);
        const section = await loadWikiSheets(resolved.id);
        const sheet = await createWikiSheet(
          resolved.id,
          {
            title: parsed.title,
            description: parsed.description ?? null,
            columns: columns.map((c, i) => ({ ...c, id: ids[i] })),
            titleColumnId: titleIndex >= 0 ? ids[titleIndex] : null,
            clientCanEdit: parsed.clientCanEdit,
            clientCanAddRows: parsed.clientCanAddRows,
            clientCanSendToBoard: parsed.clientCanSendToBoard,
            rows: parsed.rows,
          },
          actorOf(user),
        );
        if (!section.enabled) await setWikiSheetsEnabled(resolved.id, true);
        return textResult(
          projectSheet(sheet),
          `Created "${sheet.title}" on ${resolved.name} with ${sheet.columns.length} columns and ${sheet.rows.length} rows` +
            `${section.enabled ? "" : " (Sheets section switched on)"}.`,
        );
      },
    },
    {
      name: "update_sheet",
      description:
        "Rename a sheet, change its description or title column, or change what the client may do " +
        "(clientCanEdit, clientCanAddRows, clientCanSendToBoard). Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          sheet: SHEET,
          title: { type: "string" },
          description: { type: ["string", "null"] },
          titleColumn: { type: ["string", "null"], description: "Column title or id; null = first text column." },
          clientCanEdit: { type: "boolean" },
          clientCanAddRows: { type: "boolean" },
          clientCanSendToBoard: { type: "boolean" },
        },
        required: ["client", "sheet"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = updateSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const updated = await updateWikiSheet(resolved.id, sheet.id, {
          title: parsed.title,
          description: parsed.description,
          titleColumnId:
            parsed.titleColumn === undefined ? undefined : parsed.titleColumn === null ? null : columnIdFor(sheet, parsed.titleColumn),
          clientCanEdit: parsed.clientCanEdit,
          clientCanAddRows: parsed.clientCanAddRows,
          clientCanSendToBoard: parsed.clientCanSendToBoard,
        });
        return textResult(projectSheet(updated), `Updated "${updated.title}".`);
      },
    },
    {
      name: "add_sheet_columns",
      description: "Append columns to a sheet (existing rows untouched). " + TYPE_RULES + " Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, columns: { type: "array", items: COLUMN_JSON } },
        required: ["client", "sheet", "columns"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = addColumnsSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const updated = await addSheetColumns(resolved.id, sheet.id, parsed.columns.map(columnInput));
        return textResult(projectSheet(updated), `"${updated.title}" now has ${updated.columns.length} columns.`);
      },
    },
    {
      name: "update_sheet_column",
      description:
        "Rename, retype, re-option, lock/unlock for the client, or move one column (position = 0-based " +
        "index). Changing the type converts existing values; ones that can't convert are cleared and " +
        "the count is returned. Column by title or id. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          sheet: SHEET,
          column: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: [...COLUMN_TYPES] },
          options: { type: "array", items: { type: "string" } },
          clientEditable: { type: "boolean" },
          position: { type: "integer", minimum: 0 },
        },
        required: ["client", "sheet", "column"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = updateColumnSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const { sheet: updated, cleared } = await updateSheetColumn(resolved.id, sheet.id, columnIdFor(sheet, parsed.column), {
          title: parsed.title,
          type: parsed.type,
          options: parsed.options,
          clientEditable: parsed.clientEditable,
          position: parsed.position,
        });
        return textResult(
          { ...projectSheet(updated), cleared },
          `Updated column "${parsed.column}"${cleared ? ` — ${cleared} value(s) didn't fit and were cleared` : ""}.`,
        );
      },
    },
    {
      name: "remove_sheet_column",
      description: "Remove one column from a sheet (by title or id). Its values stop showing. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, column: { type: "string" } },
        required: ["client", "sheet", "column"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = removeColumnSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const updated = await removeSheetColumn(resolved.id, sheet.id, columnIdFor(sheet, parsed.column));
        return textResult(projectSheet(updated), `Removed "${parsed.column}" from "${updated.title}".`);
      },
    },
    {
      name: "add_sheet_rows",
      description:
        "Append rows to a sheet. Each row is an object keyed by COLUMN TITLE. " +
        TYPE_RULES +
        " All or nothing: one bad value and no row is added. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, rows: { type: "array", items: CELLS_JSON } },
        required: ["client", "sheet", "rows"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = addRowsSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const { rowIds } = await addSheetRows(resolved.id, sheet.id, parsed.rows, actorOf(user), { byTitle: true });
        return textResult({ rowIds }, `Added ${rowIds.length} row${rowIds.length === 1 ? "" : "s"} to "${sheet.title}".`);
      },
    },
    {
      name: "update_sheet_rows",
      description:
        "Change cells in existing rows: updates = [{ row: <row id or exact title-cell text>, cells: " +
        "{ <column title>: value } }]. Only the cells named change (merged per cell). " +
        TYPE_RULES +
        " All or nothing: every row and value is checked before anything is written. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          sheet: SHEET,
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: { row: { type: "string" }, cells: CELLS_JSON },
              required: ["row", "cells"],
              additionalProperties: false,
            },
          },
        },
        required: ["client", "sheet", "updates"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = updateRowsSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        // Validate everything first — all or nothing.
        const planned = parsed.updates.map((u) => {
          const row = resolveRow(sheet, u.row);
          cellsFromInput(sheet.columns, u.cells, { byTitle: true });
          return { row, cells: u.cells };
        });
        for (const p of planned) {
          await updateSheetRowCells(resolved.id, sheet.id, p.row.id, p.cells, actorOf(user), { byTitle: true });
        }
        return textResult(
          { updated: planned.map((p) => p.row.id) },
          `Updated ${planned.length} row${planned.length === 1 ? "" : "s"} in "${sheet.title}".`,
        );
      },
    },
    {
      name: "delete_sheet_rows",
      description:
        "Remove rows from a sheet (soft delete — the team can restore them; pass restore: true to bring " +
        "removed rows back). Rows by id or exact title-cell text. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, rows: ROW_REFS_JSON, restore: { type: "boolean" } },
        required: ["client", "sheet", "rows"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = deleteRowsSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const ids = parsed.rows.map((r) => resolveRow(sheet, r, { includeDeleted: parsed.restore }).id);
        const count = await setSheetRowsDeleted(resolved.id, sheet.id, ids, !parsed.restore);
        return textResult({ count }, `${parsed.restore ? "Restored" : "Removed"} ${count} row${count === 1 ? "" : "s"}.`);
      },
    },
    {
      name: "send_sheet_rows_to_board",
      description:
        "Send rows to the client's dev task board: each becomes a Backlog task titled from the sheet's " +
        "title column, with the other cells in its description, and the row then tracks that task. " +
        "Idempotent — a row whose task still exists returns that task instead of a second one. " +
        "category = a feature block (category) id or exact name on the client's board. Rows by id or " +
        "exact title-cell text. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET, rows: ROW_REFS_JSON, category: { type: "string" } },
        required: ["client", "sheet", "rows"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "send sheet rows to the board");
        const parsed = sendSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const ids = parsed.rows.map((r) => resolveRow(sheet, r).id);
        let featureBlockId: string | null = null;
        if (parsed.category) {
          const block = await prisma.featureBlock.findFirst({
            where: {
              clientId: resolved.id,
              OR: [{ id: parsed.category }, { name: { equals: parsed.category.trim(), mode: "insensitive" } }],
            },
            select: { id: true },
          });
          if (!block) throw new SheetError(`No category "${parsed.category}" on ${resolved.name}'s board.`);
          featureBlockId = block.id;
        }
        const results = await sendSheetRowsToBoard({ clientId: resolved.id }, sheet.id, ids, actorOf(user), {
          featureBlockId,
          sheetUrl: `/app/portal/${resolved.slug}/wiki#sheets`,
        });
        const made = results.filter((r) => r.created).length;
        return textResult(
          { results },
          `${made} task${made === 1 ? "" : "s"} created${results.length - made ? `, ${results.length - made} already on the board` : ""}.`,
        );
      },
    },
    {
      name: "delete_sheet",
      description: "Delete a sheet and all its rows. Cannot be undone. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: { client: CLIENT, sheet: SHEET },
        required: ["client", "sheet"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "edit sheets");
        const parsed = ref.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        await deleteWikiSheet(resolved.id, sheet.id);
        return textResult({ deleted: true, id: sheet.id }, `Deleted "${sheet.title}" from ${resolved.name}.`);
      },
    },
  ];
}

