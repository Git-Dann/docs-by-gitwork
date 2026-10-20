/**
 * Sheets demo fixture + a write resolver that applies every internal Sheets call to it, so
 * an edit on `/demo/wiki#sheets` survives the refetch that follows (§43.3: a demo where every
 * write succeeds and changes nothing verifies the CSS and nothing else).
 *
 * The fixture is the shape the section has to look right with: mixed column types, a long
 * text cell, a link, a client-only-locked column, rows created by both sides, and rows at
 * every board stage — including one whose task has gone missing (REVIEWING, never
 * "scheduled") and one soft-deleted row the team can restore.
 */

import {
  SHEET_LIMITS,
  cleanOptions,
  coerceCellValue,
  convertValues,
  newSheetColumnId,
  parseRowCells,
  parseSheetColumns,
  uniqueColumnTitle,
} from "@/lib/wiki-sheets";
import type {
  SheetCellValue,
  SheetColumn,
  WikiSheet,
  WikiSheetRow,
  WikiSheetsSection,
} from "@/types/wiki-sheets";
import type { RequestStage } from "@/lib/wiki-request-stage";

const COLS: SheetColumn[] = [
  { id: "c-item", title: "Item", type: "text", clientEditable: true },
  { id: "c-type", title: "Type", type: "select", options: ["Page", "Feature", "Content", "Fix"], clientEditable: true },
  { id: "c-priority", title: "Priority", type: "select", options: ["Low", "Medium", "High"], clientEditable: true },
  { id: "c-due", title: "Wanted by", type: "date", clientEditable: true },
  { id: "c-ref", title: "Reference", type: "link", clientEditable: true },
  { id: "c-copy", title: "Copy ready", type: "checkbox", clientEditable: true },
  { id: "c-words", title: "Words", type: "number", clientEditable: true },
  { id: "c-owner", title: "Owner", type: "person", clientEditable: true },
  { id: "c-notes", title: "Notes", type: "long_text", clientEditable: true },
  { id: "c-estimate", title: "Our estimate (days)", type: "number", clientEditable: false },
];

type Seed = {
  cells: Record<string, SheetCellValue>;
  stage?: RequestStage;
  taskId?: string;
  by?: "TEAM" | "CLIENT";
  deleted?: boolean;
  assignees?: string[];
};

