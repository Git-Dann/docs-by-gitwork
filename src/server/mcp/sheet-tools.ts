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
  isSheetPerson,
  resolvePersonRef,
  titleColumn,
} from "@/lib/wiki-sheets";
import { isMediaList, mediaKind, mediaTitle } from "@/lib/wiki-sheet-media";
import { planRowMove } from "@/lib/wiki-sheet-layout";
import { stageSummary } from "@/lib/wiki-sheet-board";
import { sheetPeopleDirectory } from "@/server/wiki-intake-mentions";
import { STAGE_LABEL } from "@/lib/wiki-request-stage";
import {
  SheetError,
  addSheetColumns,
  addSheetRows,
  cellsFromInput,
  createWikiSheet,
  deleteWikiSheet,
  loadWikiSheets,
  reorderSheetRows,
  setSheetRowHeight,
  removeSheetColumn,
  sendSheetRowsToBoard,
  setSheetRowsDeleted,
  setWikiSheetsEnabled,
  updateSheetColumn,
  updateSheetRowCells,
  updateWikiSheet,
  type SheetActor,
} from "@/server/wiki-sheets";
import { fetchImageFromUrl, saveSheetImage } from "@/server/wiki-sheet-files";
import { SHEET_IMAGE_MAX_BYTES } from "@/lib/wiki-sheet-files";
import type { SheetCellValue, SheetColumn, SheetColumnType, WikiSheet, WikiSheetRow } from "@/types/wiki-sheets";

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
  description:
    'Values keyed by COLUMN TITLE, e.g. {"Item": "Pricing page", "Priority": "High", "Owner": "Priya Shah"}. ' +
    "A person cell takes a name or email on the client's list (exact; unknown or ambiguous is an error). " +
    'A media cell takes a URL, an array of URLs, or [{"url": …, "title": …}].',
  additionalProperties: {
    anyOf: [
      { type: ["string", "number", "boolean", "null"] },
      {
        type: "array",
        items: {
          anyOf: [
            { type: "string" },
            { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url"] },
          ],
        },
      },
    ],
  },
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
const mediaArg = z
  .array(z.union([z.string().max(SHEET_LIMITS.maxLink), z.object({ url: z.string().max(SHEET_LIMITS.maxLink), title: z.string().max(200).optional() })]))
  .max(SHEET_LIMITS.maxMedia);
const cellsArg = z.record(
  z.string(),
  z.union([z.string().max(SHEET_LIMITS.maxLongText), z.number(), z.boolean(), z.null(), mediaArg]),
);
const uploadImageSchema = z
  .object({
    client: z.string().min(1),
    sheet: z.string().min(1),
    imageBase64: z.string().max(Math.ceil((SHEET_IMAGE_MAX_BYTES * 4) / 3) + 200).optional(),
    imageUrl: z.string().url().max(SHEET_LIMITS.maxLink).optional(),
    filename: z.string().trim().min(1).max(120).optional(),
    title: z.string().max(120).optional(),
    row: z.string().min(1).optional(),
    column: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.imageBase64) !== Boolean(v.imageUrl), {
    message: "Give exactly one of imageBase64 or imageUrl.",
  });

/** Base64 (optionally a data: URL) → bytes. Garbage decodes to bytes the image check refuses. */
export function decodeBase64Image(raw: string): Uint8Array {
  const body = raw.trim().replace(/^data:[^;,]*;base64,/i, "").replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/_-]+=*$/.test(body)) throw new SheetError("imageBase64 isn't valid base64.", 400);
  return new Uint8Array(Buffer.from(body, body.includes("-") || body.includes("_") ? "base64url" : "base64"));
}

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
  width: z.number().int().min(SHEET_LIMITS.minWidth).max(SHEET_LIMITS.maxWidth).nullable().optional(),
});
const removeColumnSchema = ref.extend({ column: z.string().min(1) });
const addRowsSchema = ref.extend({ rows: z.array(cellsArg).min(1).max(SHEET_LIMITS.maxBatch) });
const updateRowsSchema = ref.extend({
  updates: z
    .array(
      z
        .object({
          row: z.string().min(1),
          cells: cellsArg.optional(),
          height: z.number().int().min(SHEET_LIMITS.minRowHeight).max(SHEET_LIMITS.maxRowHeight).nullable().optional(),
        })
        .refine((u) => u.cells !== undefined || u.height !== undefined, "Each update needs cells or a height."),
    )
    .min(1)
    .max(SHEET_LIMITS.maxBatch),
});
const reorderSchema = ref
  .extend({
    order: z.array(z.string().min(1)).min(1).max(SHEET_LIMITS.maxRows).optional(),
    move: z.object({ row: z.string().min(1), before: z.string().min(1).optional(), after: z.string().min(1).optional() }).optional(),
  })
  .refine((a) => Boolean(a.order) !== Boolean(a.move), "Pass either order or move, not both.");
