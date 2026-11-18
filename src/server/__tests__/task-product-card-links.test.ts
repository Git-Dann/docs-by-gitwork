/**
 * A dev task can only deliver a real product card on its own client, one level deep
 * (CLAUDE.md §124). Every refusal writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; workspaceId: string; clientId: string; itemType: string | null; productCardId: string | null };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  task: { clientId: "c1", status: "TODO", startedAt: null, assigneeId: null, assignees: [] as { id: string }[], itemType: null as string | null, productCardId: null as string | null },
  linkedCount: 0,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: vi.fn(async () => ({ id: "c" })) },
    task: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = db.rows.find((r) => r.id === where.id && r.workspaceId === where.workspaceId);
        // updateTask's own load (the task being edited) vs assertCardLink's card lookup.
        return where.id === "dev" ? db.task : (row ?? null);
      }),
      count: vi.fn(async () => db.linkedCount),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.updates.push(data);
        throw new Error("stop after update");
      }),
    },
  },
}));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn(async () => ({})) }));
vi.mock("@/server/client-assignments", () => ({ placementClientIds: vi.fn(async () => []) }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  canSeeAllClients: () => true,
}));

import { updateTask } from "../tasks";

const admin = { id: "u1", workspaceId: "w1", role: "SUPER_ADMIN", permissions: [] } as never;

beforeEach(() => {
  db.updates = [];
  db.linkedCount = 0;
  db.task = { ...db.task, clientId: "c1", itemType: null, productCardId: null };
  db.rows = [
    { id: "card", workspaceId: "w1", clientId: "c1", itemType: "feature", productCardId: null },
    { id: "plain", workspaceId: "w1", clientId: "c1", itemType: null, productCardId: null },
    { id: "elsewhere", workspaceId: "w1", clientId: "c2", itemType: "feature", productCardId: null },
    { id: "chained", workspaceId: "w1", clientId: "c1", itemType: "feature", productCardId: "card" },
    { id: "other-ws", workspaceId: "w2", clientId: "c1", itemType: "feature", productCardId: null },
  ];
});

describe("linking a dev task to a product card", () => {
  it("links a dev task to a card on its own client", async () => {
    await expect(updateTask(admin, "dev", { productCardId: "card" })).rejects.toThrow("stop after update");
    expect(db.updates[0]).toMatchObject({ productCardId: "card" });
  });

  it.each([
    ["a card on another client", "elsewhere", /same client/],
    ["a plain task", "plain", /product card/],
    ["a card that is itself linked", "chained", /itself linked/],
    ["a card in another business", "other-ws", /doesn't exist/],
    ["itself", "dev", /deliver itself|doesn't exist|product card/],
  ])("refuses %s, and writes nothing", async (_label, id, msg) => {
    await expect(updateTask(admin, "dev", { productCardId: id })).rejects.toThrow(msg);
    expect(db.updates).toEqual([]);
  });

  it("a card can't deliver another card", async () => {
    db.task = { ...db.task, itemType: "bug" };
    await expect(updateTask(admin, "dev", { productCardId: "card" })).rejects.toThrow(/can't deliver another card/);
    expect(db.updates).toEqual([]);
  });

  it("won't take the type off a card while dev tasks still deliver it", async () => {
    db.task = { ...db.task, itemType: "feature" };
    db.linkedCount = 2;
    await expect(updateTask(admin, "dev", { itemType: null })).rejects.toThrow(/2 dev tasks deliver this card/);
    expect(db.updates).toEqual([]);
  });

  it("empty unlinks", async () => {
    db.task = { ...db.task, productCardId: "card" };
    await expect(updateTask(admin, "dev", { productCardId: "" })).rejects.toThrow("stop after update");
    expect(db.updates[0]).toMatchObject({ productCardId: null });
  });
});
