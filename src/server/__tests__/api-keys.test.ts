import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workspace API keys (multi-tenant Phase 2). A key acts as its creator, in its own workspace
 * only, and every way it can be unusable is a refusal — never "no identity", which is how the
 * trusted env API_KEY is represented.
 */

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    workspaceId: string;
    createdById: string;
    tokenHash: string;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
  }>,
  members: [] as Array<{ userId: string; workspaceId: string; archivedAt: Date | null }>,
  users: [] as Array<{ id: string; email: string; name: string }>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceApiKey: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tokenHash: string; revokedAt: null } }) =>
        state.rows.find((r) => r.id === where.id && r.tokenHash === where.tokenHash && r.revokedAt === null) ?? null,
      ),
      update: vi.fn(async () => ({})),
    },
    workspaceMember: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; workspaceId: string } }) => {
        const m = state.members.find(
          (x) => x.userId === where.userId && x.workspaceId === where.workspaceId && x.archivedAt === null,
        );
        return m
          ? {
              id: `m-${m.userId}-${m.workspaceId}`,
              workspaceId: m.workspaceId,
              role: "ADMIN",
              permissions: [],
              permissionOverrides: {},
              archivedAt: null,
              createdAt: new Date(0),
              workspace: { slug: m.workspaceId, rolePermissions: null, modulesRestricted: false, enabledModules: [] },
            }
          : null;
      }),
      findMany: vi.fn(async () => []),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { OR?: Array<{ id?: string }>; id?: string } }) => {
        const id = where.id ?? where.OR?.find((o) => o.id)?.id;
        const u = state.users.find((x) => x.id === id);
        return u ? { ...u, avatarUrl: null } : null;
      }),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn() }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/lib/templates", () => ({ allowedDocTypes: vi.fn(() => []) }));

import { hashApiKey, mintApiKey } from "@/lib/api-key-token";
import { resolveApiKey } from "../api-keys";
import { getEffectiveUserOrNull, requireAuthedUser, RevokedAccessError } from "../auth/effective-user";

const KEY_ID = "kaaaaaaaaaaaaaaaaaaaaaaaa";
let token = "";

const bearer = (t: string) => new Request("https://foundry.test/api/x", { headers: { authorization: `Bearer ${t}` } });

beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-for-api-keys-1234567890";
  token = await mintApiKey(KEY_ID, process.env.AUTH_SECRET);
  state.rows = [
    { id: KEY_ID, workspaceId: "ws-b", createdById: "u1", tokenHash: await hashApiKey(token), revokedAt: null, lastUsedAt: null },
  ];
  state.members = [{ userId: "u1", workspaceId: "ws-b", archivedAt: null }];
  state.users = [{ id: "u1", email: "owner@canary.test", name: "Owner" }];
});

describe("resolveApiKey", () => {
  it("a live key acts as its creator, in its own workspace", async () => {
    expect(await resolveApiKey(token)).toEqual({ keyId: KEY_ID, userId: "u1", workspaceId: "ws-b" });
  });

  it("refuses a token signed with another secret", async () => {
    const forged = await mintApiKey(KEY_ID, "a-completely-different-secret-12345");
    expect(await resolveApiKey(forged)).toBeNull();
  });

  it("refuses a revoked key", async () => {
    state.rows[0].revokedAt = new Date();
    expect(await resolveApiKey(token)).toBeNull();
  });

  it("refuses a correctly signed token that isn't stored", async () => {
    const other = await mintApiKey(KEY_ID, process.env.AUTH_SECRET!);
    expect(await resolveApiKey(other)).toBeNull();
  });

  it("refuses once its creator is archived in that workspace", async () => {
    state.members[0].archivedAt = new Date();
    expect(await resolveApiKey(token)).toBeNull();
  });

  it("refuses when its creator is only a member of ANOTHER workspace", async () => {
    state.members = [{ userId: "u1", workspaceId: "ws-gitwork", archivedAt: null }];
    expect(await resolveApiKey(token)).toBeNull();
  });
});

describe("requireAuthedUser with a workspace API key", () => {
  it("serves the key's own workspace", async () => {
    const user = await requireAuthedUser(bearer(token));
    expect(user.id).toBe("u1");
    expect(user.workspaceId).toBe("ws-b");
  });

  it("an unusable key is a refusal, never 'no identity'", async () => {
    state.rows[0].revokedAt = new Date();
    await expect(requireAuthedUser(bearer(token))).rejects.toBeInstanceOf(RevokedAccessError);
    // getEffectiveUserOrNull maps ONLY "no identity" to null. null = the trusted env API_KEY.
    await expect(getEffectiveUserOrNull(bearer(token))).rejects.toBeInstanceOf(RevokedAccessError);
  });

  it("a mangled key is a refusal too", async () => {
    await expect(getEffectiveUserOrNull(bearer(`${token.slice(0, -2)}xx`))).rejects.toBeInstanceOf(RevokedAccessError);
  });
});
