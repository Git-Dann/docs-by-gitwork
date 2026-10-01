import { beforeEach, describe, expect, it, vi } from "vitest";

const DAY = 24 * 60 * 60 * 1000;

const db = vi.hoisted(() => ({
  member: null as null | Record<string, unknown>,
  activeSuperAdminsOther: 1,
  updates: [] as unknown[],
  deleteManyWhere: null as unknown,
  user: null as unknown,
  created: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findUnique: vi.fn(async () => db.member),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.updates.push(args.data);
        return { ...(db.member ?? {}), ...args.data };
      }),
      count: vi.fn(async (args: { where: Record<string, unknown> }) => {
        // The guard must count ACTIVE super admins. If the archived filter is
        // missing, report one archived "other" so the bug is observable.
        return "archivedAt" in args.where ? db.activeSuperAdminsOther : db.activeSuperAdminsOther + 1;
      }),
      deleteMany: vi.fn(async (args: { where: unknown }) => {
        db.deleteManyWhere = args.where;
        return { count: 2 };
      }),
      create: vi.fn(async (args: { data: unknown }) => {
        db.created = args.data;
        return { id: "new-member" };
      }),
    },
    workspace: { findUniqueOrThrow: vi.fn(async () => ({ id: "w1" })) },
    user: { findUnique: vi.fn(async () => db.user) },
  },
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn(async () => []) }));
vi.mock("@/server/seed-accounts", () => ({
  seedAccountUserWhere: () => ({}),
  isSeedAccount: () => false,
}));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
}));

import { archiveMember, purgeExpiredMembers, reinstateMemberByEmail, restoreMember } from "../team";

const SA = { id: "dan", role: "SUPER_ADMIN" };
const ADMIN = { id: "harry", role: "ADMIN" };

beforeEach(() => {
  db.member = { id: "m1", workspaceId: "w1", role: "STAFF", userId: "leaver", archivedAt: null };
  db.activeSuperAdminsOther = 1;
  db.updates = [];
  db.deleteManyWhere = null;
  db.user = null;
  db.created = null;
});

describe("archiveMember", () => {
  it("stamps archivedAt and who did it — and changes nothing else", async () => {
    await archiveMember("m1", SA);
    expect(db.updates).toHaveLength(1);
    const data = db.updates[0] as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["archivedAt", "archivedById"]);
    expect(data.archivedById).toBe("dan");
    expect(data.archivedAt).toBeInstanceOf(Date);
  });

  it("refuses to archive yourself", async () => {
    db.member = { ...db.member!, userId: "dan" };
    await expect(archiveMember("m1", SA)).rejects.toThrow("archive yourself");
  });

  it("an Admin cannot archive another Admin", async () => {
    db.member = { ...db.member!, role: "ADMIN" };
    await expect(archiveMember("m1", ADMIN)).rejects.toThrow("at or above your own role");
  });

  it("an Admin can archive Staff", async () => {
    await archiveMember("m1", ADMIN);
    expect(db.updates).toHaveLength(1);
  });

  it("refuses to archive the last ACTIVE Super Admin", async () => {
    db.member = { ...db.member!, role: "SUPER_ADMIN", userId: "other-sa" };
    db.activeSuperAdminsOther = 0;
    await expect(archiveMember("m1", SA)).rejects.toThrow("last active Super Admin");
  });

  it("is idempotent — archiving twice does not move the clock", async () => {
    db.member = { ...db.member!, archivedAt: new Date() };
    await archiveMember("m1", SA);
    expect(db.updates).toHaveLength(0);
  });
});

describe("restoreMember", () => {
  it("clears the archive stamp within the window", async () => {
    db.member = { ...db.member!, archivedAt: new Date(Date.now() - 3 * DAY) };
    await restoreMember("m1", SA);
    expect(db.updates[0]).toEqual({ archivedAt: null, archivedById: null });
  });

  it("refuses once the 30-day window has passed, even if the row still exists", async () => {
    db.member = { ...db.member!, archivedAt: new Date(Date.now() - 31 * DAY) };
    await expect(restoreMember("m1", SA)).rejects.toThrow("can no longer be restored");
  });

  it("an Admin cannot restore an Admin", async () => {
    db.member = { ...db.member!, role: "ADMIN", archivedAt: new Date() };
    await expect(restoreMember("m1", ADMIN)).rejects.toThrow("at or above your own role");
  });
});

describe("purgeExpiredMembers", () => {
  it("deletes MEMBERSHIPS archived before the cutoff — never Users", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const result = await purgeExpiredMembers(now);
    expect(result.purged).toBe(2);
    const where = db.deleteManyWhere as { archivedAt: { not: null; lt: Date } };
    expect(where.archivedAt.not).toBeNull();
    expect(where.archivedAt.lt.getTime()).toBe(now.getTime() - 30 * DAY);
  });
});

describe("reinstateMemberByEmail", () => {
  it("creates a membership for someone with a User row and no membership", async () => {
    db.user = { id: "returner", memberships: [] };
    const r = await reinstateMemberByEmail("Returner@Gitwork.co.uk", "STAFF", SA);
    expect(r.status).toBe("reinstated");
    expect(db.created).toMatchObject({ workspaceId: "w1", userId: "returner", role: "STAFF" });
  });

  it("points at Restore rather than creating a second membership for an archived one", async () => {
    db.user = { id: "u", memberships: [{ id: "m9", archivedAt: new Date() }] };
    const r = await reinstateMemberByEmail("u@gitwork.co.uk", "STAFF", SA);
    expect(r.status).toBe("archived");
    expect(db.created).toBeNull();
  });

  it("refuses to reinstate into a role above the actor's", async () => {
    db.user = { id: "u", memberships: [] };
    await expect(reinstateMemberByEmail("u@gitwork.co.uk", "SUPER_ADMIN", ADMIN)).rejects.toThrow();
  });
});
