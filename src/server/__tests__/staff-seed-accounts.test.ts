import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  members: [] as Array<{ id: string; role: string; user: { name: string | null; email: string; avatarUrl: string | null }; staffRecords: unknown[] }>,
  records: [] as Array<Record<string, unknown>>,
  memberWhere: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findMany: vi.fn(async (args: { select?: { memberId?: boolean; placements?: unknown } }) =>
        // linkStaffRecords reads id/email/memberId; listStaff reads the full record select.
        args.select && "placements" in args.select ? db.records : [],
      ),
      updateMany: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn(async (args: { where?: unknown; select?: { staffRecords?: unknown } }) => {
        if (args.select && "staffRecords" in args.select) {
          db.memberWhere = args.where;
          return db.members;
        }
        return [];
      }),
    },
  },
}));
vi.mock("@/server/codeclear-archived", () => ({
  archivedTeamEmails: vi.fn(async () => []),
  activeDeveloperWhere: vi.fn(() => ({})),
}));

import { listStaff } from "@/server/staff";

const record = (over: Record<string, unknown>) => ({
  id: "r",
  name: "Someone",
  email: null,
  avatarUrl: null,
  githubHandle: null,
  primaryStack: "",
  jobTitle: null,
  department: null,
  employmentType: null,
  startDate: null,
  managerId: null,
  memberId: null,
  placements: [],
  ...over,
});

describe("listStaff hides placeholder accounts", () => {
  beforeEach(() => {
    db.members = [
      { id: "m1", role: "SUPER_ADMIN", user: { name: "Dan Lindsay", email: "dan@gitwork.co.uk", avatarUrl: null }, staffRecords: [] },
      { id: "m2", role: "ADMIN", user: { name: "admin", email: "admin@example.com", avatarUrl: null }, staffRecords: [] },
      { id: "m3", role: "ADMIN", user: { name: "Foundry Owner", email: "owner@gitwork.io", avatarUrl: null }, staffRecords: [] },
    ];
    db.records = [record({ id: "r1", name: "Contractor Kim" }), record({ id: "r2", name: "admin", email: "x@example.com" })];
  });

  it("drops the seeded admin and Foundry Owner but keeps real people", async () => {
    const { people } = await listStaff("ws");
    expect(people.map((p) => p.name).sort()).toEqual(["Contractor Kim", "Dan Lindsay"]);
  });

  it("filters seed accounts in the query too, not only afterwards", async () => {
    await listStaff("ws");
    expect(JSON.stringify(db.memberWhere)).toContain("example.com");
  });
});
