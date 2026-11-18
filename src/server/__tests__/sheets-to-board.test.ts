/**
 * Moving a client's sheets onto their Board (CLAUDE.md §127), against an in-memory database:
 * the dry run writes nothing, apply is idempotent, a sent row links its dev task, another
 * client's data is never touched, and screenshots are copied once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

type Task = {
  id: string;
  workspaceId: string;
  clientId: string;
  title: string;
  status: string;
  itemType: string | null;
  productCardId: string | null;
  boardList: string | null;
  externalRef: string | null;
  metadata: unknown;
  orderKey: number;
  description?: string | null;
  boardColumnId?: string | null;
  priority?: string;
  area?: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

const db = vi.hoisted(() => ({
  clients: [] as Array<{ id: string; workspaceId: string; taskBoardColumns: unknown; wikiId: string | null }>,
  sheets: [] as Array<{ id: string; wikiId: string; title: string; columns: unknown; titleColumnId: string | null; orderKey: number; createdAt: Date }>,
  rows: [] as Array<{ id: string; sheetId: string; cells: unknown; taskId: string | null; createdByKind: string; createdByName: string | null; deletedAt: Date | null; orderKey: number; createdAt: Date }>,
  tasks: [] as Task[],
  attachments: [] as Array<{ id: string; taskId: string; filename: string | null }>,
  audit: [] as unknown[],
  writes: 0,
  locked: false,
}));

function matches(t: Task, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const val = (t as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("in" in o && !(o.in as unknown[]).includes(val)) return false;
      if ("startsWith" in o && !(typeof val === "string" && val.startsWith(o.startsWith as string))) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}

vi.mock("@/server/audit-log", () => ({ recordAuditEntry: async (x: unknown) => void db.audit.push(x) }));

vi.mock("@/lib/prisma", () => {
  let n = 0;
  const client = {
    workspaceClient: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const c = db.clients.find((x) => x.id === where.id && (where.workspaceId === undefined || x.workspaceId === where.workspaceId));
        return c ? { id: c.id, taskBoardColumns: c.taskBoardColumns, wiki: c.wikiId ? { id: c.wikiId } : null } : null;
      },
    },
    wikiSheet: {
      findMany: async ({ where }: { where: { wikiId: string } }) =>
        db.sheets
          .filter((s) => s.wikiId === where.wikiId)
          .map((s) => ({
            ...s,
            rows: db.rows.filter((r) => r.sheetId === s.id && !r.deletedAt).sort((a, b) => a.orderKey - b.orderKey),
          })),
    },
    wikiSheetRow: {
      findMany: async ({ where }: { where: { id: { in: string[] }; sheet: { wikiId: string } } }) =>
        db.rows
          .filter((r) => where.id.in.includes(r.id) && db.sheets.find((s) => s.id === r.sheetId)?.wikiId === where.sheet.wikiId)
          .map((r) => ({ id: r.id, cells: r.cells, sheet: { columns: db.sheets.find((s) => s.id === r.sheetId)!.columns } })),
    },
    task: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.tasks.filter((t) => matches(t, where)).map((t) => ({ ...t })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => db.tasks.find((t) => matches(t, where)) ?? null,
      groupBy: async () => [],
      create: async ({ data }: { data: Partial<Task> }) => {
        db.writes++;
        const t = { id: `card${++n}`, productCardId: null, ...data } as Task;
        db.tasks.push(t);
        return { id: t.id };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Task> }) => {
        const hit = db.tasks.filter((t) => matches(t, where));
        for (const t of hit) Object.assign(t, data);
        db.writes += hit.length;
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Task> }) => {
        const t = db.tasks.find((x) => x.id === where.id)!;
        Object.assign(t, data);
        return t;
      },
    },
    taskAttachment: {
      create: async ({ data }: { data: { taskId: string; filename: string | null } }) => {
        const a = { id: `att${db.attachments.length + 1}`, taskId: data.taskId, filename: data.filename };
        db.attachments.push(a);
        return { id: a.id };
      },
    },
    $queryRaw: async () => [{ locked: !db.locked }],
    $executeRaw: async () => 1,
  };
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } };
});

import { applySheetsToBoard, planSheetsToBoard, SheetsToBoardError } from "../sheets-to-board";

const KEY = "b".repeat(40);
const OTHER_KEY = "c".repeat(40);
let png: Buffer;

const COLUMNS = [
  { id: "c1", title: "Issue", type: "text", clientEditable: true },
  { id: "c2", title: "Priority", type: "select", options: ["High", "Low"], clientEditable: true },
  { id: "c3", title: "Screenshots", type: "media", clientEditable: true },
];

beforeEach(async () => {
  png ??= await sharp({ create: { width: 8, height: 8, channels: 3, background: "#224466" } }).png().toBuffer();
  db.clients = [
    { id: "wedge", workspaceId: "ws", taskBoardColumns: [{ id: "live", name: "Live Features", stage: "DONE", isDefault: true }], wikiId: "wiki-w" },
    { id: "other", workspaceId: "ws", taskBoardColumns: [], wikiId: "wiki-o" },
  ];
  db.sheets = [{ id: "s1", wikiId: "wiki-w", title: "QA review", columns: COLUMNS, titleColumnId: "c1", orderKey: 0, createdAt: new Date() }];
  db.rows = [
    { id: "r1", sheetId: "s1", cells: { c1: "Duplicate grab handles", c2: "High", c3: [{ url: `/api/wiki/files/${KEY}/a.png` }] }, taskId: "dev1", createdByKind: "TEAM", createdByName: "Dan", deletedAt: null, orderKey: 1, createdAt: new Date() },
    { id: "r2", sheetId: "s1", cells: { c1: "Wrong club suggested", c3: [{ url: `/api/wiki/files/${OTHER_KEY}/b.png` }] }, taskId: "foreign", createdByKind: "CLIENT", createdByName: "Luke", deletedAt: null, orderKey: 2, createdAt: new Date() },
    { id: "r3", sheetId: "s1", cells: { c1: "Removed row" }, taskId: null, createdByKind: "TEAM", createdByName: null, deletedAt: new Date(), orderKey: 3, createdAt: new Date() },
  ];
  db.tasks = [
    { id: "dev1", workspaceId: "ws", clientId: "wedge", title: "Fix handles", status: "DONE", itemType: null, productCardId: null, boardList: null, externalRef: null, metadata: null, orderKey: 1, startedAt: new Date("2026-10-21"), completedAt: new Date("2026-10-23") },
    // Another client's task, which a row on Wedge's sheet points at.
    { id: "foreign", workspaceId: "ws", clientId: "other", title: "Theirs", status: "DOING", itemType: null, productCardId: null, boardList: null, externalRef: null, metadata: null, orderKey: 1, startedAt: null, completedAt: null },
  ];
  db.attachments = [];
  db.audit = [];
  db.writes = 0;
  db.locked = false;
});

const readFile = vi.fn(async (key: string) =>
  key === KEY
    ? { bytes: png, mime: "image/png", filename: "a.png", wikiId: "wiki-w" }
    : { bytes: png, mime: "image/png", filename: "b.png", wikiId: "wiki-someone-else" },
);

describe("moving sheets onto the board", () => {
  it("the dry run writes nothing", async () => {
    const plan = await planSheetsToBoard({ workspaceId: "ws", clientId: "wedge" });
    expect(plan.counts).toMatchObject({ rows: 2, create: 2, linkDevTask: 1 });
    expect(db.writes).toBe(0);
    expect(db.tasks).toHaveLength(2);
  });

  it("apply makes a card per live row, in a list, linking the dev task a row was sent to", async () => {
    const r = await applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: "u1" }, { readFile });
    expect(r).toMatchObject({ created: 2, devLinked: 1, skipped: 0 });
    const cards = db.tasks.filter((t) => t.externalRef?.startsWith("sheet-row:"));
    expect(cards.map((c) => [c.externalRef, c.title, c.status, c.boardList, c.itemType])).toEqual([
      ["sheet-row:r1", "Duplicate grab handles", "DONE", "QA review", "bug"],
      ["sheet-row:r2", "Wrong club suggested", "BACKLOG", "QA review", "bug"],
    ]);
    expect(db.tasks.find((t) => t.id === "dev1")!.productCardId).toBe(cards[0].id);
    expect(cards[0].priority).toBe("HIGH");
    expect(db.audit).toHaveLength(1);
  });

  it("⚠️ another client's task is never linked or read, even when a row points at it", async () => {
    await applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: "u1" }, { readFile });
    const foreign = db.tasks.find((t) => t.id === "foreign")!;
    expect(foreign.productCardId).toBeNull();
    const card = db.tasks.find((t) => t.externalRef === "sheet-row:r2")!;
    expect(card.status).toBe("BACKLOG");
  });

  it("⚠️ a client outside the caller's workspace is a 404", async () => {
    await expect(planSheetsToBoard({ workspaceId: "another-business", clientId: "wedge" })).rejects.toBeInstanceOf(SheetsToBoardError);
    await expect(applySheetsToBoard({ workspaceId: "another-business", clientId: "wedge", actorId: null })).rejects.toMatchObject({ status: 404 });
    expect(db.writes).toBe(0);
  });

  it("is idempotent: a second apply creates nothing and copies nothing again", async () => {
    await applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: "u1" }, { readFile });
    const tasksAfterFirst = db.tasks.length;
    const attachmentsAfterFirst = db.attachments.length;
    const again = await applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: "u1" }, { readFile });
    expect(again).toMatchObject({ created: 0, devLinked: 0, skipped: 2, imagesCopied: 0 });
    expect(db.tasks).toHaveLength(tasksAfterFirst);
    expect(db.attachments).toHaveLength(attachmentsAfterFirst);
  });

  it("copies this client's uploaded screenshots onto the card, and refuses another wiki's file", async () => {
    const r = await applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: "u1" }, { readFile });
    expect(r.imagesCopied).toBe(1);
    expect(db.attachments.map((a) => a.filename)).toEqual(["a.png"]);
    expect(r.imagesFailed).toEqual([{ rowId: "r2", key: OTHER_KEY, reason: "it was uploaded to a different client's wiki" }]);
    const card = db.tasks.find((t) => t.externalRef === "sheet-row:r1")!;
    expect((card.metadata as { sheet: { images: Record<string, string> } }).sheet.images[KEY]).toBe("att1");
  });

  it("a second apply while one is running is refused", async () => {
    db.locked = true;
    await expect(applySheetsToBoard({ workspaceId: "ws", clientId: "wedge", actorId: null })).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toBe(0);
  });
});
