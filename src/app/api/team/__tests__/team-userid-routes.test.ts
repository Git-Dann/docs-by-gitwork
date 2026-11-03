/**
 * /api/team/[userId]: reset-password never goes up the role ladder, and DELETE archives the
 * member rather than deleting the User (Dan, 2 Nov 2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  actor: { id: "admin", role: "ADMIN", workspaceId: "w1" } as { id: string; role: string; workspaceId: string },
  members: {} as Record<string, { id: string; role: string }>,
  userUpdates: [] as string[],
  userDeletes: [] as string[],
  memberDeletes: [] as string[],
  archived: [] as string[],
  audits: [] as string[],
}));

vi.mock("@/server/auth/team-admin", () => ({ requireTeamAdmin: vi.fn(async () => h.actor) }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findUnique: vi.fn(async (a: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) => {
        const { workspaceId, userId } = a.where.workspaceId_userId;
        return workspaceId === "w1" ? h.members[userId] ?? null : null;
      }),
      delete: vi.fn(async (a: unknown) => { h.memberDeletes.push(JSON.stringify(a)); return {}; }),
    },
    user: {
      update: vi.fn(async (a: { where: { id: string } }) => { h.userUpdates.push(a.where.id); return {}; }),
      delete: vi.fn(async (a: { where: { id: string } }) => { h.userDeletes.push(a.where.id); return {}; }),
    },
  },
}));
vi.mock("@/server/team", () => ({
  archiveMember: vi.fn(async (memberId: string) => { h.archived.push(memberId); return { id: memberId }; }),
}));
vi.mock("@/server/audit-log", () => ({
  recordAuditEntry: vi.fn(async (e: { action: string }) => { h.audits.push(e.action); }),
}));

import { POST as resetPassword } from "../[userId]/reset-password/route";
import { DELETE as deleteMember } from "../[userId]/route";

const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/team/x", { method: "POST", body: body ? JSON.stringify(body) : undefined });
const ctx = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  h.actor = { id: "admin", role: "ADMIN", workspaceId: "w1" };
  h.members = {
    admin: { id: "m-admin", role: "ADMIN" },
    boss: { id: "m-boss", role: "SUPER_ADMIN" },
    peer: { id: "m-peer", role: "ADMIN" },
    staff: { id: "m-staff", role: "STAFF" },
  };
  h.userUpdates = []; h.userDeletes = []; h.memberDeletes = []; h.archived = []; h.audits = [];
});

describe("reset-password", () => {
  const pw = { newPassword: "a-long-password" };

  it("refuses an Admin resetting a Super Admin's password", async () => {
    const res = await resetPassword(req(pw), ctx("boss"));
    expect(res.status).toBe(403);
    expect(h.userUpdates).toEqual([]);
  });

  it("refuses an Admin resetting another Admin's password", async () => {
    const res = await resetPassword(req(pw), ctx("peer"));
    expect(res.status).toBe(403);
    expect(h.userUpdates).toEqual([]);
  });

  it("lets an Admin reset a Staff member's password", async () => {
    const res = await resetPassword(req(pw), ctx("staff"));
    expect(res.status).toBe(200);
    expect(h.userUpdates).toEqual(["staff"]);
  });

  it("lets anyone reset their own password", async () => {
    const res = await resetPassword(req(pw), ctx("admin"));
    expect(res.status).toBe(200);
    expect(h.userUpdates).toEqual(["admin"]);
  });

  it("lets a Super Admin reset anyone's", async () => {
    h.actor = { id: "boss", role: "SUPER_ADMIN", workspaceId: "w1" };
    const res = await resetPassword(req(pw), ctx("peer"));
    expect(res.status).toBe(200);
  });

  it("is 404 for someone outside the workspace", async () => {
    const res = await resetPassword(req(pw), ctx("stranger"));
    expect(res.status).toBe(404);
    expect(h.userUpdates).toEqual([]);
  });
});

describe("DELETE /api/team/[userId]", () => {
  it("archives the member and never deletes the User or the membership", async () => {
    const res = await deleteMember(req(), ctx("staff"));
    expect(res.status).toBe(200);
    expect(h.archived).toEqual(["m-staff"]);
    expect(h.audits).toEqual(["team.member.archived"]);
    expect(h.userDeletes).toEqual([]);
    expect(h.memberDeletes).toEqual([]);
  });

  it("refuses your own account", async () => {
    const res = await deleteMember(req(), ctx("admin"));
    expect(res.status).toBe(400);
    expect(h.archived).toEqual([]);
  });

  it("is 404 for someone outside the workspace", async () => {
    const res = await deleteMember(req(), ctx("stranger"));
    expect(res.status).toBe(404);
    expect(h.archived).toEqual([]);
  });
});
