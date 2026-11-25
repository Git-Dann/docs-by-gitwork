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

const devScope = {
  user: { id: "syed", name: "Syed", email: "s@x.test", role: "DEVELOPER", permissions: [], workspaceId: "ws", membershipId: "m" },
  client: { id: "c1", name: "Campfire", slug: "campfire" },
  surface: "web",
  canSeeMoney: false,
  isAdmin: false,
  documentTypes: [],
} as unknown as Parameters<typeof runTool>[0];
const adminScope = { ...devScope, user: { ...devScope.user, role: "ADMIN" }, isAdmin: true } as typeof devScope;
const scope = devScope;

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

  it("an admin with nothing assigned is told whose the open work is", async () => {
    listTasks.mockImplementation(async (...args: unknown[]) => {
      const opts = (args[1] ?? {}) as { assigneeId?: string; openOnly?: boolean };
      if (opts.assigneeId) return [];
      return [
        task({ assignees: [{ id: "n", name: "Nasir Javed" }] }),
        task({ assignees: [{ id: "n", name: "Nasir Javed" }, { id: "f", name: "Muhammad Fahad" }] }),
        task({ assignees: [] }),
      ];
    });
    const out = await runTool(adminScope, "my_work", { range: "this_week" }, { conversationId: "c", imagesLeft: 3 });
    expect(out.text).toContain("Syed has no tasks assigned on Campfire");
    expect(out.text).toContain("Nasir Javed 2, Muhammad Fahad 1");
    expect(out.text).toContain("1 with nobody assigned");
  });

  it("a developer with nothing assigned is NOT told what teammates hold", async () => {
    listTasks.mockImplementation(async (...args: unknown[]) => {
      const opts = (args[1] ?? {}) as { assigneeId?: string; unassignedOnly?: boolean };
      if (opts.assigneeId) return [];
      // Anything other than the unassigned list would be someone else's work.
      return opts.unassignedOnly ? [task({ assignees: [] })] : [task({ assignees: [{ id: "n", name: "Nasir Javed" }] })];
    });
    const out = await runTool(devScope, "my_work", { range: "this_week" }, { conversationId: "c", imagesLeft: 3 });
    expect(out.text).not.toContain("Nasir");
    expect(out.text).toContain("is 1 open task on Campfire with nobody assigned");
  });

  it("names tasks by title; the ref is only a bracketed handle, and chips show the title", async () => {
    listTasks.mockResolvedValue([task({})]);
    const out = await runTool(scope, "my_work", { range: "this_week" }, { conversationId: "c", imagesLeft: 3 });
    expect(out.text).toMatch(/- Email deliverability both ways \[ref [A-Z0-9]{6}\]/);
    expect(out.text).not.toMatch(/#[A-Z0-9]{6}/);
    expect(out.sources?.[0].label).toBe("Email deliverability both ways");
  });
});
