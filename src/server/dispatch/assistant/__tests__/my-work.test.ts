import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dan, 25 Nov 2026: someone with nothing assigned is told so, with how many tasks have no owner;
 * and tasks are named by their titles, never "#9V4XH4".
 */

const listTasks = vi.hoisted(() => vi.fn());
vi.mock("@/server/tasks", () => ({ listTasks }));
vi.mock("../scope", () => ({ assertStillAllowed: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { runTool } = await import("../tools");

const scope = {
  user: { id: "syed", name: "Syed", email: "s@x.test", role: "ADMIN", permissions: [], workspaceId: "ws", membershipId: "m" },
  client: { id: "c1", name: "Campfire", slug: "campfire" },
  surface: "web",
  canSeeMoney: false,
  isAdmin: true,
  documentTypes: [],
} as unknown as Parameters<typeof runTool>[0];

const task = (over: Record<string, unknown>) => ({
  id: "cmw0scw9801k1mm014c9v4xh4",
  title: "Email deliverability both ways",
  status: "DOING",
  assignees: [{ id: "syed", name: "Syed" }],
  dueDate: null,
  release: null,
  featureBlock: null,
  blockedReason: null,
  flag: null,
  startedAt: null,
  ...over,
});

describe("my_work", () => {
  beforeEach(() => listTasks.mockReset());

  it("says plainly when nothing is assigned, with the number of unassigned tasks", async () => {
    listTasks.mockImplementation(async (...args: unknown[]) => {
      const opts = (args[1] ?? {}) as { assigneeId?: string; unassignedOnly?: boolean };
      return opts.assigneeId ? [] : opts.unassignedOnly ? [task({ assignees: [] }), task({ assignees: [] }), task({ assignees: [] })] : [];
    });
    const out = await runTool(scope, "my_work", { range: "this_week" }, { conversationId: "c", imagesLeft: 3 });
    expect(out.text).toContain("Syed has no tasks assigned on Campfire");
    expect(out.text).toContain("are 3 open tasks on Campfire with nobody assigned");
    // Only ever the asker's own tasks or the unassigned count: never someone else's list.
    expect(listTasks.mock.calls.map((c) => c[1])).toEqual([
      expect.objectContaining({ clientId: "c1", assigneeId: "syed" }),
      expect.objectContaining({ clientId: "c1", unassignedOnly: true, openOnly: true }),
    ]);
  });

  it("names tasks by title; the ref is only a bracketed handle, and chips show the title", async () => {
    listTasks.mockResolvedValue([task({})]);
    const out = await runTool(scope, "my_work", { range: "this_week" }, { conversationId: "c", imagesLeft: 3 });
    expect(out.text).toMatch(/- Email deliverability both ways \[ref [A-Z0-9]{6}\]/);
    expect(out.text).not.toMatch(/#[A-Z0-9]{6}/);
    expect(out.sources?.[0].label).toBe("Email deliverability both ways");
  });
});
