/**
 * The HR profile server (src/server/hr/profile.ts): the access rules applied for real,
 * against a mocked database. What matters most here is what is NOT read or written:
 * personal details are never returned to someone without the right, a look by anyone
 * but the person is always logged, and the log never holds the values.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  sensitive: new Map<string, string>(),
  logs: [] as Array<Record<string, unknown>>,
  suppliers: [] as Array<{ id: string; workspaceId: string; archivedAt: Date | null }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const r = db.records.find(
          (x) =>
            x.workspaceId === where.workspaceId &&
            (where.id === undefined || x.id === where.id) &&
            (where.memberId === undefined || x.memberId === where.memberId),
        );
        return r ? { ...r, member: null, placements: [] } : null;
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        db.updates.push(args);
        return {};
      }),
    },
    supplier: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) =>
        db.suppliers.find((s) => s.id === where.id && s.workspaceId === where.workspaceId && !s.archivedAt) ?? null,
      ),
    },
    staffSensitive: {
      findUnique: vi.fn(async ({ where }: { where: { recordId: string } }) =>
        db.sensitive.has(where.recordId) ? { id: "x", payload: db.sensitive.get(where.recordId) } : null,
      ),
      upsert: vi.fn(async ({ where, create }: { where: { recordId: string }; create: { payload: string } }) => {
        db.sensitive.set(where.recordId, create.payload);
        return {};
      }),
    },
    hrAccessLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.logs.push(data);
        return data;
      }),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
// Encryption is exercised in its own tests; here it only has to round-trip.
vi.mock("@/lib/encryption", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

import { getSensitive, getStaffProfile, updateEmployment, updateSensitive } from "@/server/hr/profile";
import type { EffectiveUser } from "@/server/auth/effective-user";

const user = (over: Partial<EffectiveUser> = {}): EffectiveUser => ({
  id: "u-viewer",
  email: "viewer@gitwork.co.uk",
  name: "Viewer",
  avatarUrl: null,
  role: "STAFF",
  permissions: ["codeclear"],
  workspaceId: "w1",
  membershipId: "m-viewer",
  ...over,
});

beforeEach(() => {
  db.records = [
    { id: "r-viewer", workspaceId: "w1", memberId: "m-viewer", managerId: null, name: "Viewer", email: null },
    { id: "r-report", workspaceId: "w1", memberId: "m-report", managerId: "r-viewer", name: "Report", email: null },
    { id: "r-other", workspaceId: "w1", memberId: "m-other", managerId: null, name: "Other", email: null },
    { id: "r-elsewhere", workspaceId: "w2", memberId: null, managerId: null, name: "Elsewhere", email: null },
  ];
  db.sensitive = new Map([["r-other", `enc:${JSON.stringify({ niNumber: "AB123456C" })}`]]);
  db.logs = [];
  db.updates = [];
  db.suppliers = [{ id: "s1", workspaceId: "w1", archivedAt: null }];
});

describe("getStaffProfile", () => {
  it("hides the employment tier from a colleague and shows it to a manager", async () => {
    expect((await getStaffProfile(user(), "r-other")).employment).toBeNull();
    const managed = await getStaffProfile(user(), "r-report");
    expect(managed.relation).toBe("manager");
    expect(managed.employment).not.toBeNull();
  });

  it("never finds a record in another workspace", async () => {
    await expect(getStaffProfile(user(), "r-elsewhere")).rejects.toMatchObject({ status: 404 });
  });

  it("answers 404, not 403, to someone without Staff access", async () => {
    await expect(getStaffProfile(user({ permissions: [] }), "r-other")).rejects.toMatchObject({ status: 404 });
  });

  it("still shows a person their own record without the Staff module", async () => {
    const own = await getStaffProfile(user({ permissions: [] }), "r-viewer");
    expect(own.relation).toBe("self");
    expect(own.access.sensitive).toBe(true);
  });
});

describe("getSensitive", () => {
  it("refuses a colleague, and a manager", async () => {
    await expect(getSensitive(user(), "r-other")).rejects.toMatchObject({ status: 403 });
    await expect(getSensitive(user(), "r-report")).rejects.toMatchObject({ status: 403 });
    expect(db.logs).toHaveLength(0);
  });

  it("returns them to HR and writes the look to the log", async () => {
    const hr = user({ permissions: ["codeclear", "hr.viewSensitive"] });
    expect((await getSensitive(hr, "r-other")).niNumber).toBe("AB123456C");
    expect(db.logs).toEqual([expect.objectContaining({ recordId: "r-other", action: "VIEW_SENSITIVE", actorUserId: "u-viewer" })]);
  });

  it("does not log a person reading their own", async () => {
    await getSensitive(user(), "r-viewer");
    expect(db.logs).toHaveLength(0);
  });
});

describe("updateSensitive", () => {
  it("encrypts what it stores and logs which fields changed, not their values", async () => {
    await updateSensitive(user(), "r-viewer", { niNumber: "AB 65 43 21 A", emergencyContacts: [] }, "2026-10-29");
    const stored = db.sensitive.get("r-viewer")!;
    expect(stored.startsWith("enc:")).toBe(true);
    expect(db.logs).toEqual([expect.objectContaining({ action: "UPDATE_SENSITIVE", detail: "NI number" })]);
    expect(JSON.stringify(db.logs)).not.toContain("654321");
  });

  it("refuses HR that can manage records but not read personal details", async () => {
    const hr = user({ permissions: ["codeclear", "hr.manage"] });
    await expect(updateSensitive(hr, "r-other", { emergencyContacts: [] })).rejects.toMatchObject({ status: 403 });
  });

  it("writes nothing when nothing changed", async () => {
    await updateSensitive(user(), "r-viewer", { emergencyContacts: [] }, "2026-10-29");
    expect(db.logs).toHaveLength(0);
  });
});

describe("updateEmployment", () => {
  it("is HR-only, even for the person themselves", async () => {
    await expect(updateEmployment(user(), "r-viewer", { noticePeriodWeeks: 2 })).rejects.toMatchObject({ status: 403 });
    expect(db.updates).toHaveLength(0);
  });

  it("refuses a supplier from another workspace", async () => {
    db.suppliers.push({ id: "s-other", workspaceId: "w2", archivedAt: null });
    const hr = user({ permissions: ["codeclear", "hr.manage"] });
    await expect(updateEmployment(hr, "r-other", { supplierId: "s-other" })).rejects.toMatchObject({ status: 400 });
  });

  it("saves and logs the field names", async () => {
    const hr = user({ permissions: ["codeclear", "hr.manage"] });
    await updateEmployment(hr, "r-other", { supplierId: "s1", noticePeriodWeeks: 4 });
    expect(db.updates[0]).toMatchObject({ where: { id: "r-other" }, data: { supplierId: "s1", noticePeriodWeeks: 4 } });
    expect(db.logs).toEqual([expect.objectContaining({ action: "UPDATE_EMPLOYMENT", detail: "supplierId, noticePeriodWeeks" })]);
  });
});