const SEED: Seed[] = [
  { cells: { "c-item": "Membership pricing page", "c-type": "Page", "c-priority": "High", "c-due": "2026-11-03", "c-ref": "https://northwind.example/pricing-draft", "c-copy": true, "c-words": 650, "c-owner": "Priya Shah", "c-notes": "Three plans side by side. Annual toggle defaults to monthly.", "c-estimate": 3 }, stage: "DONE", taskId: "demo-sheet-task-1", by: "CLIENT", assignees: ["Javed Khan"] },
  { cells: { "c-item": "Class timetable filters", "c-type": "Feature", "c-priority": "High", "c-due": "2026-11-10", "c-copy": false, "c-owner": "Tom Riley", "c-notes": "Filter by studio, instructor and class length.", "c-estimate": 5 }, stage: "IN_PROGRESS", taskId: "demo-sheet-task-2", by: "CLIENT", assignees: ["Waqar Ali"] },
  { cells: { "c-item": "Instructor bio pages", "c-type": "Content", "c-priority": "Medium", "c-due": "2026-11-14", "c-ref": "https://docs.google.com/document/d/northwind-bios", "c-copy": true, "c-words": 1800, "c-owner": "Priya Shah", "c-estimate": 2 }, stage: "IN_REVIEW", taskId: "demo-sheet-task-3", by: "TEAM", assignees: ["Sian Woolridge"] },
  { cells: { "c-item": "Gift card checkout", "c-type": "Feature", "c-priority": "Medium", "c-due": "2026-11-28", "c-notes": "Needs Stripe gift card product set up on their account first.", "c-estimate": 4 }, stage: "SCHEDULED", taskId: "demo-sheet-task-4", by: "CLIENT" },
  { cells: { "c-item": "Fix: waitlist email sends twice", "c-type": "Fix", "c-priority": "High", "c-owner": "Tom Riley", "c-estimate": 1 }, stage: "REVIEWING", taskId: "demo-sheet-task-missing", by: "CLIENT" },
  { cells: { "c-item": "Studio locations map", "c-type": "Page", "c-priority": "Low", "c-due": "2026-12-05", "c-ref": "https://northwind.example/locations", "c-copy": false, "c-words": 300 }, by: "CLIENT" },
  { cells: { "c-item": "Blog: 5 stretches before spin", "c-type": "Content", "c-priority": "Low", "c-copy": true, "c-words": 900, "c-owner": "Priya Shah" }, by: "CLIENT" },
  { cells: { "c-item": "Referral programme", "c-type": "Feature", "c-priority": "Medium", "c-due": "2027-01-15", "c-notes": "£10 credit for both members when a referral joins.", "c-estimate": 6 }, by: "TEAM" },
  { cells: { "c-item": "Accessibility statement", "c-type": "Page", "c-priority": "Medium", "c-copy": false, "c-owner": "Tom Riley" }, by: "CLIENT" },
  { cells: { "c-item": "Push notification preferences", "c-type": "Feature", "c-priority": "Low", "c-estimate": 2 }, by: "TEAM" },
  { cells: { "c-item": "Corporate wellness landing page", "c-type": "Page", "c-priority": "Medium", "c-due": "2026-12-12", "c-words": 500 }, by: "CLIENT" },
  { cells: { "c-item": "FAQ refresh", "c-type": "Content", "c-priority": "Low", "c-copy": true, "c-words": 1200 }, by: "CLIENT" },
  { cells: { "c-item": "Old homepage hero test", "c-type": "Page", "c-priority": "Low" }, by: "CLIENT", deleted: true },
];

function seedRow(seed: Seed, i: number): WikiSheetRow {
  return {
    id: `demo-sheet-row-${i + 1}`,
    orderKey: i + 1,
    cells: parseRowCells(seed.cells, COLS),
    taskId: seed.taskId ?? null,
    stage: seed.stage ?? null,
    assignees: seed.assignees ?? [],
    createdByKind: seed.by ?? "TEAM",
    createdByName: seed.by === "CLIENT" ? "Priya Shah" : "Harry Brown",
    createdByWikiUserId: seed.by === "CLIENT" ? "demo-wiki-user-priya" : null,
    mine: false,
    updatedByKind: i % 3 === 0 ? "CLIENT" : "TEAM",
    updatedByName: i % 3 === 0 ? "Priya Shah" : "Harry Brown",
    deletedAt: seed.deleted ? "2026-10-15T10:00:00.000Z" : null,
    updatedAt: "2026-10-19T09:00:00.000Z",
  };
}

export const demoSheets: WikiSheetsSection = {
  enabled: true,
  sheets: [
    {
      id: "demo-sheet-content",
      title: "Content to build",
      description: "Everything Northwind wants built or written for the member app and site. Edit away — send a row to the board when it's ready.",
      orderKey: 0,
      columns: COLS,
      titleColumnId: "c-item",
      clientCanEdit: true,
      clientCanAddRows: true,
      clientCanSendToBoard: true,
      rows: SEED.map(seedRow),
      updatedAt: "2026-10-19T09:00:00.000Z",
    },
    {
      id: "demo-sheet-links",
      title: "Brand assets & links",
      description: null,
      orderKey: 1,
      columns: [
        { id: "l-asset", title: "Asset", type: "text", clientEditable: true },
        { id: "l-link", title: "Link", type: "link", clientEditable: true },
        { id: "l-final", title: "Final", type: "checkbox", clientEditable: true },
      ],
      titleColumnId: "l-asset",
      clientCanEdit: true,
      clientCanAddRows: true,
      clientCanSendToBoard: false,
      rows: [
        { "l-asset": "Logo pack (SVG)", "l-link": "https://drive.example/northwind/logo", "l-final": true },
        { "l-asset": "Photography — studios", "l-link": "https://drive.example/northwind/photos", "l-final": false },
        { "l-asset": "Tone of voice guide", "l-link": "https://drive.example/northwind/tov", "l-final": true },
      ].map((cells, i) => seedRow({ cells, by: "CLIENT" }, 100 + i)),
      updatedAt: "2026-10-19T09:00:00.000Z",
    },
  ],
};

