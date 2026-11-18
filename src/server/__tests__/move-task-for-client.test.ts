/**
 * A client's drag on their Board (src/server/tasks.ts `moveTaskForClient`) lands only while the
 * card is still where the board saw it. If the team marks it Done or archives it between the
 * client reading the board and the write, the drag changes nothing — it must never reopen a card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: null as null | { status: string; startedAt: Date | null; clientId: string; archivedAt: Date | null },
  updateWhere: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: vi.fn(async ({ where }: { where: { clientId: string; archivedAt: null } }) =>
        db.row && db.row.clientId === where.clientId && db.row.archivedAt === null
          ? { status: db.row.status, startedAt: db.row.startedAt }
          : null,
      ),
      // Honours the guard the way Postgres would: count 0 unless every condition holds.
      updateMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        db.updateWhere = where;
        const status = where.status as { equals: string; not: string };
        const ok =
          db.row !== null &&
          db.row.clientId === where.clientId &&
          db.row.archivedAt === null &&
          db.row.status === status.equals &&
          db.row.status !== status.not;
        return { count: ok ? 1 : 0 };
      }),
      findUnique: vi.fn(async () => ({ id: "t1", title: "Card", workspaceId: "ws", clientId: "c1", client: { slug: "wedge" }, assignees: [] })),
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

import { prisma } from "@/lib/prisma";
import { moveTaskForClient } from "../tasks";

const move = (fromStatus: string, status = "TODO") =>
  moveTaskForClient("t1", {
    status: status as never,
    orderKey: 1,
    boardColumnId: null,
    movedBy: "Luke",
    expect: { clientId: "c1", fromStatus: fromStatus as never },
  });

beforeEach(() => {
  db.row = { status: "BACKLOG", startedAt: null, clientId: "c1", archivedAt: null };
  db.updateWhere = null;
});

describe("a client's move is a compare-and-set", () => {
  it("lands when the card is still where the board saw it", async () => {
    expect(await move("BACKLOG")).toBe(true);
    expect(db.updateWhere).toMatchObject({ id: "t1", clientId: "c1", archivedAt: null, status: { equals: "BACKLOG", not: "DONE" } });
  });

  it("changes nothing if the team marked it Done in between", async () => {
    db.row!.status = "DONE";
    expect(await move("BACKLOG")).toBe(false);
  });

  it("the write itself refuses when it went Done between the read and the write", async () => {
    // The read still sees Backlog; by the time the update runs, the team has marked it Done.
    vi.mocked(prisma.task.findFirst).mockResolvedValueOnce({ status: "BACKLOG", startedAt: null } as never);
    db.row!.status = "DONE";
    expect(await move("BACKLOG")).toBe(false);
    expect(db.updateWhere).not.toBeNull();
  });

  it("changes nothing if the team archived it in between", async () => {
    db.row!.archivedAt = new Date();
    expect(await move("BACKLOG")).toBe(false);
  });

  it("changes nothing if it moved somewhere else in between", async () => {
    db.row!.status = "DOING";
    expect(await move("BACKLOG")).toBe(false);
  });

  it("never moves into or out of Done, whatever the caller checked", async () => {
    expect(await move("BACKLOG", "DONE")).toBe(false);
    db.row!.status = "DONE";
    expect(await move("DONE", "TODO")).toBe(false);
    expect(db.updateWhere).toBeNull();
  });

  it("a card on another client never matches", async () => {
    db.row!.clientId = "c2";
    expect(await move("BACKLOG")).toBe(false);
  });
});
