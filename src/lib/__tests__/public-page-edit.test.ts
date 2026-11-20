import { describe, expect, it } from "vitest";
import { canEditPublicPage } from "@/lib/hr";

describe("canEditPublicPage", () => {
  it("lets anyone edit their own page, whatever their role", () => {
    for (const role of ["GUEST", "DEVELOPER", "STAFF", "ADMIN", "SUPER_ADMIN"]) {
      expect(canEditPublicPage({ relation: "self", actorRole: role, targetRole: role })).toBe(true);
    }
  });

  it("never lets a non-admin edit someone else's page, even their report's", () => {
    for (const role of ["GUEST", "DEVELOPER", "STAFF"]) {
      expect(canEditPublicPage({ relation: "other", actorRole: role, targetRole: "DEVELOPER" })).toBe(false);
      expect(canEditPublicPage({ relation: "manager", actorRole: role, targetRole: "DEVELOPER" })).toBe(false);
    }
  });

  it("lets an Admin edit pages below their rank, not an Admin's or a Super Admin's", () => {
    expect(canEditPublicPage({ relation: "other", actorRole: "ADMIN", targetRole: "STAFF" })).toBe(true);
    expect(canEditPublicPage({ relation: "other", actorRole: "ADMIN", targetRole: "DEVELOPER" })).toBe(true);
    expect(canEditPublicPage({ relation: "other", actorRole: "ADMIN", targetRole: "ADMIN" })).toBe(false);
    expect(canEditPublicPage({ relation: "other", actorRole: "ADMIN", targetRole: "SUPER_ADMIN" })).toBe(false);
  });

  it("lets a Super Admin edit anyone's, including another Super Admin's", () => {
    expect(canEditPublicPage({ relation: "other", actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN" })).toBe(true);
    expect(canEditPublicPage({ relation: "other", actorRole: "SUPER_ADMIN", targetRole: "ADMIN" })).toBe(true);
  });

  it("lets an Admin edit a record with no login", () => {
    expect(canEditPublicPage({ relation: "other", actorRole: "ADMIN", targetRole: null })).toBe(true);
  });
});
