/**
 * Backstage → Me (docs/hr-platform.md, Phase 1c): a person finds, or sets up, their OWN
 * Staff record — never anyone else's, and never twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  candidate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  workspaceMember: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { createOwnStaffRecord, getOwnStaffRecordId } from "@/server/staff";

beforeEach(() => {
  vi.resetAllMocks();
  db.candidate.findMany.mockResolvedValue([]);
  db.workspaceMember.findMany.mockResolvedValue([]);
});

describe("getOwnStaffRecordId", () => {
  it("looks only in the caller's workspace, by their own membership", async () => {
    db.candidate.findFirst.mockResolvedValue({ id: "r1" });
    expect(await getOwnStaffRecordId("w1", "m1")).toBe("r1");
    expect(db.candidate.findFirst.mock.calls[0][0].where).toEqual({ workspaceId: "w1", memberId: "m1" });
  });

  it("links a record HR already made with their email before looking, so Me finds it", async () => {
    db.candidate.findMany.mockResolvedValue([{ id: "r9", email: "sian@gitwork.co.uk", memberId: null }]);
    db.workspaceMember.findMany.mockResolvedValue([{ id: "m1", user: { email: "Sian@gitwork.co.uk" } }]);
    db.candidate.findFirst.mockResolvedValue({ id: "r9" });
    await getOwnStaffRecordId("w1", "m1");
    expect(db.candidate.updateMany).toHaveBeenCalledWith({ where: { id: "r9", memberId: null }, data: { memberId: "m1" } });
  });

  it("returns null when there is no record", async () => {
    db.candidate.findFirst.mockResolvedValue(null);
    expect(await getOwnStaffRecordId("w1", "m1")).toBeNull();
  });
});

describe("createOwnStaffRecord", () => {
  it("returns the existing record instead of making a second", async () => {
    db.candidate.findFirst.mockResolvedValue({ id: "r1" });
    expect(await createOwnStaffRecord("w1", "m1")).toEqual({ recordId: "r1" });
    expect(db.candidate.create).not.toHaveBeenCalled();
  });

  it("creates a record for an active member, linked to them, holding only name and email", async () => {
    db.candidate.findFirst.mockResolvedValue(null);
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m1", user: { name: " Siân ", email: "sian@gitwork.co.uk", avatarUrl: null } });
    db.candidate.create.mockResolvedValue({ id: "new" });
    expect(await createOwnStaffRecord("w1", "m1")).toEqual({ recordId: "new" });
    const data = db.candidate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ workspaceId: "w1", memberId: "m1", name: "Siân", email: "sian@gitwork.co.uk", origin: "INTERNAL" });
    expect(data).not.toHaveProperty("employmentType");
    // The membership lookup is the caller's own, in the caller's workspace, and active only.
    const where = db.workspaceMember.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "m1", workspaceId: "w1", archivedAt: null });
  });

  it("refuses an archived or foreign membership", async () => {
    db.candidate.findFirst.mockResolvedValue(null);
    db.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(createOwnStaffRecord("w1", "m1")).rejects.toThrow(/not an active member/);
    expect(db.candidate.create).not.toHaveBeenCalled();
  });

  it("a second click that loses the race gets the winner's record, not an error", async () => {
    db.candidate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner" });
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m1", user: { name: "Siân", email: "s@x.co", avatarUrl: null } });
    db.candidate.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    expect(await createOwnStaffRecord("w1", "m1")).toEqual({ recordId: "winner" });
  });

  it("any other failure still surfaces", async () => {
    db.candidate.findFirst.mockResolvedValue(null);
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m1", user: { name: "Siân", email: "s@x.co", avatarUrl: null } });
    db.candidate.create.mockRejectedValue(new Error("db down"));
    await expect(createOwnStaffRecord("w1", "m1")).rejects.toThrow("db down");
  });
});
