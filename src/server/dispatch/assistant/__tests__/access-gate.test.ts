import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { workspace: { findUnique } } }));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class extends Error {},
  canViewCosts: () => false,
  canViewRates: () => false,
  canViewClientFinancials: () => false,
}));

const { assistantAvailable } = await import("../access-gate");

const dev = {
  id: "nasir",
  email: "n@x.test",
  name: "Nasir",
  avatarUrl: null,
  role: "DEVELOPER",
  permissions: ["clients", "dispatch.use"],
  workspaceId: "ws",
  membershipId: "m",
};

describe("assistantAvailable", () => {
  beforeEach(() => findUnique.mockReset());

  it("is off for a developer until the workspace switches it on", async () => {
    findUnique.mockResolvedValue({ dispatchConfig: {} });
    expect(await assistantAvailable(dev)).toBe(false);
    findUnique.mockResolvedValue({ dispatchConfig: { assistantEnabled: true } });
    expect(await assistantAvailable(dev)).toBe(true);
  });

  it("lets a Super Admin previewing as that developer try it before the switch", async () => {
    findUnique.mockResolvedValue({ dispatchConfig: {} });
    expect(await assistantAvailable({ ...dev, previewedBy: "dan" })).toBe(true);
  });

  it("never for someone without the permission, preview or not", async () => {
    findUnique.mockResolvedValue({ dispatchConfig: { assistantEnabled: true } });
    const guest = { ...dev, role: "GUEST", permissions: ["clients"] };
    expect(await assistantAvailable(guest)).toBe(false);
    expect(await assistantAvailable({ ...guest, previewedBy: "dan" })).toBe(false);
  });
});
