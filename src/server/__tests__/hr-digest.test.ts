/**
 * The weekly HR digest's sending rules (src/server/hr/digest.ts): who gets it, once a week,
 * and never in a quiet week.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspace: { findMany: vi.fn(), updateMany: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
  staffDocument: { count: vi.fn() },
}));
const overview = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());
const email = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/hr/activity", () => ({ getHrOverview: overview }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: dispatch }));
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: email }));

import { sendHrDigests } from "@/server/hr/digest";

const MONDAY = new Date("2026-11-02T09:00:00Z");
const member = (id: string, role: string, grants: string[] = []) => ({
  id: `m-${id}`,
  role,
  permissionOverrides: grants.length ? { grant: grants, revoke: [] } : null,
  user: { id: `u-${id}`, email: `${id}@x.co`, name: id, avatarUrl: null },
});

beforeEach(() => {
  vi.resetAllMocks();
  db.workspace.findMany.mockResolvedValue([{ id: "w1", rolePermissions: null, modulesRestricted: false, enabledModules: [] }]);
  db.workspace.updateMany.mockResolvedValue({ count: 1 });
  db.staffDocument.count.mockResolvedValue(0);
  overview.mockResolvedValue({ comingUp: [{ kind: "contract-end", date: "2026-11-10", name: "Ali", href: "/app/staff/r3" }], missing: [] });
  email.mockResolvedValue({ ok: true, id: "e1" });
});

describe("sendHrDigests", () => {
  it("does nothing, and reads nothing, outside Monday morning", async () => {
    const run = await sendHrDigests(new Date("2026-11-03T09:00:00Z"));
    expect(run.week).toBeNull();
    expect(db.workspace.findMany).not.toHaveBeenCalled();
  });

  it("goes to people granted hr.manage, and not to a Super Admin who merely could look", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("sian", "STAFF", ["hr.manage"]), member("dan", "SUPER_ADMIN"), member("dev", "DEVELOPER")]);
    const run = await sendHrDigests(MONDAY);
    expect(run.sent).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ event: "hr.weekly_digest", target: { kind: "users", userIds: ["u-sian"] }, groupKey: "hr.weekly:2026-W45" });
    expect(email).toHaveBeenCalledWith(expect.objectContaining({ to: "sian@x.co", subject: "HR this week: 1 coming up" }));
    // Archived members never get it: the query is active members only.
    expect(db.workspaceMember.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: "w1", archivedAt: null });
  });

  it("a Super Admin who has been given HR access explicitly does get it", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("dan", "SUPER_ADMIN", ["hr.manage"])]);
    await sendHrDigests(MONDAY);
    expect(dispatch.mock.calls[0][0].target.userIds).toEqual(["u-dan"]);
  });

  it("builds each recipient's overview as them, so it holds only what they may see", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("sian", "STAFF", ["hr.manage"])]);
    await sendHrDigests(MONDAY);
    expect(overview.mock.calls[0][0]).toMatchObject({ id: "u-sian", workspaceId: "w1", membershipId: "m-sian" });
    expect(overview.mock.calls[0][0].permissions).toContain("hr.manage");
  });

  it("sends nothing when another run has already claimed the week", async () => {
    db.workspace.updateMany.mockResolvedValue({ count: 0 });
    db.workspaceMember.findMany.mockResolvedValue([member("sian", "STAFF", ["hr.manage"])]);
    await sendHrDigests(MONDAY);
    expect(dispatch).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
    expect(db.workspace.updateMany.mock.calls[0][0]).toMatchObject({ data: { hrDigestWeek: "2026-W45" } });
  });

  it("stays quiet in a quiet week", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("sian", "STAFF", ["hr.manage"])]);
    overview.mockResolvedValue({ comingUp: [], missing: [] });
    const run = await sendHrDigests(MONDAY);
    expect(run.quiet).toBe(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it("skips a business without Staff", async () => {
    db.workspace.findMany.mockResolvedValue([{ id: "w1", rolePermissions: null, modulesRestricted: true, enabledModules: ["pulse"] }]);
    await sendHrDigests(MONDAY);
    expect(db.workspaceMember.findMany).not.toHaveBeenCalled();
  });

  it("one person's failure doesn't stop the next person's digest", async () => {
    db.workspaceMember.findMany.mockResolvedValue([member("a", "STAFF", ["hr.manage"]), member("b", "STAFF", ["hr.manage"])]);
    overview.mockRejectedValueOnce(new Error("boom"));
    const run = await sendHrDigests(MONDAY);
    expect(run.sent).toBe(1);
    expect(dispatch.mock.calls[0][0].target.userIds).toEqual(["u-b"]);
  });
});
