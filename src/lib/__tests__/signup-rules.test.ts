import { describe, expect, it } from "vitest";
import { isPasswordLoginAllowed } from "@/types/auth";
import { inviteRefusal, inviteRole } from "@/lib/invite-rules";
import { businessSlug, planNewBusiness, PlatformInputError } from "@/lib/platform-rules";

describe("who may sign in with a password", () => {
  it("in Gitwork's workspace, only guests", () => {
    expect(isPasswordLoginAllowed("GUEST", "gitwork")).toBe(true);
    for (const role of ["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER"]) {
      expect(isPasswordLoginAllowed(role, "gitwork")).toBe(false);
    }
  });

  it("with no workspace known, only guests (the safe default)", () => {
    expect(isPasswordLoginAllowed("ADMIN")).toBe(false);
    expect(isPasswordLoginAllowed("ADMIN", null)).toBe(false);
    expect(isPasswordLoginAllowed("GUEST")).toBe(true);
  });

  it("in another business, every real role", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER", "GUEST"]) {
      expect(isPasswordLoginAllowed(role, "canary-ltd")).toBe(true);
    }
  });

  it("never an unknown role", () => {
    expect(isPasswordLoginAllowed("OWNER", "canary-ltd")).toBe(false);
    expect(isPasswordLoginAllowed("", "canary-ltd")).toBe(false);
    expect(isPasswordLoginAllowed(null, "canary-ltd")).toBe(false);
  });
});

describe("invites", () => {
  const pending = { status: "PENDING", expiresAt: null, email: null, role: null };

  it("an open invite can be accepted by anyone with the link, as before", () => {
    expect(inviteRefusal(pending, "anyone@x.test")).toBeNull();
    expect(inviteRefusal(pending, null)).toBeNull();
  });

  it("an addressed invite only by that address (case and spaces ignored)", () => {
    const addressed = { ...pending, email: "Owner@Canary.test" };
    expect(inviteRefusal(addressed, " owner@canary.test ")).toBeNull();
    expect(inviteRefusal(addressed, "someone@canary.test")).toBe("wrong_email");
    expect(inviteRefusal(addressed, null)).toBe("wrong_email");
  });

  it("not once used, withdrawn or expired", () => {
    expect(inviteRefusal({ ...pending, status: "ACCEPTED" }, null)).toBe("not_pending");
    expect(inviteRefusal({ ...pending, status: "REVOKED" }, null)).toBe("not_pending");
    expect(inviteRefusal({ ...pending, expiresAt: new Date(Date.now() - 1000) }, null)).toBe("expired");
    expect(inviteRefusal({ ...pending, expiresAt: new Date(Date.now() + 60_000) }, null)).toBeNull();
  });

  it("grants its role, or the minimal default", () => {
    expect(inviteRole({ role: "SUPER_ADMIN" })).toBe("SUPER_ADMIN");
    expect(inviteRole({ role: null })).toBe("DEVELOPER");
    expect(inviteRole({ role: "OWNER" })).toBe("DEVELOPER");
  });
});

describe("a new business", () => {
  it("gets a tidy slug", () => {
    expect(businessSlug("Canary & Co. Ltd")).toBe("canary-and-co-ltd");
    expect(businessSlug("Café Rouge")).toBe("cafe-rouge");
    expect(businessSlug("!!")).toBe("business");
  });

  it("can never take Gitwork's slug or Foundry's words", () => {
    expect(businessSlug("Gitwork")).toBe("gitwork-business");
    expect(businessSlug("Foundry")).toBe("foundry-business");
  });

  it("needs a name and an owner's email", () => {
    expect(() => planNewBusiness({ name: "A", ownerEmail: "a@b.co" })).toThrow(PlatformInputError);
    expect(() => planNewBusiness({ name: "Canary", ownerEmail: "not-an-email" })).toThrow(PlatformInputError);
    expect(planNewBusiness({ name: "  Canary   Ltd ", ownerEmail: " Owner@Canary.TEST ", ownerName: " Jo " })).toEqual({
      name: "Canary Ltd",
      slug: "canary-ltd",
      ownerEmail: "owner@canary.test",
      ownerName: "Jo",
    });
  });
});
