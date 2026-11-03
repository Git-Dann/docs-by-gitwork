/**
 * The query behind My Day's "From the plan": planned, open, unassigned, on SEVERAL clients
 * — and still limited to the clients the caller may see.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const seen: { where: Record<string, unknown> | null } = { where: null };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        seen.where = args.where;
        return [];
      }),
    },
    clientAssignment: { findMany: vi.fn(async () => [{ clientId: "c-mine" }]) },
  },
}));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn(async () => ({})) }));
vi.mock("@/server/client-assignments", () => ({ placementClientIds: vi.fn(async () => []) }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
// The real module pulls NextAuth into a node test; the scope rule is the only part used.
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  canSeeAllClients: (u: { role: string; permissions: string[] }) =>
    u.role === "SUPER_ADMIN" || u.permissions.includes("seeAllClients"),
}));

import { listTasks } from "../tasks";

const dev = { id: "u1", workspaceId: "w1", role: "DEVELOPER", permissions: [] } as never;
const admin = { id: "u2", workspaceId: "w1", role: "SUPER_ADMIN", permissions: [] } as never;

beforeEach(() => {
  seen.where = null;
});

describe("listTasks — plan filters", () => {
  it("planned + open + unassigned", async () => {
    await listTasks(admin, { clientIds: ["c1", "c2"], plannedOnly: true, openOnly: true, unassignedOnly: true });
    expect(seen.where).toMatchObject({
      clientId: { in: ["c1", "c2"] },
      status: { not: "DONE" },
      featureBlockId: { not: null },
      parentId: null,
      archivedAt: null,
    });
    expect(seen.where!.AND).toEqual([{ assigneeId: null, assignees: { none: {} } }]);
  });

  it("⚠️ clientIds can't widen a restricted developer's scope", async () => {
    await listTasks(dev, { clientIds: ["c-mine", "c-someone-elses"] });
    expect(seen.where!.clientId).toEqual({ in: ["c-mine"] });
  });

  it("a restricted developer naming only other clients gets nothing, not everything", async () => {
    await listTasks(dev, { clientIds: ["c-someone-elses"] });
    expect(seen.where!.clientId).toEqual({ in: ["__none__"] });
  });

  it("an explicit status still wins over openOnly", async () => {
    await listTasks(admin, { status: "DONE", openOnly: true });
    expect(seen.where!.status).toBe("DONE");
  });
});
