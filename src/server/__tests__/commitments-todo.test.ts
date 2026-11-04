import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const state = {
    row: null as null | Record<string, unknown>,
    lists: [] as Array<{ id: string; userId: string; archivedAt: Date | null }>,
    owned: 0,
    creates: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    updateManys: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    transactions: 0,
  };
  const stamp = (r: Record<string, unknown>) => ({
    id: "new",
    notes: null,
    dueAt: null,
    counterpart: null,
    quote: null,
    evidenceLabel: null,
    evidenceUrl: null,
    evidenceAt: null,
    reason: null,
    snoozedUntil: null,
    doneAt: null,
    listId: null,
    tags: [],
    priority: 0,
    startAt: null,
    evening: false,
    someday: false,
    remindAt: null,
    recurrence: null,
    checklist: null,
    orderKey: 0,
    state: "open",
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...r,
  });
  const prisma = {
    commitment: {
      findFirst: async () => state.row,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.creates.push(data);
        return stamp(data);
      },
      update: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        state.updates.push({ where, data });
        return stamp({ ...state.row, ...data });
      },
      updateMany: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        state.updateManys.push({ where, data });
        return { count: 1 };
      },
      count: async () => state.owned,
    },
    commitmentList: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        state.lists.find((l) => l.id === where.id && l.userId === where.userId && !l.archivedAt) ?? null,
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      state.transactions += 1;
      return Promise.all(ops);
    },
  };
  return { state, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/auth", () => ({ auth: async () => null }));

import { createCommitment, reorderCommitments, updateCommitment } from "@/server/commitments";
import type { EffectiveUser } from "@/server/auth/effective-user";

const me = { id: "u1", workspaceId: "w1" } as EffectiveUser;

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    workspaceId: "w1",
    userId: "u1",
    title: "Send the report",
    notes: "Monthly",
    dueAt: new Date("2026-11-06T17:00:00Z"),
    state: "open",
    source: "manual",
    externalId: null,
    counterpart: null,
    quote: null,
    evidenceLabel: null,
    evidenceUrl: null,
    evidenceAt: null,
    reason: null,
    snoozedUntil: null,
    doneAt: null,
    listId: "L1",
    tags: ["work"],
    priority: 2,
    startAt: null,
    evening: true,
    someday: false,
    remindAt: null,
    recurrence: "monthly",
    checklist: [{ id: "a", text: "Draft", done: true }],
    orderKey: 3,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  db.state.row = baseRow();
  db.state.lists = [{ id: "L1", userId: "u1", archivedAt: null }];
  db.state.owned = 0;
  db.state.creates = [];
  db.state.updates = [];
  db.state.updateManys = [];
  db.state.transactions = 0;
});

describe("completing a repeating to-do", () => {
  it("creates exactly one next occurrence, in one transaction, and stops the done one repeating", async () => {
    const res = await updateCommitment(me, "c1", { state: "done" });
    expect(db.state.transactions).toBe(1);
    expect(db.state.creates).toHaveLength(1);
    const next = db.state.creates[0];
    expect(next).toMatchObject({
      workspaceId: "w1",
      userId: "u1",
      title: "Send the report",
      notes: "Monthly",
      listId: "L1",
      tags: ["work"],
      priority: 2,
      evening: true,
      recurrence: "monthly",
      state: "open",
      checklist: [{ id: "a", text: "Draft", done: false }],
    });
    expect((next.dueAt as Date).toISOString()).toBe("2026-12-06T17:00:00.000Z");
    expect(db.state.updates[0].data).toMatchObject({ state: "done", recurrence: null });
    expect(res.next).not.toBeNull();
    expect(res.commitment.recurrence).toBeNull();
  });

  it("makes nothing for a to-do that doesn't repeat, or one already done", async () => {
    db.state.row = baseRow({ recurrence: null });
    expect((await updateCommitment(me, "c1", { state: "done" })).next).toBeNull();
    db.state.row = baseRow({ state: "done" });
    expect((await updateCommitment(me, "c1", { state: "done" })).next).toBeNull();
    db.state.row = baseRow();
    expect((await updateCommitment(me, "c1", { title: "Renamed" })).next).toBeNull();
    expect(db.state.creates).toHaveLength(0);
  });

  it("uses a repeat set in the same request", async () => {
    db.state.row = baseRow({ recurrence: null, dueAt: new Date("2026-11-06T17:00:00Z") });
    await updateCommitment(me, "c1", { state: "done", recurrence: "weekly" });
    expect(db.state.creates).toHaveLength(1);
    expect((db.state.creates[0].dueAt as Date).toISOString()).toBe("2026-11-13T17:00:00.000Z");
  });
});

describe("writes validate the to-do fields", () => {
  it("rejects a junk repeat rule with a sentence", async () => {
    await expect(updateCommitment(me, "c1", { recurrence: "every:2:fortnight" })).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a list that isn't the caller's", async () => {
    db.state.lists.push({ id: "L2", userId: "someone-else", archivedAt: null });
    await expect(createCommitment(me, { title: "x", listId: "L2" })).rejects.toThrow(/isn't one of yours/);
    await expect(createCommitment(me, { title: "x", listId: "L1" })).resolves.toMatchObject({ listId: "L1" });
  });

  it("someday clears the start date and evening", async () => {
    db.state.row = baseRow({ startAt: new Date("2026-11-05T00:00:00Z"), evening: true });
    await updateCommitment(me, "c1", { someday: true });
    expect(db.state.updates[0].data).toMatchObject({ someday: true, startAt: null, evening: false });
  });

  it("normalises tags on create", async () => {
    const dto = await createCommitment(me, { title: "x", tags: ["#Work", "work", "Home"] });
    expect(dto.tags).toEqual(["work", "home"]);
  });
});

describe("reorderCommitments", () => {
  it("sets orderKey to each id's position in one transaction", async () => {
    db.state.owned = 3;
    await reorderCommitments(me, ["c", "a", "b"]);
    expect(db.state.transactions).toBe(1);
    expect(db.state.updateManys.map((u) => [(u.where as { id: string }).id, u.data.orderKey])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("refuses ids that aren't all the caller's, and duplicates", async () => {
    db.state.owned = 1;
    await expect(reorderCommitments(me, ["a", "b"])).rejects.toMatchObject({ status: 404 });
    await expect(reorderCommitments(me, ["a", "a"])).rejects.toMatchObject({ status: 400 });
    expect(db.state.updateManys).toHaveLength(0);
  });
});
