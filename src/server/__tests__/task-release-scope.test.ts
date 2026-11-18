/**
 * A task can only be put in a release that belongs to its own client. A release id from
 * another client (or another business) is refused, never connected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  releases: [{ id: "rel-a", workspaceId: "w1", clientId: "c1" }],
  task: { clientId: "c1", status: "TODO", startedAt: null, assigneeId: null, assignees: [] as { id: string }[] },
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: vi.fn(async () => ({ id: "c" })) },
    clientRelease: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string; clientId: string } }) =>
        db.releases.find((r) => r.id === where.id && r.workspaceId === where.workspaceId && r.clientId === where.clientId) ?? null,
      ),
    },
    task: {
      findFirst: vi.fn(async () => db.task),
      findMany: vi.fn(async () => [{ id: "t1", clientId: "c1", status: "TODO", startedAt: null }, { id: "t2", clientId: "c2", status: "TODO", startedAt: null }]),
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

import { batchUpdateTasks, updateTask } from "../tasks";

const admin = { id: "u1", workspaceId: "w1", role: "SUPER_ADMIN", permissions: [] } as never;

beforeEach(() => {
  db.updates = [];
});

describe("a task's release", () => {
  it("connects a release on the task's own client", async () => {
    await expect(updateTask(admin, "t1", { releaseId: "rel-a" })).rejects.toThrow("stop after update");
    expect(db.updates[0]).toMatchObject({ release: { connect: { id: "rel-a" } } });
  });

  it("refuses a release from another client, and writes nothing", async () => {
    db.task = { ...db.task, clientId: "c2" };
    await expect(updateTask(admin, "t1", { releaseId: "rel-a" })).rejects.toThrow(/release isn't on this client/);
    expect(db.updates).toEqual([]);
    db.task = { ...db.task, clientId: "c1" };
  });

  it("an empty release takes the task out of its release", async () => {
    await expect(updateTask(admin, "t1", { releaseId: null })).rejects.toThrow("stop after update");
    expect(db.updates[0]).toMatchObject({ release: { disconnect: true } });
  });

  it("won't put tasks from two clients into one release", async () => {
    await expect(batchUpdateTasks(admin, ["t1", "t2"], { releaseId: "rel-a" })).rejects.toThrow(/multiple clients/);
    expect(db.updates).toEqual([]);
  });
});
