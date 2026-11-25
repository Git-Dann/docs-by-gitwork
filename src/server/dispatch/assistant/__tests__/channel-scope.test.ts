import { describe, expect, it, vi } from "vitest";
import { allowedDocTypes } from "@/lib/templates";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class extends Error {},
  canViewCosts: () => true,
  canViewRates: () => true,
  canViewClientFinancials: () => true,
}));

const { forChannel } = await import("../scope");

describe("forChannel", () => {
  it("drops figures and admin-only document types for an answer posted in a channel", () => {
    const admin = {
      user: { id: "u1" },
      client: { id: "c1", name: "Wedge", slug: "wedge" },
      surface: "slack",
      canSeeMoney: true,
      isAdmin: true,
      documentTypes: allowedDocTypes(true),
    } as unknown as Parameters<typeof forChannel>[0];
    const narrowed = forChannel(admin);
    expect(narrowed.canSeeMoney).toBe(false);
    expect(narrowed.documentTypes).toEqual(allowedDocTypes(false));
    expect(narrowed.documentTypes.length).toBeLessThan(admin.documentTypes.length);
    // The asker and client are unchanged: only what may be shown narrows.
    expect(narrowed.user).toBe(admin.user);
    expect(narrowed.client).toBe(admin.client);
  });
});
