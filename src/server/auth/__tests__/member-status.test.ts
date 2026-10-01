import { describe, expect, it } from "vitest";
import {
  ACTIVE_MEMBER,
  ARCHIVE_RETENTION_DAYS,
  canRestore,
  daysUntilPurge,
  isActiveMember,
  memberStatus,
  purgeAt,
  purgeCutoff,
} from "../member-status";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-01T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("member lifecycle", () => {
  it("retains for 30 days", () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
  });

  it("an unarchived member is active and has no purge date", () => {
    expect(memberStatus({ archivedAt: null }, now)).toBe("active");
    expect(isActiveMember({ archivedAt: null })).toBe(true);
    expect(purgeAt({ archivedAt: null })).toBeNull();
    expect(daysUntilPurge({ archivedAt: null }, now)).toBeNull();
  });

  it("archived yesterday: archived, 29 days left, restorable", () => {
    const m = { archivedAt: ago(1) };
    expect(memberStatus(m, now)).toBe("archived");
    expect(daysUntilPurge(m, now)).toBe(29);
    expect(canRestore(m, now)).toBe(true);
    expect(isActiveMember(m)).toBe(false);
  });

  it("archived exactly 30 days ago is expired — not restorable", () => {
    const m = { archivedAt: ago(30) };
    expect(memberStatus(m, now)).toBe("expired");
    expect(canRestore(m, now)).toBe(false);
    expect(daysUntilPurge(m, now)).toBe(0);
  });

  it("expired is still NOT active, even if the purge job has not run", () => {
    // The purge job is a tidy-up. If it never runs, nobody regains access.
    expect(isActiveMember({ archivedAt: ago(400) })).toBe(false);
    expect(canRestore({ archivedAt: ago(400) }, now)).toBe(false);
  });

  it("accepts the ISO string a DTO carries", () => {
    expect(memberStatus({ archivedAt: ago(2).toISOString() }, now)).toBe("archived");
  });

  it("fails CLOSED on an unparseable archive date — no access, not restorable", () => {
    // An access check must never read "I can't tell when you were archived" as
    // "you were never archived".
    expect(isActiveMember({ archivedAt: "not a date" })).toBe(false);
    expect(memberStatus({ archivedAt: "not a date" }, now)).toBe("expired");
    expect(canRestore({ archivedAt: "not a date" }, now)).toBe(false);
  });

  it("the purge cutoff is 30 days before now", () => {
    expect(purgeCutoff(now).getTime()).toBe(now.getTime() - 30 * DAY);
  });

  it("the roster fragment excludes archived rows", () => {
    expect(ACTIVE_MEMBER).toEqual({ archivedAt: null });
  });
});
