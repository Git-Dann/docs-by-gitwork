import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown>, manage: false }));
vi.mock("@/server/auth/effective-user", async (orig) => {
  const real = await orig<typeof import("@/server/auth/effective-user")>();
  return {
    ...real,
    getEffectiveUserOrNull: async () => current.user,
    canManageClients: () => current.manage,
  };
});
vi.mock("@/server/client-assignments", () => ({ assertClientAccessBySlug: async () => {} }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: async () => ({ workspace: { id: "ws" } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceClient: { findUnique: async () => ({ id: "c1" }) } } }));
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/server/wiki", () => ({ resolvePublicWiki: async () => null }));

import { resolveInternalSheets } from "@/server/wiki-sheets-access";

const req = new Request("http://x");
const as = (role: string, manage = false) => {
  current.user = { id: "u", role, name: "N", email: "n@x" };
  current.manage = manage;
};

describe("who may change a sheet from the team side", () => {
  beforeEach(() => as("DEVELOPER"));

  it("⚠️ a developer can send rows to the board without 'Manage clients' (Nasir)", async () => {
    await expect(resolveInternalSheets(req, "wedge", "change rows", "rows")).resolves.toMatchObject({ clientId: "c1" });
  });

  it("a developer still cannot change the sheet's structure", async () => {
    await expect(resolveInternalSheets(req, "wedge", "add a column")).rejects.toThrow(/permission to add a column/);
  });

  it("someone with 'Manage clients' can do both", async () => {
    as("STAFF", true);
    await expect(resolveInternalSheets(req, "wedge", "add a column")).resolves.toBeTruthy();
  });

  it("⚠️ a client guest never gets the team's row access — it skips their column locks", async () => {
    as("GUEST");
    await expect(resolveInternalSheets(req, "wedge", "change rows", "rows")).rejects.toThrow(/permission to change rows/);
  });
});
