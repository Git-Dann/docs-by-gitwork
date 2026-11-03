/**
 * A developer fills in their own GitHub handle, stack and links from Backstage → Me. Only on
 * their own record, and only once it's marked as a developer, so adding a handle can't put
 * someone on the Developers list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ownRecordId: "r1" as string | null,
  record: { id: "r1", isDeveloper: true, githubHandle: null as string | null, primaryStack: "", techStacks: [] as string[], location: null, timezone: null, linkedinUrl: null, portfolioUrl: null },
  update: null as null | { where: unknown; data: Record<string, unknown> },
  updateError: null as null | { code: string },
  created: [] as Array<Record<string, unknown>>,
  marked: [] as string[],
  memberHasRecord: false,
  failCreate: false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(),
      findFirst: vi.fn(async (args: { where: { memberId?: string; id?: string } }) =>
        args.where.memberId ? (db.ownRecordId ? { id: db.ownRecordId } : null) : db.record,
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        if (db.updateError) throw db.updateError;
        db.update = args;
        if ("isDeveloper" in args.data) db.marked.push(args.where.id);
        return { ...db.record, ...args.data };
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (db.failCreate) throw new Error("database down");
        db.created.push(args.data);
        return { id: "new-record" };
      }),
    },
    workspaceMember: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({
        id: "m1",
        staffRecords: db.memberHasRecord ? [{ id: "existing" }] : [],
        user: { name: "Abdullah Farooq", email: "abdullahfarooq@gitwork.co.uk", avatarUrl: null },
      })),
    },
  },
}));

import { applyInviteDeveloperFlag, updateOwnDeveloperDetails } from "@/server/staff";
import { cleanGithubHandle, missingDeveloperDetails, normaliseDeveloperSelfDetails } from "@/lib/developer-self-details";

beforeEach(() => {
  db.ownRecordId = "r1";
  db.record = { id: "r1", isDeveloper: true, githubHandle: null, primaryStack: "", techStacks: [], location: null, timezone: null, linkedinUrl: null, portfolioUrl: null };
  db.update = null;
  db.updateError = null;
  db.created = [];
  db.marked = [];
  db.memberHasRecord = false;
  db.failCreate = false;
});

describe("the rules for what someone can enter", () => {
  it("accepts a handle however it's pasted", () => {
    for (const raw of ["octocat", "@octocat", "github.com/octocat", "https://github.com/octocat/", "https://www.github.com/octocat?tab=repositories"]) {
      expect(cleanGithubHandle(raw)).toBe("octocat");
    }
  });

  it("refuses something that can't be a GitHub username", () => {
    for (const bad of ["octo cat", "-octocat", "octo--cat", "a".repeat(40)]) {
      const r = normaliseDeveloperSelfDetails({ githubHandle: bad });
      expect(r.ok, bad).toBe(false);
    }
  });

  it("treats a blank handle as 'leave it', never as removing it", () => {
    expect(normaliseDeveloperSelfDetails({ githubHandle: "" })).toEqual({ ok: true, value: {} });
    expect(normaliseDeveloperSelfDetails({ githubHandle: null })).toEqual({ ok: true, value: {} });
  });

  it("tidies stacks and links", () => {
    const r = normaliseDeveloperSelfDetails({ techStacks: [" Node ", "node", "", "Postgres"], linkedinUrl: "linkedin.com/in/x", portfolioUrl: "" });
    expect(r).toEqual({ ok: true, value: { techStacks: ["Node", "Postgres"], linkedinUrl: "https://linkedin.com/in/x", portfolioUrl: null } });
    expect(normaliseDeveloperSelfDetails({ linkedinUrl: "not a link" }).ok).toBe(false);
  });

  it("names what's still missing", () => {
    expect(missingDeveloperDetails({ githubHandle: null, primaryStack: "" })).toEqual(["GitHub handle", "main stack"]);
    expect(missingDeveloperDetails({ githubHandle: "x", primaryStack: "Flutter" })).toEqual([]);
  });
});

describe("updateOwnDeveloperDetails", () => {
  it("saves to their own record", async () => {
    const saved = await updateOwnDeveloperDetails("w1", "m1", { githubHandle: "@abdullah-f", primaryStack: "Flutter" });
    expect(db.update?.where).toEqual({ id: "r1" });
    expect(db.update?.data).toMatchObject({ githubHandle: "abdullah-f", primaryStack: "Flutter" });
    expect(saved.githubHandle).toBe("abdullah-f");
  });

  it("refuses someone who isn't marked as a developer", async () => {
    db.record.isDeveloper = false;
    await expect(updateOwnDeveloperDetails("w1", "m1", { githubHandle: "me" })).rejects.toMatchObject({ status: 403 });
    expect(db.update).toBeNull();
  });

  it("refuses someone with no Staff record", async () => {
    db.ownRecordId = null;
    await expect(updateOwnDeveloperDetails("w1", "m1", { primaryStack: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("says plainly when the handle is already someone else's", async () => {
    db.updateError = { code: "P2002" };
    await expect(updateOwnDeveloperDetails("w1", "m1", { githubHandle: "taken" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("applyInviteDeveloperFlag", () => {
  it("does nothing for an invite that isn't a developer's", async () => {
    await applyInviteDeveloperFlag({ isDeveloper: false, workspaceId: "w1" }, "m1");
    expect(db.created).toEqual([]);
    expect(db.marked).toEqual([]);
  });

  it("makes a marked record for a developer joining with none", async () => {
    await applyInviteDeveloperFlag({ isDeveloper: true, workspaceId: "w1" }, "m1");
    expect(db.created[0]).toMatchObject({ memberId: "m1", isDeveloper: true });
    expect(db.marked).toEqual(["new-record"]);
  });

  it("marks the record they already have rather than making a second", async () => {
    db.memberHasRecord = true;
    await applyInviteDeveloperFlag({ isDeveloper: true, workspaceId: "w1" }, "m1");
    expect(db.created).toEqual([]);
    expect(db.marked).toEqual(["existing"]);
  });

  it("never stops someone joining when it fails", async () => {
    db.failCreate = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(applyInviteDeveloperFlag({ isDeveloper: true, workspaceId: "w1" }, "m1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
