/**
 * §151: the inbox's reader gates and scopes each source like its own page, and only offers
 * actions that person's own page would. A developer assigned to one client sees that client's
 * requests only, can mark them dealt with but not create tasks, never gets Foreman, and never
 * gets someone else's commitments (nor their own while being previewed with "view as").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ intakeWhere: null as unknown, commitmentWhere: null as unknown, foreman: 0 }));
const NOW = new Date("2026-11-20T12:00:00Z");

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(async () => ({ modulesRestricted: false, enabledModules: [] })) },
    clientWikiIntakeItem: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        calls.intakeWhere = where;
        return [
          {
            id: "r1",
            title: "Tee time wrong",
            type: "BUG",
            requestedBy: "Luke",
            createdAt: new Date("2026-11-17T12:00:00Z"),
            wiki: { client: { id: "c-wedge", name: "Wedge", slug: "wedge" } },
          },
        ];
      }),
    },
    commitment: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        calls.commitmentWhere = where;
        return [{ id: "cm1", title: "Send deck", quote: null, counterpart: null, source: "gmail", createdAt: new Date("2026-11-20T10:00:00Z") }];
      }),
    },
    supportClient: { findMany: vi.fn(async () => []) },
    document: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/tasks", () => ({ assignedClientIds: vi.fn(async () => ["c-wedge"]) }));
vi.mock("@/server/wiki-monitor-board", () => ({ loadMonitorBoard: vi.fn(async () => ({ clients: [], incidents: [], readAt: "" })) }));
vi.mock("@/server/foreman/queries", () => ({
  getForemanReport: vi.fn(async () => {
    calls.foreman += 1;
    return null;
  }),
}));
vi.mock("@/server/support", () => ({ getClientQueueSummaries: vi.fn(async () => ({})) }));
vi.mock("@/server/pulse", () => ({ getPulseProjects: vi.fn(async () => []) }));
vi.mock("@/server/needs-you-state", () => ({ readHolds: vi.fn(async () => []), pruneHolds: vi.fn(async () => undefined) }));

import { loadNeedsYou } from "@/server/needs-you";
import type { EffectiveUser } from "@/server/auth/effective-user";

function user(over: Partial<EffectiveUser>): EffectiveUser {
  return {
    id: "u1",
    workspaceId: "w1",
    email: "dev@gitwork.co.uk",
    name: "Dev",
    role: "DEVELOPER",
    permissions: ["clients", "backstage"],
    ...over,
  } as EffectiveUser;
}

beforeEach(() => {
  calls.intakeWhere = null;
  calls.commitmentWhere = null;
  calls.foreman = 0;
});

describe("loadNeedsYou scoping", () => {
  it("limits a developer to their own clients' requests, with Mark dealt with but not Create task", async () => {
    const dto = await loadNeedsYou(user({}), NOW);
    expect(JSON.stringify(calls.intakeWhere)).toContain('"in":["c-wedge"]');
    const req = dto.items.find((i) => i.source === "requests")!;
    expect(req.actions.map((a) => a.kind)).toEqual(["mark-dealt-with"]);
    expect(calls.foreman).toBe(0);
    expect(dto.checked).not.toContain("foreman");
  });

  it("gives an admin Create task too, and reads Foreman", async () => {
    const dto = await loadNeedsYou(user({ role: "ADMIN", permissions: ["clients", "backstage", "seeAllClients"] }), NOW);
    expect(dto.items.find((i) => i.source === "requests")!.actions.map((a) => a.kind)).toEqual(["create-task", "mark-dealt-with"]);
    expect(calls.foreman).toBe(1);
  });

  it("reads only the person's own suggested commitments", async () => {
    const dto = await loadNeedsYou(user({}), NOW);
    expect(calls.commitmentWhere).toMatchObject({ userId: "u1", workspaceId: "w1", state: "suggested" });
    expect(dto.items.some((i) => i.id === "commitments:cm1")).toBe(true);
  });

  it("leaves Commitments out while viewing as someone, and for someone without Backstage", async () => {
    const previewed = await loadNeedsYou(user({}), NOW, { viewingAs: true });
    expect(previewed.checked).not.toContain("commitments");
    expect(calls.commitmentWhere).toBeNull();
    const noBackstage = await loadNeedsYou(user({ permissions: ["clients"] }), NOW);
    expect(noBackstage.checked).not.toContain("commitments");
  });

  it("offers no request actions to someone without Portal", async () => {
    const dto = await loadNeedsYou(user({ permissions: ["backstage"] }), NOW);
    expect(dto.checked).not.toContain("requests");
  });
});
