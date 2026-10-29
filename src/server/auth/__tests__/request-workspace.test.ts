import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2, shadow mode (docs/multi-tenant-roadmap.md). The workspace in a caller's token
 * is compared with the one they are served, and NEVER used to serve them. These tests
 * pin both halves: the comparison is counted correctly, and the answer does not change.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id?: string; email?: string; workspaceId?: string | null } },
  mobile: null as null | { id: string; email: string; role: string; workspaceId: string | null },
  dbUser: null as unknown,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => state.session) }));
vi.mock("@/server/auth/request-user", () => ({ getRequestUser: vi.fn(() => state.mobile) }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn() }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/lib/templates", () => ({ allowedDocTypes: vi.fn(() => []) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(async () => state.dbUser) },
    workspaceMember: { findFirst: vi.fn(async () => null) },
  },
}));

import { requireAuthedUser } from "../effective-user";
import { compareWorkspace, resetWorkspaceShadow, workspaceShadowStats } from "../request-workspace";
import { signMobileToken, verifyMobileToken } from "../mobile-jwt";

const req = () => new Request("https://foundry.test/api/x");

beforeEach(() => {
  resetWorkspaceShadow();
  state.mobile = null;
  state.session = { user: { id: "u1", email: "dan@gitwork.co.uk" } };
  state.dbUser = {
    id: "u1",
    email: "dan@gitwork.co.uk",
    name: "Dan",
    avatarUrl: null,
    memberships: [
      { id: "m1", role: "STAFF", workspaceId: "ws-gitwork", permissionOverrides: {}, archivedAt: null, workspace: { rolePermissions: null } },
    ],
  };
});

describe("compareWorkspace", () => {
  it("tells 'no claim' apart from a disagreement", () => {
    expect(compareWorkspace(null, "a")).toBe("no-claim");
    expect(compareWorkspace(undefined, "a")).toBe("no-claim");
    expect(compareWorkspace("", "a")).toBe("no-claim");
    expect(compareWorkspace("a", "a")).toBe("agrees");
    expect(compareWorkspace("b", "a")).toBe("mismatch");
  });
});

describe("requireAuthedUser in shadow mode", () => {
  it("counts a session from before the claim existed, and serves it as before", async () => {
    const user = await requireAuthedUser(req());
    expect(user.workspaceId).toBe("ws-gitwork");
    expect(workspaceShadowStats()).toMatchObject({ checked: 1, withoutClaim: 1, withClaim: 0, mismatches: 0 });
  });

  it("counts an agreeing session claim", async () => {
    state.session = { user: { id: "u1", workspaceId: "ws-gitwork" } };
    await requireAuthedUser(req());
    expect(workspaceShadowStats()).toMatchObject({ checked: 1, withClaim: 1, mismatches: 0 });
  });

  it("records a disagreement but still serves the OLD answer", async () => {
    state.session = { user: { id: "u1", workspaceId: "ws-other" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = await requireAuthedUser(req());
    expect(user.workspaceId).toBe("ws-gitwork"); // never the claimed one
    const stats = workspaceShadowStats();
    expect(stats.mismatches).toBe(1);
    expect(stats.recent[0]).toMatchObject({ userId: "u1", claimed: "ws-other", served: "ws-gitwork", via: "session" });
    // Logged once per (user, claimed, served), not once per request.
    await requireAuthedUser(req());
    expect(workspaceShadowStats().mismatches).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("reads the mobile token's claim on the mobile path", async () => {
    state.session = null;
    state.mobile = { id: "u1", email: "dan@gitwork.co.uk", role: "STAFF", workspaceId: "ws-gitwork" };
    await requireAuthedUser(req());
    expect(workspaceShadowStats()).toMatchObject({ withClaim: 1, mismatches: 0 });
  });
});

describe("the mobile token carries the workspace, and old tokens still verify", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-for-mobile-jwt-1234567890";
  });

  it("round-trips the workspace claim", async () => {
    const token = await signMobileToken({ sub: "u1", email: "a@b.co", role: "STAFF", permissions: [], workspaceId: "ws-1" });
    expect((await verifyMobileToken(token)).workspaceId).toBe("ws-1");
  });

  it("a token issued without one (every token already on a phone) verifies, with no workspace", async () => {
    const token = await signMobileToken({ sub: "u1", email: "a@b.co", role: "STAFF", permissions: ["x"] });
    const claims = await verifyMobileToken(token);
    expect(claims).toMatchObject({ sub: "u1", email: "a@b.co", role: "STAFF", permissions: ["x"], workspaceId: null });
  });
});
