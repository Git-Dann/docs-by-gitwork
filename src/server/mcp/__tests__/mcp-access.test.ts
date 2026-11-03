/**
 * MCP access is re-checked on every call and every refresh, not only when someone first
 * connects. Before this, an archived member (or one whose 'Connect Claude' permission was taken
 * away) kept working MCP access for as long as Claude kept refreshing its token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  member: null as null | Record<string, unknown>,
  lastWhere: null as unknown,
  revoked: [] as string[],
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        state.lastWhere = args.where;
        const m = state.member;
        if (!m) return null;
        // Honour the archived filter the way Postgres would.
        if ("archivedAt" in args.where && args.where.archivedAt === null && m.archivedAt) return null;
        return m;
      }),
      // findHomeMembership reads every membership for the user and chooses an active one.
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        state.lastWhere = args.where;
        const m = state.member;
        return m ? [{ createdAt: new Date(0), ...m, workspace: { slug: "gitwork", ...(m.workspace as object) } }] : [];
      }),
    },
    user: { findUnique: vi.fn(async () => (state.member ? state.member.user : null)) },
    oAuthToken: { findUnique: vi.fn(async () => ({ userId: "u2" })) },
  },
}));
vi.mock("@/server/oauth", async (orig) => ({
  ...(await orig<typeof import("@/server/oauth")>()),
  validateAccessToken: vi.fn(async () => ({ tokenId: "t", user: { id: "u2" }, scope: ["mcp"], oauthClientId: "c" })),
  assertMcpEnabled: vi.fn(async () => undefined),
  findClientById: vi.fn(async () => ({ id: "c" })),
  workspaceIdForUser: vi.fn(async () => "w1"),
  revokeTokenByValue: vi.fn(async (t: string) => {
    state.revoked.push(t);
  }),
  rotateRefreshToken: vi.fn(async () => ({ accessToken: "foundry_at_new", refreshToken: "foundry_rt_new", scope: "mcp" })),
}));

import { resolveMcpActor, validateMcpBearer } from "../auth";
import { POST as tokenPost } from "@/app/api/oauth/token/route";

function member(over: Record<string, unknown> = {}) {
  return {
    id: "m2",
    role: "DEVELOPER",
    workspaceId: "w1",
    archivedAt: null,
    // Developers don't get mcp.connect by role; it's granted per person.
    permissionOverrides: { grant: ["mcp.connect"], revoke: [] },
    workspace: { rolePermissions: null },
    user: { id: "u2", email: "nasir@gitwork.co.uk", name: "Nasir", avatarUrl: null },
    ...over,
  };
}

function bearer() {
  return new Request("https://foundry.test/api/mcp", { headers: { authorization: "Bearer foundry_at_x" } });
}

function refresh() {
  return new Request("https://foundry.test/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "foundry_rt_old", client_id: "c" }),
  });
}

beforeEach(() => {
  state.member = member();
  state.lastWhere = null;
  state.revoked = [];
});

describe("every MCP call", () => {
  it("lets an active member with the permission through", async () => {
    const user = await validateMcpBearer(bearer());
    expect(user?.id).toBe("u2");
  });

  it("looks up that person's memberships, and only an active one can be chosen", async () => {
    await resolveMcpActor("u2");
    expect(state.lastWhere).toMatchObject({ userId: "u2" });
    state.member = member({ archivedAt: new Date() });
    expect(await resolveMcpActor("u2")).toBeNull();
  });

  it("refuses an archived member", async () => {
    state.member = member({ archivedAt: new Date() });
    expect(await validateMcpBearer(bearer())).toBeNull();
  });

  it("refuses someone whose MCP permission was taken away", async () => {
    state.member = member({ permissionOverrides: { grant: [], revoke: [] } });
    expect(await validateMcpBearer(bearer())).toBeNull();
  });

  it("refuses someone with no membership", async () => {
    state.member = null;
    expect(await validateMcpBearer(bearer())).toBeNull();
  });
});

describe("refreshing the token", () => {
  it("issues a new pair for an active member", async () => {
    const res = await tokenPost(refresh());
    expect(res.status).toBe(200);
    expect(state.revoked).toEqual([]);
  });

  it("refuses an archived member and kills the token", async () => {
    state.member = member({ archivedAt: new Date() });
    const res = await tokenPost(refresh());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    expect(state.revoked).toEqual(["foundry_rt_old"]);
  });

  it("refuses someone without the MCP permission", async () => {
    state.member = member({ permissionOverrides: { grant: [], revoke: [] } });
    const res = await tokenPost(refresh());
    expect(res.status).toBe(400);
    expect(state.revoked).toEqual(["foundry_rt_old"]);
  });
});
