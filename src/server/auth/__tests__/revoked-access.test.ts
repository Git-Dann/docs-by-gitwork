import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bug this file exists for: a removed member came back with MORE access than
 * they had before.
 *
 * They had a valid `@gitwork.co.uk` sign-in but no membership. That threw
 * `UnauthorizedError`, `getEffectiveUserOrNull` mapped it to `null`, and `null` is
 * how a trusted workspace-API-key integration is represented — `assertCan(null)`
 * passes, `requireAuthedUserOrDefault` resolves it as the workspace owner. These
 * tests run the real resolution code against a mocked database and session.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id?: string; email?: string } },
  dbUser: null as unknown,
  throwOnLookup: null as Error | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => state.session) }));
vi.mock("@/server/auth/request-user", () => ({ getRequestUser: vi.fn(() => null) }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn() }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/lib/templates", () => ({ allowedDocTypes: vi.fn(() => []) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async () => {
        if (state.throwOnLookup) throw state.throwOnLookup;
        return state.dbUser;
      }),
    },
    workspaceMember: { findFirst: vi.fn(async () => null) },
  },
}));

import {
  RevokedAccessError,
  UnauthorizedError,
  assertCan,
  getEffectiveUserOrNull,
  requireAuthedUser,
} from "../effective-user";

const req = () => new Request("https://foundry.test/api/x");

function member(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    role: "STAFF",
    workspaceId: "w1",
    permissionOverrides: {},
    archivedAt: null,
    workspace: { rolePermissions: null },
    ...over,
  };
}

beforeEach(() => {
  state.session = { user: { id: "u1", email: "leaver@gitwork.co.uk" } };
  state.dbUser = { id: "u1", email: "leaver@gitwork.co.uk", name: "Leaver", avatarUrl: null, memberships: [member()] };
  state.throwOnLookup = null;
});

describe("an active member resolves normally", () => {
  it("returns the effective user", async () => {
    const user = await requireAuthedUser(req());
    expect(user.id).toBe("u1");
    expect(user.role).toBe("STAFF");
  });
});

describe("an identity we resolved and refused is NOT 'no identity'", () => {
  it("refuses an archived member with a 403, not a 401", async () => {
    state.dbUser = { ...(state.dbUser as object), memberships: [member({ archivedAt: new Date() })] };
    await expect(requireAuthedUser(req())).rejects.toBeInstanceOf(RevokedAccessError);
  });

  it("refuses a member with no membership row (removed before archiving existed)", async () => {
    state.dbUser = { ...(state.dbUser as object), memberships: [] };
    await expect(requireAuthedUser(req())).rejects.toBeInstanceOf(RevokedAccessError);
  });

  it("refuses a session whose user no longer exists", async () => {
    state.dbUser = null;
    await expect(requireAuthedUser(req())).rejects.toBeInstanceOf(RevokedAccessError);
  });
});

describe("getEffectiveUserOrNull — the escalation", () => {
  it("does NOT turn an archived member into null (the trusted-caller value)", async () => {
    state.dbUser = { ...(state.dbUser as object), memberships: [member({ archivedAt: new Date() })] };
    await expect(getEffectiveUserOrNull(req())).rejects.toBeInstanceOf(RevokedAccessError);
  });

  it("does NOT turn a removed member into null", async () => {
    state.dbUser = { ...(state.dbUser as object), memberships: [] };
    await expect(getEffectiveUserOrNull(req())).rejects.toBeInstanceOf(RevokedAccessError);
  });

  it("still returns null when there is genuinely no identity (API-key integrations)", async () => {
    state.session = null;
    await expect(getEffectiveUserOrNull(req())).resolves.toBeNull();
  });

  it("fails CLOSED on a database error rather than granting trust", async () => {
    // A bare `catch { return null }` used to turn any lookup failure into full access.
    state.throwOnLookup = new Error("connection reset");
    await expect(getEffectiveUserOrNull(req())).rejects.toThrow("connection reset");
  });

  it("and the reason it matters: assertCan(null) passes", () => {
    // Pinned so the consequence of mapping a refused identity to null stays visible.
    expect(() => assertCan(null, () => false, "do anything")).not.toThrow();
  });

  it("UnauthorizedError is still the no-identity signal", async () => {
    state.session = null;
    await expect(requireAuthedUser(req())).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
