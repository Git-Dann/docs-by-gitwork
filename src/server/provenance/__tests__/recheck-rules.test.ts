import { describe, expect, it } from "vitest";
import {
  MAX_FAILURE_STREAK,
  MAX_POLLS,
  MAX_RECHECKS_PER_DAY,
  decideRecheck,
  nextDueAt,
  pauseReason,
  recheckHeadline,
  withinDailyCap,
} from "../recheck-rules";

const DAY = 86_400_000;
const now = new Date("2026-11-18T09:00:00Z");
const issuedAt = new Date("2026-11-01T09:00:00Z");
const certified = { issuedAt, expiresAt: new Date(issuedAt.getTime() + 90 * DAY) };
const conditional = { issuedAt, expiresAt: new Date(issuedAt.getTime() + 30 * DAY) };

describe("nextDueAt — when a kept-current mark is re-examined", () => {
  it("defaults to the start of the 14-day notice window", () => {
    expect(nextDueAt(certified, null, now).toISOString()).toBe(
      new Date(certified.expiresAt.getTime() - 14 * DAY).toISOString(),
    );
  });

  it("uses the cadence when it comes first", () => {
    expect(nextDueAt(certified, 30, now).toISOString()).toBe(new Date(issuedAt.getTime() + 30 * DAY).toISOString());
  });

  it("never waits past the notice window, however long the cadence", () => {
    // A 90-day cadence on a 30-day mark would otherwise re-examine 60 days after it lapsed.
    expect(nextDueAt(conditional, 90, issuedAt).toISOString()).toBe(
      new Date(conditional.expiresAt.getTime() - 14 * DAY).toISOString(),
    );
  });

  it("a date already past is due now, not in the past", () => {
    const old = { issuedAt: new Date(now.getTime() - 100 * DAY), expiresAt: new Date(now.getTime() - 10 * DAY) };
    expect(nextDueAt(old, null, now).toISOString()).toBe(now.toISOString());
  });
});

describe("decideRecheck — a successor only from evidence that establishes a grade", () => {
  it("waits while the scan runs", () => {
    expect(decideRecheck({ scanStatus: "RUNNING", polls: 3 }).kind).toBe("wait");
  });

  it("gives up after the poll ceiling instead of polling forever", () => {
    expect(decideRecheck({ scanStatus: "RUNNING", polls: MAX_POLLS }).kind).toBe("failed");
  });

  it("a failed scan fails, with the scan's own reason", () => {
    const d = decideRecheck({ scanStatus: "FAILED", scanError: "Repo not reachable", polls: 1 });
    expect(d).toEqual({ kind: "failed", reason: expect.stringContaining("Repo not reachable") });
  });

  it("a missing scan fails rather than counting as clean", () => {
    expect(decideRecheck({ scanStatus: null, polls: 0 }).kind).toBe("failed");
  });

  it("an INCOMPLETE examination is not established, so the old mark is kept", () => {
    expect(decideRecheck({ scanStatus: "COMPLETED", polls: 2, grade: "INCOMPLETE" }).kind).toBe("not_established");
  });

  it("a completed scan with a worse grade IS struck", () => {
    expect(decideRecheck({ scanStatus: "COMPLETED", polls: 2, grade: "NOT_CERTIFIED" }).kind).toBe("issue");
    expect(decideRecheck({ scanStatus: "COMPLETED", polls: 2, grade: "CERTIFIED" }).kind).toBe("issue");
  });
});

describe("pauseReason — re-examining is issuing", () => {
  const base = { issuerName: "Siân", mark: { revokedAt: null }, failureStreak: 0 };

  it("runs for an active issuer who can still issue", () => {
    expect(pauseReason({ ...base, issuer: { active: true, canIssue: true } })).toBeNull();
  });

  it("pauses when the issuer is no longer a member", () => {
    expect(pauseReason({ ...base, issuer: null })).toMatch(/no longer an active member/);
  });

  it("pauses when the issuer lost provenance.issue", () => {
    expect(pauseReason({ ...base, issuer: { active: true, canIssue: false } })).toMatch(/can no longer issue/);
  });

  it("pauses on a revoked mark: a withdrawal is never re-examined back into force", () => {
    expect(pauseReason({ ...base, mark: { revokedAt: now }, issuer: { active: true, canIssue: true } })).toMatch(/revoked/);
  });

  it("stops after repeated failures", () => {
    expect(
      pauseReason({ ...base, failureStreak: MAX_FAILURE_STREAK, issuer: { active: true, canIssue: true } }),
    ).toMatch(/stopped trying/);
  });
});

describe("withinDailyCap", () => {
  it("allows up to the cap and no further", () => {
    expect(withinDailyCap(MAX_RECHECKS_PER_DAY - 1)).toBe(true);
    expect(withinDailyCap(MAX_RECHECKS_PER_DAY)).toBe(false);
  });
});

describe("recheckHeadline", () => {
  it("names a grade change", () => {
    expect(
      recheckHeadline({ subjectName: "Fellas", outcome: "issued", gradeBefore: "CERTIFIED", gradeAfter: "CONDITIONAL" }),
    ).toBe("Fellas re-examined: Certified → Conditional");
  });
  it("says the current mark stands on a failure", () => {
    expect(recheckHeadline({ subjectName: "Fellas", outcome: "failed", gradeBefore: "CERTIFIED" })).toMatch(
      /current mark still stands/,
    );
  });
});
