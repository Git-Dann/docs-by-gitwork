import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * mergeRecords against a recorded Prisma: who may merge, what is refused, and that every
 * table pointing at the dropped record is moved before it is deleted.
 */
const ops: string[] = [];
const records: Record<string, Record<string, unknown>> = {};
let sensitive: string[] = [];
let scoreOwners: string[] = [];

type Ops = Record<string, (args?: { where?: Record<string, unknown> }) => Promise<{ count: number }>>;

function recorder(model: string): Ops {
  return new Proxy(
    {} as Ops,
    {
      get: (_t, op: string) => (args: { where?: Record<string, unknown> } = {}) => {
        const where = JSON.stringify(args.where ?? {});
        ops.push(`${model}.${op} ${where}`);
        return Promise.resolve({ count: 0 });
      },
    },
  );
}

vi.mock("@/lib/prisma", () => {
  const base = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return (list: Promise<unknown>[]) => Promise.all(list);
      if (model === "candidate")
        return {
          findFirst: ({ where }: { where: { id: string } }) => Promise.resolve(records[where.id] ?? null),
          updateMany: recorder("candidate").updateMany,
          delete: recorder("candidate").delete,
          update: (args: { where: { id: string }; data: unknown }) => {
            ops.push(`candidate.update ${JSON.stringify(args.where)} ${JSON.stringify(args.data)}`);
            return Promise.resolve({});
          },
        };
      if (model === "staffSensitive")
        return {
          findUnique: ({ where }: { where: { recordId: string } }) =>
            Promise.resolve(sensitive.includes(where.recordId) ? { id: "s" } : null),
          updateMany: recorder("staffSensitive").updateMany,
        };
      if (model === "codeClearScore" || model === "codeClearScoreDraft")
        return {
          findMany: () => Promise.resolve(model === "codeClearScore" ? scoreOwners.map((candidateId) => ({ candidateId })) : []),
          updateMany: recorder(model).updateMany,
          deleteMany: recorder(model).deleteMany,
        };
      return recorder(model);
    },
  });
  return { prisma: base };
});

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

import { mergeRecords } from "@/server/hr/profile";

const admin = {
  id: "u1",
  email: "dan@gitwork.co.uk",
  name: "Dan",
  avatarUrl: null,
  role: "SUPER_ADMIN",
  permissions: ["codeclear", "code.manage"],
  workspaceId: "w1",
  membershipId: "mm",
};

beforeEach(() => {
  ops.length = 0;
  sensitive = [];
  scoreOwners = [];
  records.old = { id: "old", workspaceId: "w1", name: "Hassaan", createdAt: new Date("2026-06-10"), memberId: null, githubHandle: "hassaan", email: null, techStacks: ["Frontend"], signalSources: [], isDeveloper: true, archivedAt: null, primaryStack: "Frontend" };
  records.new = { id: "new", workspaceId: "w1", name: "Hassaan Bin Sajjad", createdAt: new Date("2026-10-30"), memberId: "m1", githubHandle: null, email: "h@gitwork.co.uk", techStacks: [], signalSources: [], isDeveloper: false, archivedAt: null, primaryStack: "", jobTitle: "Product Manager" };
});

describe("mergeRecords", () => {
  it("keeps the older record, moves everything onto it, deletes the other, then fills the kept one", async () => {
    const r = await mergeRecords(admin, "new", "old");
    expect(r).toEqual({ keptId: "old", name: "Hassaan Bin Sajjad" });
    for (const model of ["placement", "note", "activityLog", "gitHubAnalysisRun", "codeClearCheck", "devSignalAssessment", "devSignalDataRequest", "devSignalStageResult", "devSignalOutcomeLink", "devSignalAuditEvent"]) {
      expect(ops).toContain(`${model}.updateMany {"candidateId":"new"}`);
    }
    for (const model of ["staffSensitive", "staffDocument", "hrAccessLog"]) {
      expect(ops).toContain(`${model}.updateMany {"workspaceId":"w1","recordId":"new"}`);
    }
    expect(ops).toContain(`candidate.updateMany {"workspaceId":"w1","managerId":"new"}`);
    const del = ops.indexOf(`candidate.delete {"id":"new"}`);
    const upd = ops.findIndex((o) => o.startsWith(`candidate.update {"id":"old"}`));
    expect(del).toBeGreaterThan(-1);
    // The unique (workspaceId, githubHandle) index means the other record goes first.
    expect(upd).toBeGreaterThan(del);
    expect(ops[upd]).toContain(`"memberId":"m1"`);
    expect(ops[upd]).toContain(`"jobTitle":"Product Manager"`);
  });

  it("drops the other record's score when the kept one has its own", async () => {
    scoreOwners = ["old", "new"];
    await mergeRecords(admin, "old", "new");
    expect(ops).toContain(`codeClearScore.deleteMany {"candidateId":"new"}`);
    expect(ops).not.toContain(`codeClearScore.updateMany {"candidateId":"new"}`);
  });

  it("refuses when both hold personal details, and writes nothing", async () => {
    sensitive = ["old", "new"];
    await expect(mergeRecords(admin, "old", "new")).rejects.toThrow(/personal details/);
    expect(ops.filter((o) => !o.includes("findMany"))).toEqual([]);
  });

  it("refuses someone without Staff manage, and an Admin-less HR-less manager", async () => {
    await expect(mergeRecords({ ...admin, role: "STAFF", permissions: ["codeclear"] }, "old", "new")).rejects.toThrow(/permission/);
    await expect(mergeRecords({ ...admin, role: "STAFF", permissions: ["codeclear", "code.manage"] }, "old", "new")).rejects.toThrow(/permission/);
    expect(ops).toEqual([]);
  });

  it("allows HR without Admin", async () => {
    await expect(mergeRecords({ ...admin, role: "STAFF", permissions: ["codeclear", "code.manage", "hr.manage"] }, "old", "new")).resolves.toMatchObject({ keptId: "old" });
  });

  it("treats another workspace's record as not found", async () => {
    await expect(mergeRecords(admin, "old", "elsewhere")).rejects.toThrow(/not found/);
  });
});
