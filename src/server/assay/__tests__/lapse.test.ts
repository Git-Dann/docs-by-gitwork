import { describe, expect, it } from "vitest";
import {
  EXPIRY_NOTICE_DAYS,
  daysUntil,
  expiryFor,
  hallmarkStatus,
  isAsserting,
  validityDaysFor,
} from "../lapse";
import { SAS_1 } from "../standard";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("validity windows", () => {
  it("gives a clean mark the long window and a conditional one the short window", () => {
    expect(validityDaysFor(SAS_1.id, "CERTIFIED")).toBe(SAS_1.validityDays.certified);
    expect(validityDaysFor(SAS_1.id, "CONDITIONAL")).toBe(SAS_1.validityDays.conditional);
  });

  it("gives failed and incomplete marks the short window too — they still need to be citable", () => {
    expect(validityDaysFor(SAS_1.id, "NOT_CERTIFIED")).toBe(SAS_1.validityDays.conditional);
    expect(validityDaysFor(SAS_1.id, "INCOMPLETE")).toBe(SAS_1.validityDays.conditional);
  });

  it("returns null for an unknown standard rather than inventing a window", () => {
    expect(validityDaysFor("NOPE-9", "CERTIFIED")).toBeNull();
  });

  it("computes expiry from the issue date", () => {
    expect(expiryFor(NOW, SAS_1.id, "CERTIFIED").toISOString()).toBe(days(SAS_1.validityDays.certified).toISOString());
  });
});

describe("daysUntil", () => {
  it("rounds up so a mark with hours left does not read as expired", () => {
    expect(daysUntil(new Date(NOW.getTime() + 6 * 3_600_000), NOW)).toBe(1);
  });

  it("is zero exactly at expiry and negative after", () => {
    expect(daysUntil(NOW, NOW)).toBe(0);
    expect(daysUntil(days(-3), NOW)).toBe(-3);
  });
});

describe("hallmarkStatus", () => {
  const base = { revokedAt: null, supersededById: null };

  it("is VALID well before expiry", () => {
    expect(hallmarkStatus({ ...base, expiresAt: days(60) }, NOW).status).toBe("VALID");
  });

  it("is EXPIRING inside the notice window", () => {
    expect(hallmarkStatus({ ...base, expiresAt: days(EXPIRY_NOTICE_DAYS) }, NOW).status).toBe("EXPIRING");
    expect(hallmarkStatus({ ...base, expiresAt: days(1) }, NOW).status).toBe("EXPIRING");
  });

  it("is LAPSED at and after expiry", () => {
    expect(hallmarkStatus({ ...base, expiresAt: NOW }, NOW).status).toBe("LAPSED");
    expect(hallmarkStatus({ ...base, expiresAt: days(-1) }, NOW).status).toBe("LAPSED");
  });

  it("reports REVOKED even once the mark would also have lapsed", () => {
    // Precedence matters: "we withdrew this" outranks "it would have run out anyway" for
    // anyone who relied on it. Collapsing the two lets a withdrawn mark read as merely stale.
    const s = hallmarkStatus({ expiresAt: days(-40), revokedAt: days(-50), supersededById: null }, NOW);
    expect(s.status).toBe("REVOKED");
  });

  it("reports REVOKED ahead of SUPERSEDED", () => {
    const s = hallmarkStatus({ expiresAt: days(30), revokedAt: days(-1), supersededById: "h2" }, NOW);
    expect(s.status).toBe("REVOKED");
  });

  it("reports SUPERSEDED while still inside its window", () => {
    const s = hallmarkStatus({ expiresAt: days(30), revokedAt: null, supersededById: "h2" }, NOW);
    expect(s.status).toBe("SUPERSEDED");
  });

  it("carries daysRemaining through every status", () => {
    expect(hallmarkStatus({ ...base, expiresAt: days(5) }, NOW).daysRemaining).toBe(5);
    expect(hallmarkStatus({ ...base, expiresAt: days(-5) }, NOW).daysRemaining).toBe(-5);
  });
});

describe("isAsserting", () => {
  it("is true only while the mark actually stands", () => {
    expect(isAsserting("VALID")).toBe(true);
    expect(isAsserting("EXPIRING")).toBe(true);
    for (const s of ["LAPSED", "REVOKED", "SUPERSEDED"] as const) {
      expect(isAsserting(s), s).toBe(false);
    }
  });
});