function now(): string {
  return new Date().toISOString();
}

let seq = 0;

/**
 * Apply an internal Sheets call to the fixture. Returns `undefined` when the path isn't a
 * Sheets route, so the caller falls through to its other handlers.
 */
export function resolveDemoSheets(
  pathname: string,
  method: string,
  body: Record<string, unknown> | undefined,
): unknown {
  const m = /^\/api\/clients\/[^/]+\/wiki\/sheets(?:\/([^/]+))?(?:\/(columns|rows)(?:\/([^/]+))?)?$/.exec(pathname);
  if (!m) return undefined;
  const [, sheetId, sub, subId] = m;
  const section = demoSheets;
  const touch = (s: WikiSheet) => {
    s.updatedAt = now();
    return s;
  };

  if (!sheetId) {
    if (method === "PATCH" && body) section.enabled = body.enabled === true;
    if (method === "POST" && body) {
      const columns = parseSheetColumns(
        (Array.isArray(body.columns) ? body.columns : []).map((c: Record<string, unknown>) => ({
          ...c,
          id: c.id ?? newSheetColumnId(),
          clientEditable: c.clientEditable ?? true,
        })),
      );
      const sheet: WikiSheet = {
        id: `demo-sheet-${Date.now().toString(36)}`,
        title: String(body.title ?? "Untitled"),
        description: typeof body.description === "string" ? body.description : null,
        orderKey: section.sheets.length,
        columns,
        titleColumnId: columns.find((c) => c.type === "text")?.id ?? null,
        clientCanEdit: body.clientCanEdit !== false,
        clientCanAddRows: body.clientCanAddRows !== false,
        clientCanSendToBoard: body.clientCanSendToBoard === true,
        rows: [],
        updatedAt: now(),
      };
      section.sheets.push(sheet);
      return { sheet, section };
    }
    return section;
  }

  const sheet = section.sheets.find((s) => s.id === sheetId);
  if (!sheet) return { error: "Sheet not found" };

  if (!sub) {
    if (method === "DELETE") {
      section.sheets.splice(section.sheets.indexOf(sheet), 1);
      return { deleted: true };
    }
    if (method === "PATCH" && body) {
      for (const k of ["title", "description", "titleColumnId", "clientCanEdit", "clientCanAddRows", "clientCanSendToBoard"] as const) {
        if (k in body) (sheet as unknown as Record<string, unknown>)[k] = body[k];
      }
      touch(sheet);
    }
    return sheet;
  }

  if (sub === "columns") {
    if (!subId && method === "POST" && Array.isArray(body?.columns)) {
      for (const c of body.columns as Record<string, unknown>[]) {
        if (sheet.columns.length >= SHEET_LIMITS.maxColumns) break;
        sheet.columns.push({
          id: newSheetColumnId(),
          title: uniqueColumnTitle(sheet.columns, String(c.title ?? "Column")),
          type: (c.type as SheetColumn["type"]) ?? "text",
          options: c.type === "select" ? cleanOptions(c.options) : undefined,
          clientEditable: c.clientEditable !== false,
        });
      }
      return touch(sheet);
    }
    const i = sheet.columns.findIndex((c) => c.id === subId);
    if (i < 0) return { error: "Column not found" };
    if (method === "DELETE") {
      sheet.columns.splice(i, 1);
      return touch(sheet);
    }
    if (method === "PATCH" && body) {
      const before = sheet.columns[i];
      const after: SheetColumn = { ...before };
      if (typeof body.title === "string") after.title = uniqueColumnTitle(sheet.columns.filter((c) => c !== before), body.title);
      if (typeof body.type === "string") after.type = body.type as SheetColumn["type"];
      if (after.type === "select") after.options = Array.isArray(body.options) ? cleanOptions(body.options) : (before.options ?? []);
      else delete after.options;
      if (typeof body.clientEditable === "boolean") after.clientEditable = body.clientEditable;
      if (typeof body.width === "number") after.width = body.width;
      let cleared = 0;
      for (const row of sheet.rows) {
        if (!(before.id in row.cells)) continue;
        const { values, failed } = convertValues(before, after, [row.cells[before.id]]);
        cleared += failed;
        if (values[0] === null) delete row.cells[before.id];
        else row.cells[before.id] = values[0];
      }
      sheet.columns.splice(i, 1);
      const at = typeof body.position === "number" ? Math.max(0, Math.min(sheet.columns.length, body.position)) : i;
      sheet.columns.splice(at, 0, after);
      return { sheet: touch(sheet), cleared };
    }
    return sheet;
  }

  // rows
  if (subId) {
    const row = sheet.rows.find((r) => r.id === subId);
    if (!row) return { error: "Row not found" };
    if (method === "PATCH" && body?.cells && typeof body.cells === "object") {
      for (const [colId, raw] of Object.entries(body.cells as Record<string, unknown>)) {
        const col = sheet.columns.find((c) => c.id === colId);
        if (!col) continue;
        const res = coerceCellValue(col, raw);
        if (!res.ok) return { error: res.error };
        if (res.value === null) delete row.cells[colId];
        else row.cells[colId] = res.value;
      }
      row.updatedByKind = "TEAM";
      row.updatedByName = "You";
      row.updatedAt = now();
      touch(sheet);
    }
    return { saved: true };
  }
  if (method === "POST" && Array.isArray(body?.rows)) {
    const ids: string[] = [];
    for (const cells of body.rows as Record<string, unknown>[]) {
      seq += 1;
      const id = `demo-sheet-row-new-${Date.now().toString(36)}-${seq}`;
      ids.push(id);
      sheet.rows.push({
        ...seedRow({ cells: {}, by: "TEAM" }, 0),
        id,
        orderKey: sheet.rows.length + 1,
        cells: parseRowCells(cells, sheet.columns),
        createdByName: "You",
        updatedByName: "You",
        updatedByKind: "TEAM",
        updatedAt: now(),
      });
    }
    return { sheet: touch(sheet), rowIds: ids };
  }
  if (method === "PATCH" && Array.isArray(body?.rowIds)) {
    const ids = new Set(body.rowIds as string[]);
    const results: { rowId: string; taskId: string; created: boolean }[] = [];
    for (const row of sheet.rows) {
      if (!ids.has(row.id)) continue;
      if (body.action === "delete") row.deletedAt = now();
      if (body.action === "restore") row.deletedAt = null;
      if (body.action === "send") {
        if (row.taskId && row.stage !== "REVIEWING") {
          results.push({ rowId: row.id, taskId: row.taskId, created: false });
          continue;
        }
        seq += 1;
        row.taskId = `demo-sheet-task-sent-${seq}`;
        row.stage = "SCHEDULED";
        results.push({ rowId: row.id, taskId: row.taskId, created: true });
      }
    }
    // Live rows first, as the server orders them.
    sheet.rows.sort((a, b) => Number(Boolean(a.deletedAt)) - Number(Boolean(b.deletedAt)) || a.orderKey - b.orderKey);
    return { results, count: ids.size, sheet: touch(sheet) };
  }
  return sheet;
}
