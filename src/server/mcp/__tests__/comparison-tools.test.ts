/**
 * The comparison MCP tools, run through the real handler against a mocked store.
 *
 * What is pinned: writes need 'Manage clients'; cells are written by COLUMN TITLE through
 * the same vocabulary as the editor; a batch with one bad reference changes nothing; the
 * 45-column ceiling holds over MCP too; and enable_wiki_section reaches the real toggle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiComparison } from "@/types/wiki-comparisons";

const store = vi.hoisted(() => ({
  enabled: false,
  tables: [] as WikiComparison[],
  toggled: [] as Array<[string, string, boolean]>,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

vi.mock("@/server/clients", async (orig) => ({
  ...(await orig<typeof import("@/server/clients")>()),
  listDerivedClients: vi.fn(async () => ({
    clients: [{ id: "client-1", slug: "northwind", name: "Northwind", status: "ACTIVE", devCount: 0 }],
  })),
}));

vi.mock("@/server/wiki-comparisons", async () => {
  const lib = await import("@/lib/wiki-comparisons");
  const save = (t: WikiComparison, input: { title: string; description?: string | null; columns: unknown; rows: unknown }) => {
    const limit = lib.comparisonLimitError(input as never);
    if (limit) throw new Error(limit);
    return {
      ...t,
      title: input.title,
      description: input.description ?? null,
      ...lib.parseComparisonContent(input.columns, input.rows),
    };
  };
  return {
    loadWikiComparisons: vi.fn(async () => ({ enabled: store.enabled, comparisons: store.tables })),
    setWikiComparisonsEnabled: vi.fn(async (clientId: string, enabled: boolean) => {
      store.enabled = enabled;
      store.toggled.push(["comparisons", clientId, enabled]);
    }),
    createWikiComparison: vi.fn(async (_c: string, input: never) => {
      const t = save({ id: `t${store.tables.length + 1}`, title: "", description: null, columns: [], rows: [], orderKey: 0, updatedAt: "" }, input);
      store.tables.push(t);
      return t;
    }),
    updateWikiComparison: vi.fn(async (_c: string, id: string, input: never) => {
      const i = store.tables.findIndex((t) => t.id === id);
      store.tables[i] = save(store.tables[i], input);
      return store.tables[i];
    }),
    deleteWikiComparison: vi.fn(async (_c: string, id: string) => {
      store.tables = store.tables.filter((t) => t.id !== id);
    }),
  };
});

vi.mock("@/server/wiki-insights", async (orig) => ({
  ...(await orig<typeof import("@/server/wiki-insights")>()),
  setWikiInsightsEnabled: vi.fn(async (clientId: string, enabled: boolean) => {
    store.toggled.push(["insights", clientId, enabled]);
  }),
}));

import { _testing } from "../handler";
import type { EffectiveUser } from "@/server/auth/effective-user";

const admin = { id: "u1", role: "SUPER_ADMIN", permissions: [] } as unknown as EffectiveUser;
const developer = {
  id: "u2",
  role: "DEVELOPER",
  permissions: ["clients.seeAll"],
} as unknown as EffectiveUser;

async function call(name: string, args: Record<string, unknown>, user: EffectiveUser = admin) {
  const tool = _testing.TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(user, args);
}

beforeEach(() => {
  store.enabled = false;
  store.tables = [];
  store.toggled = [];
});

describe("create_comparison", () => {
  it("builds the table from column titles and cells keyed by title, and switches the section on", async () => {
    const res = await call("create_comparison", {
      client: "northwind",
      title: "Plans",
      columns: ["Free", { title: "Pro", highlight: true, subtitle: "£9/mo" }],
      rows: [
        { label: "Core", group: true },
        { label: "Sync", cells: { Free: "no", Pro: "yes" } },
        { label: "Storage", cells: { free: "1 GB", PRO: "limited" } },
      ],
    });
    expect(res.isError).toBeUndefined();
    const [t] = store.tables;
    const [free, pro] = t.columns;
    expect(pro).toMatchObject({ title: "Pro", highlight: true, subtitle: "£9/mo" });
    expect(t.rows[0]).toMatchObject({ kind: "group", label: "Core", cells: {} });
    expect(t.rows[1].cells).toEqual({ [free.id]: { state: "no" }, [pro.id]: { state: "yes" } });
    expect(t.rows[2].cells).toEqual({
      [free.id]: { state: "text", text: "1 GB" },
      [pro.id]: { state: "partial" },
    });
    expect(store.enabled).toBe(true);
  });

  it("refuses 46 columns", async () => {
    await expect(
      call("create_comparison", {
        client: "northwind",
        title: "Too wide",
        columns: Array.from({ length: 46 }, (_, i) => `C${i}`),
      }),
    ).rejects.toThrow();
    expect(store.tables).toHaveLength(0);
  });

  it("needs 'Manage clients'", async () => {
    await expect(
      call("create_comparison", { client: "northwind", title: "x", columns: ["A"] }, developer),
    ).rejects.toThrow(/permission|not allowed|Forbidden|edit comparisons/i);
  });
});

describe("adding to a table", () => {
  beforeEach(async () => {
    await call("create_comparison", {
      client: "northwind",
      title: "Plans",
      columns: ["Free", "Pro"],
      rows: [{ label: "Sync", cells: { Free: "no", Pro: "yes" } }],
    });
  });

  it("add_comparison_columns appends and keeps existing cells; the 46th is refused", async () => {
    await call("add_comparison_columns", { client: "northwind", table: "Plans", columns: ["Enterprise"] });
    const t = store.tables[0];
    expect(t.columns.map((c) => c.title)).toEqual(["Free", "Pro", "Enterprise"]);
    expect(Object.keys(t.rows[0].cells)).toHaveLength(2);
    await expect(
      call("add_comparison_columns", {
        client: "northwind",
        table: "Plans",
        columns: Array.from({ length: 43 }, (_, i) => `X${i}`),
      }),
    ).rejects.toThrow(/45 columns/);
    expect(store.tables[0].columns).toHaveLength(3);
  });

  it("add_comparison_rows inserts after a named row", async () => {
    await call("add_comparison_rows", {
      client: "northwind",
      table: "plans",
      rows: [{ label: "Backup", cells: { Pro: "yes" } }, { label: "Extras", group: true }],
    });
    await call("add_comparison_rows", {
      client: "northwind",
      table: "Plans",
      rows: [{ label: "Offline" }],
      after: "Sync",
    });
    expect(store.tables[0].rows.map((r) => r.label)).toEqual(["Sync", "Offline", "Backup", "Extras"]);
  });

  it("set_comparison_cells is all-or-nothing: one unknown column changes nothing", async () => {
    await expect(
      call("set_comparison_cells", {
        client: "northwind",
        table: "Plans",
        cells: [
          { row: "Sync", column: "Free", value: "partial" },
          { row: "Sync", column: "Enterprise", value: "yes" },
        ],
      }),
    ).rejects.toThrow(/No column "Enterprise"/);
    const free = store.tables[0].columns[0].id;
    expect(store.tables[0].rows[0].cells[free]).toEqual({ state: "no" });
  });

  it("set_comparison_cells writes yes/no/partial/text/blank", async () => {
    await call("set_comparison_cells", {
      client: "northwind",
      table: "Plans",
      cells: [
        { row: "Sync", column: "Free", value: "£0" },
        { row: "Sync", column: "Pro", value: "none" },
      ],
    });
    const [free, pro] = store.tables[0].columns;
    expect(store.tables[0].rows[0].cells).toEqual({ [free.id]: { state: "text", text: "£0" } });
    expect(store.tables[0].rows[0].cells[pro.id]).toBeUndefined();
  });

  it("update_comparison keeps cells under columns whose titles survive a replacement", async () => {
    await call("update_comparison", { client: "northwind", table: "Plans", columns: ["Pro", "Team"] });
    const t = store.tables[0];
    expect(t.columns.map((c) => c.title)).toEqual(["Pro", "Team"]);
    expect(Object.values(t.rows[0].cells)).toEqual([{ state: "yes" }]);
  });

  it("rename and remove a column by title", async () => {
    await call("rename_comparison_column", { client: "northwind", table: "Plans", column: "Pro", title: "Premium", highlight: true });
    expect(store.tables[0].columns[1]).toMatchObject({ title: "Premium", highlight: true });
    await call("remove_comparison_column", { client: "northwind", table: "Plans", column: "Free" });
    expect(store.tables[0].columns.map((c) => c.title)).toEqual(["Premium"]);
  });

  it("get_comparison reads cells back by column title", async () => {
    const res = await call("get_comparison", { client: "northwind", table: "Plans" });
    expect(res.content[0].text).toContain('"Free": "no"');
    expect(res.content[0].text).toContain('"Pro": "yes"');
  });

  it("delete_comparison removes it", async () => {
    await call("delete_comparison", { client: "northwind", table: "Plans" });
    expect(store.tables).toHaveLength(0);
  });
});

describe("enable_wiki_section", () => {
  it("reaches the section's own toggle", async () => {
    await call("enable_wiki_section", { client: "northwind", section: "comparisons", enabled: true });
    await call("enable_wiki_section", { client: "northwind", section: "insights", enabled: false });
    expect(store.toggled).toEqual([
      ["comparisons", "client-1", true],
      ["insights", "client-1", false],
    ]);
  });

  it("refuses a section it does not know, and a caller without 'Manage clients'", async () => {
    await expect(
      call("enable_wiki_section", { client: "northwind", section: "pages", enabled: true }),
    ).rejects.toThrow();
    await expect(
      call("enable_wiki_section", { client: "northwind", section: "comparisons", enabled: true }, developer),
    ).rejects.toThrow();
    expect(store.toggled).toEqual([]);
  });
});
