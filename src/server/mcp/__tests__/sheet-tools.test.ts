/**
 * The Sheets MCP tools, run through the real handler against a mocked store.
 *
 * Pinned: writers need 'Manage clients'; cells are written and read by COLUMN TITLE through
 * the same coercion as the grid; update_sheet_rows is all-or-nothing (one bad value or one
 * unknown row and nothing is written); rows resolve by id or exact title cell, ambiguity is
 * an error; send is passed through with the client's scope; enable_wiki_section knows Sheets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiSheet } from "@/types/wiki-sheets";

const store = vi.hoisted(() => ({
  enabled: false,
  sheets: [] as WikiSheet[],
  writes: [] as Array<{ rowId: string; cells: Record<string, unknown> }>,
  sent: [] as Array<{ scope: unknown; rowIds: string[]; featureBlockId: unknown }>,
  toggled: [] as boolean[],
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

vi.mock("@/server/clients", async (orig) => ({
  ...(await orig<typeof import("@/server/clients")>()),
  listDerivedClients: vi.fn(async () => ({
    clients: [{ id: "client-1", slug: "northwind", name: "Northwind", status: "ACTIVE", devCount: 0 }],
  })),
}));

vi.mock("@/server/wiki-sheets", async (orig) => {
  const real = await orig<typeof import("@/server/wiki-sheets")>();
  return {
    ...real,
    loadWikiSheets: vi.fn(async () => ({ enabled: store.enabled, sheets: store.sheets })),
    setWikiSheetsEnabled: vi.fn(async (_c: string, enabled: boolean) => {
      store.enabled = enabled;
      store.toggled.push(enabled);
    }),
    createWikiSheet: vi.fn(async (_c: string, input: { title: string; columns: { id: string; title: string; type?: string; options?: string[] }[]; titleColumnId: string | null; rows?: Record<string, unknown>[] }) => {
      const { parseSheetColumns } = await import("@/lib/wiki-sheets");
      const columns = parseSheetColumns(input.columns.map((c) => ({ ...c, clientEditable: true })));
      const rows = (input.rows ?? []).map((r, i) => ({
        id: `r${i + 1}`,
        cells: real.cellsFromInput(columns, r, { byTitle: true }).set,
        stage: null,
        taskId: null,
        assignees: [],
        deletedAt: null,
        createdByKind: "TEAM",
      }));
      const sheet = {
        id: "s-new",
        title: input.title,
        columns,
        titleColumnId: input.titleColumnId,
        rows,
      } as unknown as WikiSheet;
      store.sheets.push(sheet);
      return sheet;
    }),
    updateSheetRowCells: vi.fn(async (_c: string, _s: string, rowId: string, cells: Record<string, unknown>) => {
      store.writes.push({ rowId, cells });
    }),
    sendSheetRowsToBoard: vi.fn(async (scope: unknown, _s: string, rowIds: string[], _a: unknown, opts: { featureBlockId?: unknown }) => {
      store.sent.push({ scope, rowIds, featureBlockId: opts.featureBlockId });
      return rowIds.map((rowId) => ({ rowId, taskId: `task-${rowId}`, created: true }));
    }),
  };
});

import { _testing } from "../handler";
import type { EffectiveUser } from "@/server/auth/effective-user";

const admin = { id: "u1", name: "Harry", role: "SUPER_ADMIN", permissions: [] } as unknown as EffectiveUser;
const developer = { id: "u2", role: "DEVELOPER", permissions: ["clients.seeAll"] } as unknown as EffectiveUser;

async function call(name: string, args: Record<string, unknown>, user: EffectiveUser = admin) {
  const tool = _testing.TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(user, args);
}
function json(res: { content: { text: string }[] }) {
  const text = res.content[0].text;
  return JSON.parse(text.slice(text.indexOf("\n\n") + 2));
}

function seed(): WikiSheet {
  return {
    id: "s1",
    title: "Content to build",
    description: null,
    orderKey: 0,
    columns: [
      { id: "item", title: "Item", type: "text", clientEditable: true },
      { id: "pri", title: "Priority", type: "select", options: ["Low", "High"], clientEditable: true },
      { id: "due", title: "Wanted by", type: "date", clientEditable: true },
    ],
    titleColumnId: "item",
    clientCanEdit: true,
    clientCanAddRows: true,
    clientCanSendToBoard: false,
    rows: [
      { id: "r1", cells: { item: "Pricing page", pri: "Low" }, stage: "IN_PROGRESS", taskId: "t1", assignees: [], deletedAt: null, createdByKind: "TEAM" },
      { id: "r2", cells: { item: "Blog" }, stage: null, taskId: null, assignees: [], deletedAt: null, createdByKind: "CLIENT", createdByName: "Priya" },
      { id: "r3", cells: { item: "Blog" }, stage: null, taskId: null, assignees: [], deletedAt: null, createdByKind: "TEAM" },
    ],
    updatedAt: "",
  } as unknown as WikiSheet;
}

beforeEach(() => {
  store.enabled = true;
  store.sheets = [seed()];
  store.writes = [];
  store.sent = [];
  store.toggled = [];
});

describe("reading", () => {
  it("get_sheet keys cells by column title and reports the derived board stage", async () => {
    const out = json(await call("get_sheet", { client: "northwind", sheet: "content to build" }));
    expect(out.rows[0]).toMatchObject({ id: "r1", cells: { Item: "Pricing page", Priority: "Low" }, board: "In progress" });
    expect(out.rows[1]).toMatchObject({ board: "Not on board", createdBy: "client (Priya)" });
  });

  it("an unknown sheet names the sheets that do exist", async () => {
    await expect(call("get_sheet", { client: "northwind", sheet: "Nope" })).rejects.toThrow(/Content to build/);
  });
});

describe("writing", () => {
  it("every writer needs 'Manage clients'", async () => {
    await expect(call("update_sheet_rows", { client: "northwind", sheet: "s1", updates: [{ row: "r1", cells: { Priority: "High" } }] }, developer)).rejects.toThrow();
    await expect(call("send_sheet_rows_to_board", { client: "northwind", sheet: "s1", rows: ["r2"] }, developer)).rejects.toThrow();
    expect(store.writes).toEqual([]);
    expect(store.sent).toEqual([]);
  });

  it("update_sheet_rows resolves rows by id or title cell and writes by column title", async () => {
    await call("update_sheet_rows", {
      client: "northwind",
      sheet: "s1",
      updates: [
        { row: "pricing page", cells: { Priority: "high" } },
        { row: "r2", cells: { "Wanted by": "03/11/2026" } },
      ],
    });
    expect(store.writes).toEqual([
      { rowId: "r1", cells: { Priority: "high" } },
      { rowId: "r2", cells: { "Wanted by": "03/11/2026" } },
    ]);
  });

  it("is all or nothing: one bad value and NOTHING is written", async () => {
    await expect(
      call("update_sheet_rows", {
        client: "northwind",
        sheet: "s1",
        updates: [
          { row: "r1", cells: { Priority: "High" } },
          { row: "r2", cells: { Priority: "Urgent" } },
        ],
      }),
    ).rejects.toThrow(/must be one of: Low, High/);
    expect(store.writes).toEqual([]);
  });

  it("an ambiguous title cell is an error, never a guess", async () => {
    await expect(
      call("update_sheet_rows", { client: "northwind", sheet: "s1", updates: [{ row: "Blog", cells: { Priority: "Low" } }] }),
    ).rejects.toThrow(/matches 2 rows/);
    expect(store.writes).toEqual([]);
  });

  it("create_sheet takes typed columns and rows by title, and switches the section on", async () => {
    store.enabled = false;
    const out = json(
      await call("create_sheet", {
        client: "northwind",
        title: "Bugs",
        columns: ["Issue", { title: "Severity", type: "select", options: ["Low", "High"] }],
        titleColumn: "Issue",
        rows: [{ Issue: "Login loops", Severity: "high" }],
      }),
    );
    expect(out.columns.map((c: { type: string }) => c.type)).toEqual(["text", "select"]);
    expect(out.titleColumn).toBe("Issue");
    expect(out.rows[0].cells).toEqual({ Issue: "Login loops", Severity: "High" });
    expect(store.toggled).toEqual([true]);
  });

  it("create_sheet refuses a titleColumn that isn't one of the columns", async () => {
    await expect(
      call("create_sheet", { client: "northwind", title: "X", columns: ["A"], titleColumn: "B" }),
    ).rejects.toThrow(/isn't one of the columns/);
  });

  it("send_sheet_rows_to_board is scoped to the resolved client", async () => {
    await call("send_sheet_rows_to_board", { client: "northwind", sheet: "s1", rows: ["r2"] });
    expect(store.sent).toEqual([{ scope: { clientId: "client-1" }, rowIds: ["r2"], featureBlockId: null }]);
  });

  it("enable_wiki_section can switch Sheets on and off", async () => {
    await call("enable_wiki_section", { client: "northwind", section: "sheets", enabled: false });
    expect(store.toggled).toEqual([false]);
  });
});
