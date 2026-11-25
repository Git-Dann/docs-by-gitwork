/**
 * Confirming a proposal re-checks everything against the database as it is now.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectiveUser } from "@/server/auth/effective-user";

const actionRow = vi.fn();
const taskRow = vi.fn();
const createTask = vi.fn(async (_u: unknown, input: { title: string }) => ({ id: `new-${input.title}` }));
const updateTask = vi.fn(async () => ({}));
const addTaskComment = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dispatchAction: {
      findFirst: (args: unknown) => actionRow(args),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    task: { findFirst: () => taskRow() },
  },
}));
vi.mock("@/server/tasks", () => ({
  createTask: (u: unknown, i: { title: string }) => createTask(u, i),
  updateTask: (...a: unknown[]) => updateTask(...(a as [])),
  addTaskComment: (...a: unknown[]) => addTaskComment(...(a as [])),
}));
vi.mock("../scope", () => ({
  openScope: vi.fn(async (_u: unknown, c: { id: string }) => ({ client: { id: c.id, name: "Wedge", slug: "wedge" } })),
}));

const { decideAction } = await import("../actions");

const me = { id: "me", name: "Nasir", workspaceId: "ws1", role: "DEVELOPER", permissions: [] } as unknown as EffectiveUser;

function pending(kind: string, payload: object) {
  actionRow.mockResolvedValueOnce({ id: "a1", userId: "me", workspaceId: "ws1", clientId: "c1", kind, payload, status: "pending" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decideAction", () => {
  it("only the person it was proposed for can confirm it", async () => {
    actionRow.mockResolvedValueOnce(null);
    await expect(decideAction(me, "someone-elses", "confirm")).rejects.toThrow(/isn't yours/);
    expect(actionRow.mock.calls[0][0]).toMatchObject({ where: { userId: "me", workspaceId: "ws1" } });
  });

  it("creates new tasks for the asker or nobody, whatever the stored payload says", async () => {
    pending("create_tasks", { tasks: [{ title: "A", assigneeIds: ["me"] }, { title: "B", assigneeIds: ["ali"] }, { title: "C" }] });
    const res = await decideAction(me, "a1", "confirm");
    expect(res.status).toBe("done");
    const given = createTask.mock.calls.map((c) => (c[1] as unknown as { assigneeIds: string[] }).assigneeIds);
    expect(given).toEqual([["me"], [], []]);
  });

  it("refuses to change a task that someone else has taken since it was proposed", async () => {
    pending("update_task", { taskId: "t1", status: "DONE" });
    taskRow.mockResolvedValueOnce({ clientId: "c1", assigneeId: null, assignees: [{ id: "ali" }] });
    const res = await decideAction(me, "a1", "confirm");
    expect(res.status).toBe("failed");
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("refuses a task that has moved to another client", async () => {
    pending("comment", { taskId: "t1", body: "dup of client report" });
    taskRow.mockResolvedValueOnce({ clientId: "other", assigneeId: null, assignees: [] });
    const res = await decideAction(me, "a1", "confirm");
    expect(res.status).toBe("failed");
    expect(addTaskComment).not.toHaveBeenCalled();
  });

  it("only takes a task for the asker when nobody owns it", async () => {
    pending("update_task", { taskId: "t1", takeIt: true });
    taskRow.mockResolvedValueOnce({ clientId: "c1", assigneeId: null, assignees: [] });
    await decideAction(me, "a1", "confirm");
    expect(updateTask.mock.calls[0]).toEqual([me, "t1", { assigneeIds: ["me"] }]);
  });

  it("cancelling changes nothing", async () => {
    pending("create_tasks", { tasks: [{ title: "A" }] });
    const res = await decideAction(me, "a1", "cancel");
    expect(res.status).toBe("cancelled");
    expect(createTask).not.toHaveBeenCalled();
  });
});
