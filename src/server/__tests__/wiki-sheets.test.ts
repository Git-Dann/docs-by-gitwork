/**
 * The Sheets store against an in-memory database. What this pins is the client/team split,
 * because the UI hiding a control is not a permission: every one of these is a request the
 * public route would accept and must refuse on the server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  sheetId: string;
  orderKey: number;
  cells: Record<string, unknown>;
  taskId: string | null;
  createdByKind: string;
  createdByName: string | null;
  createdByWikiUserId: string | null;
  createdByUserId: string | null;
  updatedByKind: string | null;
  updatedByName: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type Sheet = {
  id: string;
  wikiId: string;
  title: string;
  description: string | null;
  orderKey: number;
  columns: unknown;
  titleColumnId: string | null;
  clientCanEdit: boolean;
  clientCanAddRows: boolean;
  clientCanSendToBoard: boolean;
  clientNotifiedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

const db = vi.hoisted(() => ({
  sheets: [] as Sheet[],
  rows: [] as Row[],
  tasks: [] as {
    id: string;
    status: string;
    clientId: string;
    title: string;
    description: string;
    featureBlockId: string | null;
    assignees: { name: string | null; email: string }[];
    assignee?: { name: string | null; email: string } | null;
    dueDate?: Date | null;
    updatedAt?: Date;
    startedAt?: Date | null;
    completedAt?: Date | null;
    priority?: string;
    estimate?: number;
  }[],
  people: {
    team: [] as { id: string; name: string; kind: "TEAM" | "CLIENT"; email: string | null }[],
    client: [] as { id: string; name: string; kind: "TEAM" | "CLIENT"; email: string | null }[],
  },
  wikis: [] as { id: string; clientId: string; sheetsEnabled: boolean }[],
  notifications: [] as { event: string; title: string }[],
  seq: 0,
}));

const WIKIS = { "wiki-1": "client-1", "wiki-2": "client-2" } as Record<string, string>;

function matchSheet(where: Record<string, unknown>, s: Sheet): boolean {
  if (where.id && where.id !== s.id) return false;
  if (where.wikiId && where.wikiId !== s.wikiId) return false;
  const w = where.wiki as { clientId?: string } | undefined;
  if (w?.clientId && WIKIS[s.wikiId] !== w.clientId) return false;
  if ("clientNotifiedAt" in where && (where.clientNotifiedAt as Date | null)?.getTime?.() !== s.clientNotifiedAt?.getTime?.()) {
    if (!(where.clientNotifiedAt === null && s.clientNotifiedAt === null)) return false;
  }
  return true;
}
function matchRow(where: Record<string, unknown>, r: Row): boolean {
  if (typeof where.id === "string" && where.id !== r.id) return false;
  const idIn = (where.id as { in?: string[] } | undefined)?.in;
  if (idIn && !idIn.includes(r.id)) return false;
  if (where.sheetId && where.sheetId !== r.sheetId) return false;
  if ("deletedAt" in where) {
    const d = where.deletedAt as null | { not: null };
    if (d === null && r.deletedAt) return false;
    if (d && "not" in d && !r.deletedAt) return false;
  }
  if ("taskId" in where && where.taskId !== r.taskId) return false;
  return true;
}
const pick = <T extends object>(o: T, select?: Record<string, unknown>) =>
  select ? Object.fromEntries(Object.keys(select).filter((k) => k !== "rows").map((k) => [k, (o as Record<string, unknown>)[k]])) : o;

// The person directory, per side (§73.1). The real one reads members + wiki users.
vi.mock("@/server/wiki-intake-mentions", () => ({
  sheetPeopleDirectory: vi.fn(async (_key: unknown, side: "team" | "client") => db.people[side]),
}));

vi.mock("@/server/notifications", () => ({
  dispatchNotification: (input: { event: string; title: string }) => db.notifications.push(input),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    clientWiki: {
      findUnique: vi.fn(async (args: { where: { clientId?: string; id?: string }; select: Record<string, unknown> }) => {
        const wiki = db.wikis.find((w) => (args.where.clientId ? w.clientId === args.where.clientId : w.id === args.where.id));
        if (!wiki) return null;
        if (args.select.client) {
          return { client: { id: wiki.clientId, workspaceId: "ws", slug: "acme", name: "Acme" } };
        }
        const rowSelect = ((args.select.sheets as { select: { rows: { select: Record<string, unknown> } } }).select.rows.select);
        return {
          sheetsEnabled: wiki.sheetsEnabled,
          sheets: db.sheets
            .filter((s) => s.wikiId === wiki.id)
            .map((s) => ({ ...s, rows: db.rows.filter((r) => r.sheetId === s.id).map((r) => pick(r, rowSelect)) })),
        };
      }),
      upsert: vi.fn(async () => ({ id: "wiki-1", _count: { sheets: db.sheets.length } })),
    },
    wikiSheet: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        if (args.orderBy) return null;
        return db.sheets.find((s) => matchSheet(args.where, s)) ?? null;
      }),
      create: vi.fn(async (args: { data: Partial<Sheet> }) => {
        const s = { id: `sheet-${++db.seq}`, description: null, titleColumnId: null, clientNotifiedAt: null, createdAt: new Date(), updatedAt: new Date(), orderKey: 0, clientCanEdit: true, clientCanAddRows: true, clientCanSendToBoard: false, ...args.data } as Sheet;
        db.sheets.push(s);
        return { id: s.id };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<Sheet> }) => {
        const s = db.sheets.find((x) => x.id === args.where.id)!;
        Object.assign(s, args.data);
        return s;
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Partial<Sheet> }) => {
        const hits = db.sheets.filter((s) => matchSheet(args.where, s));
        hits.forEach((s) => Object.assign(s, args.data));
        return { count: hits.length };
      }),
      delete: vi.fn(async () => ({})),
    },
    wikiSheetRow: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        if (args.orderBy) return null;
        return db.rows.find((r) => matchRow(args.where, r)) ?? null;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => db.rows.find((r) => r.id === args.where.id) ?? null),
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => db.rows.filter((r) => matchRow(args.where, r))),
      count: vi.fn(async (args: { where: Record<string, unknown> }) => db.rows.filter((r) => matchRow(args.where, r)).length),
      create: vi.fn(async (args: { data: Partial<Row> }) => {
        const r = { id: `row-${++db.seq}`, taskId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), createdByWikiUserId: null, createdByUserId: null, ...args.data } as Row;
        db.rows.push(r);
        return { id: r.id };
      }),
      createMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hits = db.rows.filter((r) => matchRow(args.where, r));
        hits.forEach((r) => Object.assign(r, args.data));
        return { count: hits.length };
      }),
    },
    task: {
      // Returns ONLY the selected fields, as Prisma would — so a field the loader doesn't
      // select (priority, estimate…) can't reach the DTO through this mock either.
      findMany: vi.fn(async (args: { where: { id: { in: string[] } }; select?: Record<string, unknown> }) =>
        db.tasks
          .filter((t) => args.where.id.in.includes(t.id))
          .map((t) => {
            const full = { dueDate: null, updatedAt: new Date("2026-10-18T10:00:00Z"), startedAt: null, completedAt: null, assignee: null, ...t };
            return args.select
              ? Object.fromEntries(Object.keys(args.select).map((k) => [k, (full as Record<string, unknown>)[k]]))
              : full;
          }),
      ),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: { clientId: string; title: string; description: string; featureBlockId: string | null } }) => {
        const t = { id: `task-${++db.seq}`, status: "BACKLOG", assignees: [], ...args.data };
        db.tasks.push(t);
        return { id: t.id };
      }),
      delete: vi.fn(async () => ({})),
    },
    featureBlock: { findFirst: vi.fn(async () => null) },
    // `cells || set - clear`, as the SQL does it — the per-cell merge.
    $executeRaw: vi.fn(async (_strings: TemplateStringsArray, set: string, clear: string[], kind: string, name: string, rowId: string) => {
      const r = db.rows.find((x) => x.id === rowId)!;
      const next = { ...r.cells, ...JSON.parse(set) };
      for (const k of clear) delete next[k];
      r.cells = next;
      r.updatedByKind = kind;
      r.updatedByName = name;
      return 1;
    }),
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma };
});

import {
  clientAddRows,
  clientDeleteRows,
  clientUpdateCells,
  forPublicSheets,
  loadWikiSheets,
  reorderSheetRows,
  sendSheetRowsToBoard,
  setSheetRowHeight,
  updateSheetRowCells,
  type ClientWriter,
} from "@/server/wiki-sheets";

const COLS = [
  { id: "item", title: "Item", type: "text", clientEditable: true },
  { id: "pri", title: "Priority", type: "select", options: ["Low", "High"], clientEditable: true },
  { id: "est", title: "Estimate", type: "number", clientEditable: false },
  { id: "who", title: "Owner", type: "person", clientEditable: true },
  { id: "media", title: "Media", type: "media", clientEditable: true },
];

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: "s1",
    wikiId: "wiki-1",
    title: "Content",
    description: null,
    orderKey: 0,
    columns: COLS,
    titleColumnId: "item",
    clientCanEdit: true,
    clientCanAddRows: true,
    clientCanSendToBoard: false,
    clientNotifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}
function row(over: Partial<Row> = {}): Row {
  return {
    id: "r1",
    sheetId: "s1",
    orderKey: 1,
    cells: { item: "Pricing page", pri: "Low", est: 3 },
    taskId: null,
    createdByKind: "TEAM",
    createdByName: "Harry",
    createdByWikiUserId: null,
    createdByUserId: "u-harry",
    updatedByKind: null,
    updatedByName: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

const priya: ClientWriter = { wikiId: "wiki-1", name: "Priya", wikiUserId: "wu-priya" };
const team = { kind: "TEAM" as const, name: "Harry", userId: "u-harry" };

beforeEach(() => {
  db.sheets = [sheet(), sheet({ id: "s-other", wikiId: "wiki-2" })];
  db.rows = [row(), row({ id: "r-other", sheetId: "s-other" })];
  db.tasks = [];
  db.wikis = [
    { id: "wiki-1", clientId: "client-1", sheetsEnabled: true },
    { id: "wiki-2", clientId: "client-2", sheetsEnabled: true },
  ];
  db.notifications = [];
  db.seq = 0;
  db.people = {
    team: [
      { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM", email: "sam@gitwork.co.uk" },
      { id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT", email: "priya@acme.com" },
    ],
    client: [{ id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT", email: "priya@acme.com" }],
  };
});

describe("client cell edits", () => {
  it("lands in an editable column, merged per cell", async () => {
    await clientUpdateCells(priya, "s1", "r1", { pri: "high" });
    expect(db.rows[0].cells).toEqual({ item: "Pricing page", pri: "High", est: 3 });
    expect(db.rows[0].updatedByKind).toBe("CLIENT");
  });

  it("two people editing different cells of one row both land (no whole-row replace)", async () => {
    await clientUpdateCells(priya, "s1", "r1", { pri: "High" });
    await updateSheetRowCells("client-1", "s1", "r1", { est: 5 }, team);
    expect(db.rows[0].cells).toEqual({ item: "Pricing page", pri: "High", est: 5 });
  });

  it("is refused for a column the team locked — 403, nothing written", async () => {
    await expect(clientUpdateCells(priya, "s1", "r1", { est: 1 })).rejects.toMatchObject({ status: 403 });
    expect(db.rows[0].cells.est).toBe(3);
  });

  it("is refused on a sheet the client may not edit", async () => {
    db.sheets[0].clientCanEdit = false;
    await expect(clientUpdateCells(priya, "s1", "r1", { item: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a value its column can't hold, in words, before writing anything", async () => {
    await expect(clientUpdateCells(priya, "s1", "r1", { pri: "Urgent" })).rejects.toMatchObject({ status: 400 });
    expect(db.rows[0].cells.pri).toBe("Low");
  });

  it("refuses an unknown column rather than storing it", async () => {
    await expect(clientUpdateCells(priya, "s1", "r1", { nope: "x" })).rejects.toMatchObject({ status: 400 });
  });

  it("can't reach another client's sheet — 404, even with a real sheet id", async () => {
    await expect(clientUpdateCells(priya, "s-other", "r-other", { item: "x" })).rejects.toMatchObject({ status: 404 });
    expect(db.rows[1].cells.item).toBe("Pricing page");
  });

  it("tells the team once per sheet per 15 minutes, not once per keystroke", async () => {
    await clientUpdateCells(priya, "s1", "r1", { item: "A" });
    await clientUpdateCells(priya, "s1", "r1", { item: "B" });
    await clientUpdateCells(priya, "s1", "r1", { item: "C" });
    const edits = db.notifications.filter((n) => n.event === "wiki.sheet_client_edit");
    expect(edits).toHaveLength(1);
  });
});

describe("client structure is never theirs", () => {
  it("adding rows needs the sheet's permission", async () => {
    db.sheets[0].clientCanAddRows = false;
    await expect(clientAddRows(priya, "s1", [{ item: "New" }])).rejects.toMatchObject({ status: 403 });
  });

  it("a new row can't carry a value in a locked column", async () => {
    await expect(clientAddRows(priya, "s1", [{ item: "New", est: 9 }])).rejects.toMatchObject({ status: 403 });
    expect(db.rows).toHaveLength(2);
  });

  it("an added row is stamped with the client user's id — what 'rows you added' is checked against", async () => {
    const [id] = await clientAddRows(priya, "s1", [{ item: "New" }]);
    const created = db.rows.find((r) => r.id === id)!;
    expect(created).toMatchObject({ createdByKind: "CLIENT", createdByWikiUserId: "wu-priya", createdByUserId: null });
  });
});

describe("client row removal", () => {
  it("removes their own rows (soft — the team can restore)", async () => {
    db.rows.push(row({ id: "mine", createdByKind: "CLIENT", createdByWikiUserId: "wu-priya" }));
    await expect(clientDeleteRows(priya, "s1", ["mine"])).resolves.toBe(1);
    expect(db.rows.find((r) => r.id === "mine")!.deletedAt).toBeInstanceOf(Date);
  });

  it("refuses rows the team added, or another client user added — and removes none of the batch", async () => {
    db.rows.push(row({ id: "mine", createdByKind: "CLIENT", createdByWikiUserId: "wu-priya" }));
    db.rows.push(row({ id: "theirs", createdByKind: "CLIENT", createdByWikiUserId: "wu-tom" }));
    await expect(clientDeleteRows(priya, "s1", ["mine", "theirs"])).rejects.toMatchObject({ status: 403 });
    await expect(clientDeleteRows(priya, "s1", ["r1"])).rejects.toMatchObject({ status: 403 });
    expect(db.rows.every((r) => r.deletedAt === null)).toBe(true);
  });
});

describe("send to board", () => {
  const client = { kind: "CLIENT" as const, name: "Priya", wikiUserId: "wu-priya" };

  it("a client can't send unless the team switched it on", async () => {
    await expect(sendSheetRowsToBoard({ wikiId: "wiki-1" }, "s1", ["r1"], client)).rejects.toMatchObject({ status: 403 });
    expect(db.tasks).toHaveLength(0);
  });

  it("creates a backlog task titled from the title column and stamps the row", async () => {
    const [res] = await sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team);
    expect(res.created).toBe(true);
    expect(db.tasks[0]).toMatchObject({ title: "Pricing page", clientId: "client-1" });
    expect(db.tasks[0].description).toContain("**Priority:** Low");
    expect(db.rows[0].taskId).toBe(res.taskId);
  });

  it("is idempotent — a row with a live task never gets a second one", async () => {
    await sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team);
    const [again] = await sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team);
    expect(again.created).toBe(false);
    expect(db.tasks).toHaveLength(1);
  });

  it("a row whose task was deleted can be sent again", async () => {
    db.rows[0].taskId = "task-gone";
    const [res] = await sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team);
    expect(res.created).toBe(true);
    expect(db.rows[0].taskId).not.toBe("task-gone");
  });

  it("a client can send when allowed, and the team is told", async () => {
    db.sheets[0].clientCanSendToBoard = true;
    await sendSheetRowsToBoard({ wikiId: "wiki-1" }, "s1", ["r1"], client);
    expect(db.tasks).toHaveLength(1);
    expect(db.notifications.some((n) => n.event === "tasks.client_request")).toBe(true);
  });

  it("refuses a row with an empty title cell rather than creating an untitled task", async () => {
    db.rows[0].cells = { pri: "High" };
    await expect(sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team)).rejects.toMatchObject({ status: 400 });
    expect(db.tasks).toHaveLength(0);
  });

  it("can't send another client's rows", async () => {
    await expect(sendSheetRowsToBoard({ clientId: "client-1" }, "s-other", ["r-other"], team)).rejects.toMatchObject({ status: 404 });
  });
});

describe("reading: the stage is derived from the task, and the client's copy is cut down", () => {
  it("stage follows the board; a missing task reads REVIEWING", async () => {
    db.tasks.push({ id: "t-doing", status: "DOING", clientId: "client-1", title: "", description: "", featureBlockId: null, assignees: [{ name: "Waqar", email: "w@x" }] });
    db.rows[0].taskId = "t-doing";
    db.rows.push(row({ id: "r2", taskId: "t-missing" }));
    const section = await loadWikiSheets("client-1");
    const rows = section.sheets[0].rows;
    expect(rows.find((r) => r.id === "r1")).toMatchObject({ stage: "IN_PROGRESS", assignees: ["Waqar"] });
    expect(rows.find((r) => r.id === "r2")?.stage).toBe("REVIEWING");
  });

  it("forPublicSheets: no removed rows, no assignees, no client user ids — and nothing at all when off", async () => {
    db.tasks.push({ id: "t-doing", status: "DOING", clientId: "client-1", title: "", description: "", featureBlockId: null, assignees: [{ name: "Waqar", email: "w@x" }] });
    db.rows[0].taskId = "t-doing";
    db.rows.push(row({ id: "gone", deletedAt: new Date() }));
    db.rows.push(row({ id: "c", createdByKind: "CLIENT", createdByWikiUserId: "wu-priya" }));
    const team = await loadWikiSheets("client-1");
    const pub = forPublicSheets(team);
    const rows = pub.sheets[0].rows;
    expect(rows.map((r) => r.id)).not.toContain("gone");
    expect(rows.every((r) => r.assignees.length === 0 && r.createdByWikiUserId === null)).toBe(true);
    expect(rows.find((r) => r.id === "r1")?.stage).toBe("IN_PROGRESS");
    expect(forPublicSheets({ ...team, enabled: false })).toEqual({ enabled: false, sheets: [] });
  });
});

describe("the Board column is a live tracker (§73.1)", () => {
  it("assignees come from the join, falling back to the legacy single assignee — as tasks.ts does", async () => {
    db.tasks.push({ id: "t-join", status: "DOING", clientId: "client-1", title: "Pricing page", description: "", featureBlockId: null, assignees: [{ name: "Waqar Ali", email: "w@x" }], assignee: { name: "Legacy Lee", email: "l@x" } });
    db.tasks.push({ id: "t-legacy", status: "BACKLOG", clientId: "client-1", title: "Map", description: "", featureBlockId: null, assignees: [], assignee: { name: "Legacy Lee", email: "l@x" } });
    db.tasks.push({ id: "t-nobody", status: "BACKLOG", clientId: "client-1", title: "Blog", description: "", featureBlockId: null, assignees: [] });
    db.rows[0].taskId = "t-join";
    db.rows.push(row({ id: "r-legacy", taskId: "t-legacy" }), row({ id: "r-nobody", taskId: "t-nobody" }), row({ id: "r-gone", taskId: "t-gone" }));
    const rows = (await loadWikiSheets("client-1")).sheets[0].rows;
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by("r1").task?.assignees.map((a) => a.name)).toEqual(["Waqar Ali"]);
    expect(by("r-legacy").task?.assignees.map((a) => a.name)).toEqual(["Legacy Lee"]);
    expect(by("r-nobody").task?.assignees).toEqual([]);
    // A task that has gone: Reviewing, no task, no assignee.
    expect(by("r-gone")).toMatchObject({ stage: "REVIEWING", task: null, assignees: [] });
  });

  it("all linked tasks are read in ONE query — no N+1", async () => {
    const { prisma } = await import("@/lib/prisma");
    const findMany = prisma.task.findMany as unknown as { mock: { calls: unknown[] } };
    const before = findMany.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      db.tasks.push({ id: `t${i}`, status: "DOING", clientId: "client-1", title: "", description: "", featureBlockId: null, assignees: [] });
      db.rows.push(row({ id: `rr${i}`, taskId: `t${i}` }));
    }
    await loadWikiSheets("client-1");
    expect(findMany.mock.calls.length - before).toBe(1);
  });

  it("the client's copy: stage, first name + last initial, due date, when it moved — nothing else", async () => {
    db.tasks.push({
      id: "t-1", status: "DOING", clientId: "client-1", title: "Internal: rework pricing tables", description: "",
      featureBlockId: null, assignees: [{ name: "Waqar Ali", email: "waqar@gitwork.co.uk" }],
      dueDate: new Date("2026-11-03T00:00:00Z"), priority: "HIGH", estimate: 5,
    });
    db.rows[0].taskId = "t-1";
    const team = await loadWikiSheets("client-1");
    const pub = forPublicSheets(team).sheets[0].rows.find((r) => r.id === "r1")!;
    expect(pub.stage).toBe("IN_PROGRESS");
    expect(pub.task).toEqual({
      title: null,
      assignees: [{ name: "Waqar A.", initials: "WA" }],
      dueDate: "2026-11-03",
      updatedAt: "2026-10-18T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
    });
    const json = JSON.stringify(forPublicSheets(team));
    for (const leak of ["Internal: rework", "waqar@", "Waqar Ali", "priority", "HIGH", "estimate", "comments", "subtasks", "/app/portal"]) {
      expect(json, `"${leak}" reached the client`).not.toContain(leak);
    }
    // The team copy keeps the full name and the title.
    expect(team.sheets[0].rows.find((r) => r.id === "r1")!.task).toMatchObject({ title: "Internal: rework pricing tables", assignees: [{ name: "Waqar Ali" }] });
  });
});

describe("row order and height are the team's (§73.1)", () => {
  it("a partial order moves those rows first and keeps the rest after, in their order", async () => {
    db.rows = [row({ id: "a", orderKey: 1 }), row({ id: "b", orderKey: 2 }), row({ id: "c", orderKey: 3 }), row({ id: "x", sheetId: "s-other", orderKey: 1 })];
    const next = await reorderSheetRows("client-1", "s1", ["c", "a", "x"]);
    expect(next).toEqual(["c", "a", "b"]);
    const key = (id: string) => db.rows.find((r) => r.id === id)!.orderKey;
    expect([key("c"), key("a"), key("b")]).toEqual([1, 2, 3]);
    expect(key("x")).toBe(1); // another sheet's row was ignored, not renumbered
  });

  it("can't reorder another client's sheet", async () => {
    await expect(reorderSheetRows("client-1", "s-other", ["r-other"])).rejects.toMatchObject({ status: 404 });
  });

  it("a height is clamped to the bounds; null resets to auto; another client's row is out of reach", async () => {
    await expect(setSheetRowHeight("client-1", "s1", "r1", 5000)).resolves.toBe(300);
    expect((db.rows[0] as unknown as { height: number }).height).toBe(300);
    await expect(setSheetRowHeight("client-1", "s1", "r1", null)).resolves.toBeNull();
    await expect(setSheetRowHeight("client-1", "s-other", "r-other", 80)).rejects.toMatchObject({ status: 404 });
  });
});

describe("a picked person must be on this side's list (§73.1)", () => {
  it("a client picks someone on their list; the stored name is the directory's, not the request's", async () => {
    await clientUpdateCells(priya, "s1", "r1", { who: { id: "client:wu-priya", name: "Anyone I like", kind: "CLIENT" } });
    expect(db.rows[0].cells.who).toEqual({ id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT" });
  });

  it("a client can't inject an id that isn't on their list — not even a real team member's", async () => {
    await expect(clientUpdateCells(priya, "s1", "r1", { who: { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM" } })).rejects.toMatchObject({ status: 400 });
    await expect(clientUpdateCells(priya, "s1", "r1", { who: { id: "team:u-ceo", name: "Boss", kind: "TEAM" } })).rejects.toMatchObject({ status: 400 });
    await expect(clientAddRows(priya, "s1", [{ item: "x", who: { id: "team:u-sam", name: "Sam", kind: "TEAM" } }])).rejects.toMatchObject({ status: 400 });
    expect(db.rows[0].cells.who).toBeUndefined();
  });

  it("the team picks from the team's list; an unknown id is refused", async () => {
    await updateSheetRowCells("client-1", "s1", "r1", { who: { id: "team:u-sam", name: "S", kind: "TEAM" } }, team);
    expect(db.rows[0].cells.who).toMatchObject({ id: "team:u-sam", name: "Sam Okafor" });
    await expect(updateSheetRowCells("client-1", "s1", "r1", { who: { id: "team:u-nobody", name: "N", kind: "TEAM" } }, team)).rejects.toMatchObject({ status: 400 });
  });

  it("a plain-text person value (before the picker) is still accepted as text", async () => {
    await clientUpdateCells(priya, "s1", "r1", { who: "Tom Riley" });
    expect(db.rows[0].cells.who).toBe("Tom Riley");
  });

  it("media: a client edits an editable media column; a javascript: link is refused", async () => {
    await clientUpdateCells(priya, "s1", "r1", { media: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"] });
    expect(db.rows[0].cells.media).toEqual([{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]);
    await expect(clientUpdateCells(priya, "s1", "r1", { media: ["javascript:alert(1)"] })).rejects.toMatchObject({ status: 400 });
  });

  it("send to board puts media links in the task description", async () => {
    db.rows[0].cells = { item: "Pricing page", media: [{ url: "https://example.com/hero.png", title: "Hero" }] };
    await sendSheetRowsToBoard({ clientId: "client-1" }, "s1", ["r1"], team);
    expect(db.tasks[0].description).toContain("- [Hero](https://example.com/hero.png)");
  });
});
