/**
 * A profile's activity feed (src/server/hr/activity.ts). The rule that matters: a leave
 * TYPE (sick, unpaid) is health-adjacent, so only the person and HR see it; everyone else
 * sees "Off". And this year's allowance is the person's, HR's and approvers' only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ record: null as Record<string, unknown> | null }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: { findFirst: vi.fn(async ({ where }: { where: { workspaceId: string } }) => (where.workspaceId === "w1" ? db.record : null)) },
    task: { findMany: vi.fn(async () => [{ completedAt: new Date("2026-10-20T10:00:00Z") }]) },
    leaveRequest: {
      findMany: vi.fn(async () => [
        { type: "SICK", startDate: new Date("2026-11-02T00:00:00Z"), endDate: new Date("2026-11-03T00:00:00Z"), status: "APPROVED" },
      ]),
    },
  },
}));
vi.mock("@/server/backstage", () => ({
  getLeaveAllowance: vi.fn(async () => ({ year: 2026, allocated: 25, used: 3, pending: 0, remaining: 22 })),
}));

import { getStaffActivity } from "@/server/hr/activity";
import type { EffectiveUser } from "@/server/auth/effective-user";

const NOW = new Date("2026-10-29T12:00:00Z");
const user = (over: Partial<EffectiveUser> = {}): EffectiveUser => ({
  id: "u-viewer",
  email: "v@gitwork.co.uk",
  name: "Viewer",
  avatarUrl: null,
  role: "STAFF",
  permissions: ["codeclear"],
  workspaceId: "w1",
  membershipId: "m-viewer",
  ...over,
});

beforeEach(() => {
  db.record = {
    id: "r1",
    githubHandle: null,
    primaryStack: "",
    techStacks: [],
    memberId: "m-subject",
    member: { userId: "u-subject" },
    placements: [],
  };
});

describe("getStaffActivity", () => {
  it("shows a colleague 'Off', not the leave type, and no allowance", async () => {
    const a = await getStaffActivity(user(), "r1", NOW);
    expect(a.upcomingLeave).toEqual([{ start: "2026-11-02", end: "2026-11-03", label: "Off", pending: false }]);
    expect(a.allowance).toBeNull();
  });

  it("shows the person their own leave type and allowance", async () => {
    const a = await getStaffActivity(user({ membershipId: "m-subject", permissions: [] }), "r1", NOW);
    expect(a.upcomingLeave[0].label).toBe("Sick");
    expect(a.allowance).toMatchObject({ remaining: 22 });
  });

  it("shows HR the type", async () => {
    const a = await getStaffActivity(user({ permissions: ["codeclear", "hr.manage"] }), "r1", NOW);
    expect(a.upcomingLeave[0].label).toBe("Sick");
  });

  it("counts completed tasks onto their day", async () => {
    const a = await getStaffActivity(user(), "r1", NOW);
    expect(a.completedTotal).toBe(1);
    expect(a.completedByDay.find((d) => d.date === "2026-10-20")?.value).toBe(1);
  });

  it("is a 404 from another workspace, and without Staff access", async () => {
    await expect(getStaffActivity(user({ workspaceId: "w2" }), "r1", NOW)).rejects.toMatchObject({ status: 404 });
    await expect(getStaffActivity(user({ permissions: [] }), "r1", NOW)).rejects.toMatchObject({ status: 404 });
  });
});
