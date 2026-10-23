import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeDigest } from "../digest";
import { buildPayload, scanCommit } from "../issue";

const SHA = "a40007e7cfbb124579de5445a897a0effb0242fa";

describe("scanCommit", () => {
  it("reads the commit the code-health measure checked out", () => {
    expect(scanCommit({ codeHealth: { commit: SHA } })).toBe(SHA);
  });

  it("is null when there is no measured commit, never a guess", () => {
    expect(scanCommit(null)).toBeNull();
    expect(scanCommit({})).toBeNull();
    expect(scanCommit({ codeHealth: null })).toBeNull();
    expect(scanCommit({ codeHealth: { commit: null } })).toBeNull();
  });

  it("refuses anything that is not a full commit id", () => {
    expect(scanCommit({ codeHealth: { commit: "a40007e" } })).toBeNull();
    expect(scanCommit({ codeHealth: { commit: "main" } })).toBeNull();
    expect(scanCommit({ codeHealth: { commit: SHA.toUpperCase() } })).toBeNull();
    expect(scanCommit({ codeHealth: { commit: `${SHA}\n` } })).toBeNull();
  });
});

describe("the commit is part of what is sealed", () => {
  const base = {
    countermarkId: "cm_1", issuedAt: new Date("2026-10-23T12:00:00Z"), expiresAt: new Date("2027-01-21T12:00:00Z"),
    issuerName: "Gitwork", subjectName: "Acme", subjectRepo: "acme/app", subjectUrl: null,
    standardId: "SAS-1", standardVersion: "1.1.0", grade: "CERTIFIED" as const, clauses: [], blindSpots: [],
    scanId: "scan_1", scanVersion: "2.0", checkCount: 100,
  };

  it("so a mark cannot be re-pointed at another version without breaking its digest", () => {
    const pinned = computeDigest(buildPayload({ ...base, subjectCommit: SHA }));
    const other = computeDigest(buildPayload({ ...base, subjectCommit: "b".repeat(40) }));
    const unpinned = computeDigest(buildPayload({ ...base, subjectCommit: null }));
    expect(new Set([pinned, other, unpinned]).size).toBe(3);
  });
});
