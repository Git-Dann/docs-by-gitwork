/**
 * Key-date writes on the Board Schedule (src/server/wiki-board-key-dates.ts): scoped to the
 * writer's client, a client's writes counted against a per-wiki quota, deletes soft, and the
 * planning-tool import idempotent.
 *
 * Prisma is an in-memory fake that honours the `where` it is given, so "another client's key date
 * is a 404" is checked against the real query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ keyDates: [] as Row[], hits: [] as Row[], locks: [] as string[] }));

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const cond = v as Row;
      if ("not" in cond) return (row[k] ?? null) !== cond.not;
      if ("gte" in cond) return (row[k] as Date) >= (cond.gte as Date);
      return true;
    }
    return (row[k] ?? null) === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    workspaceClient: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => (where.id === "client-a" ? { workspaceId: "ws" } : where.id === "client-b" ? { workspaceId: "ws" } : null)),
    },
    wikiBoardKeyDate: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `kd-${db.keyDates.length + 1}`, archivedAt: null, externalRef: null, note: null, ...data };
        db.keyDates.push(row);
        return row;
      }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        for (const d of data) db.keyDates.push({ id: `kd-${db.keyDates.length + 1}`, archivedAt: null, note: null, ...d });
        return { count: data.length };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = db.keyDates.filter((r) => matches(r, where));
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Row }) => {
        const r = db.keyDates.find((x) => matches(x, where));
        if (!r) throw new Error("not found");
        return r;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) => db.keyDates.filter((r) => matches(r, where))),
    },
    rateLimitHit: {
      count: vi.fn(async ({ where }: { where: Row }) => db.hits.filter((h) => matches(h, where)).length),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        for (const d of data) db.hits.push({ createdAt: new Date(), ...d });
        return { count: data.length };
      }),
    },
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.locks.push(String(values[0]));
      return 1;
    }),
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/tasks", () => ({ moveTaskForClient: vi.fn(), assertClientInScope: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

import { createKeyDate, deleteKeyDate, updateKeyDate } from "../wiki-board-key-dates";
import { syncForgeKeyDates } from "../wiki-board-key-date-import";
import type { BoardWriter } from "../wiki-board";
import { prisma } from "@/lib/prisma";

const clientA: BoardWriter = { wikiId: "wiki-a", clientId: "client-a", clientSlug: "a", name: "Luke M.", wikiUserId: "wu-1", userId: null };
const teamA: BoardWriter = { ...clientA, name: "Dan", wikiUserId: null, userId: "u-dan" };
const clientB: BoardWriter = { wikiId: "wiki-b", clientId: "client-b", clientSlug: "b", name: "Bea", wikiUserId: "wu-2", userId: null };

beforeEach(() => {
  db.keyDates = [];
  db.hits = [];
  db.locks = [];
});

describe("adding", () => {
  it("adds to the writer's own client, under the board lock, and counts it for a client", async () => {
    const k = await createKeyDate(clientA, { title: " Million Pound Drop ", date: "2026-08-17", note: "" });
    expect(k).toEqual({ id: "kd-1", title: "Million Pound Drop", date: "2026-08-17", note: null, imported: false });
    expect(db.keyDates[0]).toMatchObject({ clientId: "client-a", workspaceId: "ws", createdByName: "Luke M.", createdById: null });
    expect(db.locks).toEqual(["board-write:wiki-a"]);
    expect(db.hits.map((h) => h.bucket)).toEqual(["board:keyDate:wiki-a"]);
  });

  it("the team isn't counted against the client's quota", async () => {
    await createKeyDate(teamA, { title: "Launch", date: "2026-12-01" });
    expect(db.hits).toEqual([]);
    expect(db.keyDates[0]).toMatchObject({ createdById: "u-dan" });
  });

  it("past the hourly limit a client gets a 429 and nothing is added", async () => {
    for (let i = 0; i < 60; i++) db.hits.push({ bucket: "board:keyDate:wiki-a", createdAt: new Date() });
    await expect(createKeyDate(clientA, { title: "One more", date: "2026-12-01" })).rejects.toMatchObject({ status: 429 });
    expect(db.keyDates).toEqual([]);
  });
});

describe("editing and deleting", () => {
  beforeEach(async () => {
    await createKeyDate(teamA, { title: "Mini Major", date: "2026-06-25" });
  });

  it("edits a key date on the writer's client", async () => {
    const k = await updateKeyDate(clientA, "kd-1", { date: "2026-06-26" });
    expect(k.date).toBe("2026-06-26");
  });

  it("another client's key date is a 404, and isn't touched", async () => {
    await expect(updateKeyDate(clientB, "kd-1", { title: "Hijacked" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteKeyDate(clientB, "kd-1")).rejects.toMatchObject({ status: 404 });
    expect(db.keyDates[0]).toMatchObject({ title: "Mini Major", archivedAt: null });
  });

  it("delete is soft, and a deleted date can't be edited", async () => {
    await deleteKeyDate(clientA, "kd-1");
    expect(db.keyDates[0].archivedAt).toBeInstanceOf(Date);
    await expect(updateKeyDate(clientA, "kd-1", { title: "Back" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("importing the planning tool's dates", () => {
  const dates = [
    { id: "469", title: "Mini Major", date: "2026-06-25" },
    { id: "474", title: "Million Pound Drop", date: "2026-08-17" },
  ];

  it("is idempotent, and never brings back a date deleted in Foundry", async () => {
    const first = await syncForgeKeyDates(prisma as never, "ws", "client-a", dates);
    expect(first.created).toBe(2);
    expect(db.keyDates.map((k) => k.externalRef)).toEqual(["forge-date:469", "forge-date:474"]);
    db.keyDates[0].archivedAt = new Date();
    const second = await syncForgeKeyDates(prisma as never, "ws", "client-a", dates);
    expect(second.created).toBe(0);
    expect(db.keyDates).toHaveLength(2);
  });

  it("another client's imported dates don't count as this client's", async () => {
    await syncForgeKeyDates(prisma as never, "ws", "client-b", dates);
    const forA = await syncForgeKeyDates(prisma as never, "ws", "client-a", dates);
    expect(forA.created).toBe(2);
  });
});