const rowRefsSchema = ref.extend({
  rows: z.array(z.string().min(1)).min(1).max(SHEET_LIMITS.maxBatch),
});
const deleteRowsSchema = rowRefsSchema.extend({ restore: z.boolean().optional() });
const sendSchema = rowRefsSchema.extend({ category: z.string().optional() });
const getSchema = ref.extend({ includeDeleted: z.boolean().optional() });

function columnInput(c: z.infer<typeof columnArg>) {
  return typeof c === "string" ? { title: c } : c;
}

/**
 * Person cells from an agent arrive as a name or an email. Each is resolved against the
 * client's person directory (the team's side, §73.1) — exactly one match, or an error
 * that says who was meant. Never a fuzzy guess: the wrong name in a cell is worse than
 * asking. Mutates the cell objects in place (keyed by title, as the caller passed them).
 */
async function resolvePersonCells(
  clientId: string,
  columns: readonly Pick<SheetColumn, "id" | "title" | "type">[],
  rows: Record<string, unknown>[],
): Promise<void> {
  const personKeys = (cells: Record<string, unknown>) =>
    Object.keys(cells).filter((k) => {
      const col = columns.find((c) => c.id === k) ?? columns.find((c) => c.title.toLowerCase() === k.trim().toLowerCase());
      const v = cells[k];
      return col?.type === "person" && typeof v === "string" && v.trim() !== "";
    });
  if (!rows.some((r) => personKeys(r).length)) return;
  const people = await sheetPeopleDirectory({ clientId }, "team");
  for (const cells of rows) {
    for (const k of personKeys(cells)) {
      const text = String(cells[k]);
      const hit = resolvePersonRef(people, text);
      if (hit.ok) {
        cells[k] = hit.person;
        continue;
      }
      throw new SheetError(
        hit.reason === "ambiguous"
          ? `"${text}" matches ${hit.matches.length} people on this client (${hit.matches.map((m) => m.name).join(", ")}) — use their email.`
          : `"${text}" isn't on this client's list of people. Use list_members, or the name/email of someone on the client's wiki.`,
      );
    }
  }
}

