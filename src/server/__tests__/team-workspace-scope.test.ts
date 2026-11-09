/**
 * Member and invite writes stay inside the actor's workspace (multi-tenant Phase 2.2b).
 * An id from another business reads as not found and nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  member: { id: "m1", workspaceId: "w1", role: "STAFF" } as Record<string, unknown>,
  invite: { id: "i1", workspaceId: "w1", status: "PENDING" } as Record<string, unknown>,
  writes: [] as string[],
}));

function inWorkspace<T extends Record<string, unknown>>(row: T, where: { id?: string; workspaceId?: string }) {
  return row.id === where.id && row.workspaceId === where.workspaceId ? row : null;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findFirst: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => inWorkspace(db.member, a.where)),
      update: vi.fn(async () => { db.writes.push("member.update"); return db.member; }),
      findUniqueOrThrow: vi.fn(async () => ({ ...db.member, user: {} })),
      count: vi.fn(async () => 1),
    },
    workspaceInvite: {
      findFirst: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => inWorkspace(db.invite, a.where)),
      update: vi.fn(async () => { db.writes.push("invite.update"); return db.invite; }),
      delete: vi.fn(async () => { db.writes.push("invite.delete"); return db.invite; }),
    },
  },
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn(async () => []) }));
vi.mock("@/server/seed-accounts", () => ({ seedAccountUserWhere: () => ({}), isSeedAccount: () => false }));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
}));

import { deleteInvite, revokeInvite, updateInviteLabel, updateMember } from "../team";

beforeEach(() => {
  db.writes = [];
});

describe("updateMember", () => {
  it("updates a member of the actor's own workspace", async () => {
    await updateMember("m1", { role: "DEVELOPER" }, { role: "SUPER_ADMIN", workspaceId: "w1" });
    expect(db.writes).toEqual(["member.update"]);
  });

  it("refuses a member of another workspace with a 404 and writes nothing", async () => {
    await expect(updateMember("m1", { role: "DEVELOPER" }, { role: "SUPER_ADMIN", workspaceId: "w2" })).rejects.toMatchObject({
      status: 404,
    });
    expect(db.writes).toEqual([]);
  });
});

describe("invite writes", () => {
  it("work inside the actor's workspace", async () => {
    expect(await revokeInvite("w1", "i1")).not.toBeNull();
    expect(await updateInviteLabel("w1", "i1", "Sam")).not.toBeNull();
    expect(await deleteInvite("w1", "i1")).not.toBeNull();
    expect(db.writes).toEqual(["invite.update", "invite.update", "invite.delete"]);
  });

  it("read another workspace's invite as not found and write nothing", async () => {
    expect(await revokeInvite("w2", "i1")).toBeNull();
    expect(await updateInviteLabel("w2", "i1", "Sam")).toBeNull();
    expect(await deleteInvite("w2", "i1")).toBeNull();
    expect(db.writes).toEqual([]);
  });
});
