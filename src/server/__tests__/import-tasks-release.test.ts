/** The CSV import puts a row in a release only when that release is this client's. */
import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: async () => ({ id: "client-1" }) },
    featureBlock: { findMany: async () => [] },
    workspaceMember: { findMany: async () => [] },
    clientRelease: {
      findMany: async (args: { where: { id: { in: string[] }; clientId: string } }) =>
        args.where.id.in.filter((id) => id === "rel-mine" && args.where.clientId === "client-1").map((id) => ({ id })),
    },
    task: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: `t${created.length}` };
      },
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

import { importTasks } from "../tasks";
import type { EffectiveUser } from "../auth/effective-user";

const admin = { id: "u1", workspaceId: "ws", role: "SUPER_ADMIN", permissions: [] } as unknown as EffectiveUser;

describe("CSV import and releases", () => {
  it("keeps this client's release and drops anyone else's", async () => {
    const res = await importTasks(admin, "client-1", [
      { title: "Mine", releaseId: "rel-mine" },
      { title: "Theirs", releaseId: "rel-theirs" },
      { title: "None" },
    ]);
    expect(res.created).toBe(3);
    expect(created.map((d) => [d.title, d.releaseId])).toEqual([
      ["Mine", "rel-mine"],
      ["Theirs", null],
      ["None", null],
    ]);
  });
});
