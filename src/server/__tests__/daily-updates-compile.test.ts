/**
 * The consolidated #updates card's data, through the real compile step. The query is
 * the part a layout test can't see: a subtask nobody is assigned to must still be found,
 * and at end of day in-progress work must be fetched at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ taskWhere: null as unknown, tasks: [] as unknown[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: { findMany: vi.fn(async () => [{ userId: "waqar", user: { email: "waqar@gitwork.co.uk" } }]) },
    workspace: { findUnique: vi.fn(async () => ({ slackBotToken: null, slackBotTokenEncrypted: null, channelRoutes: {} })) },
    user: { findMany: vi.fn(async () => [{ id: "waqar", name: "Waqar Khan", email: "waqar@gitwork.co.uk" }]) },
    dailyUpdate: { findMany: vi.fn(async () => [{ userId: "waqar", note: null }]) },
    task: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        h.taskWhere = args.where;
        return h.tasks;
      }),
    },
  },
}));
vi.mock("@/server/team-roster", () => ({ TEAM_ROSTER: [{ kind: "dev", email: "waqar@gitwork.co.uk", name: "Waqar Khan" }] }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn(async () => ({})) }));
vi.mock("@/server/tasks", () => ({ listTasks: vi.fn(async () => []) }));
vi.mock("@/server/slack/client", () => ({ getSlackBotToken: () => null, postMessage: vi.fn(), deleteMessage: vi.fn() }));
vi.mock("@/server/auth/effective-user", () => ({ assertCanPublishTaskRollup: () => undefined }));

import { previewDailyUpdates } from "../tasks-standup";

const user = { id: "dan", workspaceId: "ws1" } as never;
const client = { id: "c1", name: "Wedge", slug: "wedge" };
const row = (o: Record<string, unknown>) => ({
  assigneeId: null,
  assignees: [],
  parentId: null,
  parent: null,
  client,
  ...o,
});

beforeEach(() => {
  h.taskWhere = null;
  h.tasks = [];
});

describe("compiling the end-of-day update", () => {
  it("⚠️ fetches work still in progress, not only what was done today", async () => {
    await previewDailyUpdates(user, "PM");
    const json = JSON.stringify(h.taskWhere);
    expect(json).toContain('"DONE"');
    expect(json).toContain('"DOING"');
    expect(json).toContain('"IN_REVIEW"');
  });

  it("⚠️ asks for unassigned subtasks of the developer's own tasks", async () => {
    await previewDailyUpdates(user, "PM");
    expect(JSON.stringify(h.taskWhere)).toMatch(/"parent":\{"OR":\[/);
  });

  it("reports a finished unassigned subtask for whoever owns its parent, alongside multi-day work", async () => {
    h.tasks = [
      row({ id: "s1", title: "Apple Pay button", status: "DONE", parentId: "p1", parent: { title: "Checkout flow", assigneeId: null, assignees: [{ id: "waqar" }] } }),
      row({ id: "t2", title: "Migrate auth to OAuth", status: "DOING", assignees: [{ id: "waqar" }] }),
    ];
    const preview = await previewDailyUpdates(user, "PM");
    const dev = preview.projects[0].devs[0];
    expect(dev.name).toBe("Waqar Khan");
    expect(dev.tasks.map((t) => `${t.status}:${t.title}:${t.parentTitle ?? ""}`)).toEqual([
      "DONE:Apple Pay button:Checkout flow",
      "DOING:Migrate auth to OAuth:",
    ]);
    expect(preview.otherDevs).toEqual([]);
  });
});