/** A cell as an agent reads it: a person by name, media as {url, title, kind}. */
function projectValue(value: SheetCellValue | undefined): unknown {
  if (isSheetPerson(value)) return value.name;
  if (isMediaList(value)) return value.map((m) => ({ url: m.url, title: mediaTitle(m), kind: mediaKind(m.url) ?? "file" }));
  return value;
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
      ...(c.width ? { width: c.width } : {}),
      clientEditable: c.clientEditable,
    })),
    rows: sheet.rows
      .filter((r) => opts.includeDeleted || !r.deletedAt)
      .map((r) => ({
        id: r.id,
        cells: Object.fromEntries(
          sheet.columns.filter((c) => r.cells[c.id] !== undefined).map((c) => [c.title, projectValue(r.cells[c.id])]),
        ),
        board: r.stage ? STAGE_LABEL[r.stage] : "Not on board",
        taskId: r.taskId,
        // The live task, derived at read (§73.1) — null when not on the board or the task is gone.
        task: r.task
          ? {
              stage: r.stage ? STAGE_LABEL[r.stage] : null,
              assignees: r.task.assignees.map((a) => a.name),
              dueDate: r.task.dueDate,
              updatedAt: r.task.updatedAt,
            }
          : null,
        ...(r.height ? { height: r.height } : {}),
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
            byStage: Object.fromEntries(stageSummary(live).map((x) => [x.label, x.count])),
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
        if (parsed.rows) {
          await resolvePersonCells(
            resolved.id,
            columns.map((c, i) => ({ id: ids[i], title: c.title, type: c.type ?? "text" })),
            parsed.rows,
          );
        }
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
        "Rename, retype, re-option, lock/unlock for the client, resize (width in px, " +
        `${SHEET_LIMITS.minWidth}–${SHEET_LIMITS.maxWidth}; null = size to content) or move one column (position = 0-based ` +
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
          width: {
            type: ["integer", "null"],
            minimum: SHEET_LIMITS.minWidth,
            maximum: SHEET_LIMITS.maxWidth,
            description: "Column width in px for everyone; null = size to content.",
          },
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
          width: parsed.width,
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
        await resolvePersonCells(resolved.id, sheet.columns, parsed.rows);
        const { rowIds } = await addSheetRows(resolved.id, sheet.id, parsed.rows, actorOf(user), { byTitle: true });
        return textResult({ rowIds }, `Added ${rowIds.length} row${rowIds.length === 1 ? "" : "s"} to "${sheet.title}".`);
      },
    },
    {
      name: "update_sheet_rows",
      description:
        "Change cells in existing rows: updates = [{ row: <row id or exact title-cell text>, cells: " +
        "{ <column title>: value }, height?: px | null }]. Only the cells named change (merged per cell); " +
        `height sets the row's height for everyone (${SHEET_LIMITS.minRowHeight}–${SHEET_LIMITS.maxRowHeight}px, null = auto). ` +
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
              properties: {
                row: { type: "string" },
                cells: CELLS_JSON,
                height: { type: ["integer", "null"], minimum: SHEET_LIMITS.minRowHeight, maximum: SHEET_LIMITS.maxRowHeight },
              },
              required: ["row"],
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
          if (u.cells) cellsFromInput(sheet.columns, u.cells, { byTitle: true });
          return { row, cells: u.cells, height: u.height };
        });
        await resolvePersonCells(
          resolved.id,
          sheet.columns,
          planned.flatMap((p) => (p.cells ? [p.cells] : [])),
        );
        for (const p of planned) {
          if (p.cells && Object.keys(p.cells).length) {
            await updateSheetRowCells(resolved.id, sheet.id, p.row.id, p.cells, actorOf(user), { byTitle: true });
          }
          if (p.height !== undefined) await setSheetRowHeight(resolved.id, sheet.id, p.row.id, p.height);
        }
        return textResult(
          { updated: planned.map((p) => p.row.id) },
          `Updated ${planned.length} row${planned.length === 1 ? "" : "s"} in "${sheet.title}".`,
        );
      },
    },
    {
      name: "upload_sheet_image",
      description:
        "Upload an image (PNG, JPEG, GIF or WebP, up to 10 MB) into a sheet and, optionally, attach it to a row's " +
        "media cell. Give the image as imageBase64 (raw or a data: URL) or as imageUrl (a public http(s) link we " +
        "fetch once). With row + column, the image is APPENDED to that media cell (column must be a media column); " +
        "without them, it returns the stored {url, title} to use in add_sheet_rows / update_sheet_rows. " +
        "Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          sheet: SHEET,
          imageBase64: { type: "string", description: "The image bytes, base64 (a data:image/...;base64, prefix is fine)." },
          imageUrl: { type: "string", description: "A public http(s) URL of the image, fetched once and stored." },
          filename: { type: "string", description: "File name, e.g. 'checkout-bug.png'." },
          title: { type: "string", description: "Title shown on the chip (defaults to the file name)." },
          row: { type: "string", description: "Row id or exact title-cell text to attach to." },
          column: { type: "string", description: "Media column title to attach to." },
        },
        required: ["client", "sheet"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "upload sheet images");
        const parsed = uploadImageSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        // Resolve the target before storing anything, so a bad row/column stores nothing.
        let target: { row: WikiSheetRow; column: SheetColumn } | null = null;
        if (parsed.row || parsed.column) {
          if (!parsed.row || !parsed.column) throw new SheetError("Give both row and column, or neither.", 400);
          const column = findColumn(sheet.columns, parsed.column);
          if (!column) throw new SheetError(`No column "${parsed.column}" in "${sheet.title}".`, 400);
          if (column.type !== "media") throw new SheetError(`"${column.title}" isn't a media column.`, 400);
          target = { row: resolveRow(sheet, parsed.row), column };
        }
        const file = parsed.imageUrl
          ? await fetchImageFromUrl(parsed.imageUrl)
          : { bytes: decodeBase64Image(parsed.imageBase64 ?? ""), filename: parsed.filename ?? "image" };
        if (parsed.filename) file.filename = parsed.filename;
        const stored = await saveSheetImage({ clientId: resolved.id }, sheet.id, file, actorOf(user));
        const item = { url: stored.url, title: parsed.title?.trim() || stored.title };
        if (target) {
          const existing = target.row.cells[target.column.id];
          const items = [...(isMediaList(existing) ? existing : []), item];
          await updateSheetRowCells(resolved.id, sheet.id, target.row.id, { [target.column.title]: items }, actorOf(user), {
            byTitle: true,
          });
        }
        return textResult(
          { ...item, size: stored.size, attachedTo: target ? { row: target.row.id, column: target.column.title } : null },
          target
            ? `Uploaded "${item.title}" and attached it to "${target.column.title}" in "${sheet.title}".`
            : `Uploaded "${item.title}" to "${sheet.title}". Put {"url": "${item.url}"} in a media cell to show it.`,
        );
      },
    },
    {
      name: "reorder_sheet_rows",
      description:
        "Reorder a sheet's rows. Either order = [row refs in the order wanted] (rows you leave out keep " +
        "their relative order after them), or move = { row, before | after: another row } to move one row. " +
        "Rows by id or exact title-cell text; an ambiguous match is an error. Requires 'Manage clients'.",
      inputSchema: {
        type: "object",
        properties: {
          client: CLIENT,
          sheet: SHEET,
          order: ROW_REFS_JSON,
          move: {
            type: "object",
            properties: { row: { type: "string" }, before: { type: "string" }, after: { type: "string" } },
            required: ["row"],
            additionalProperties: false,
          },
        },
        required: ["client", "sheet"],
        additionalProperties: false,
      },
      handler: async (user, args) => {
        assertCan(user, canManageClients, "reorder sheet rows");
        const parsed = reorderSchema.parse(args);
        const resolved = await resolveClient(user, parsed.client);
        const sheet = await resolveSheet(resolved.id, parsed.sheet);
        const current = sheet.rows.filter((r) => !r.deletedAt).map((r) => r.id);
        let order: string[];
        if (parsed.order) {
          order = parsed.order.map((r) => resolveRow(sheet, r).id);
        } else {
          const m = parsed.move!;
          try {
            order = planRowMove(current, {
              row: resolveRow(sheet, m.row).id,
              before: m.before ? resolveRow(sheet, m.before).id : undefined,
              after: m.after ? resolveRow(sheet, m.after).id : undefined,
            });
          } catch (err) {
            if (err instanceof SheetError) throw err;
            throw new SheetError(err instanceof Error ? err.message : "Can't move that row.");
          }
        }
        const next = await reorderSheetRows(resolved.id, sheet.id, order);
        const titleCol = titleColumn(sheet.columns, sheet.titleColumnId);
        const label = (id: string) => {
          const r = sheet.rows.find((x) => x.id === id);
          return r && titleCol ? cellText(titleCol, r.cells[titleCol.id]) || id : id;
        };
        return textResult(
          { order: next.filter((id) => current.includes(id)).map((id) => ({ id, title: label(id) })) },
          `Reordered "${sheet.title}".`,
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

