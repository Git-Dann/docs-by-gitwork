import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Multi-tenant Phase 3: password reset by emailed link, accepting a business invite with a
 * password, and creating a business from the Platform console.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  users: [] as Row[],
  memberships: [] as Row[],
  tokens: [] as Row[],
  invites: [] as Row[],
  workspaces: [] as Row[],
  emails: [] as Array<{ to: string | string[]; text?: string; workspaceId: string }>,
}));

const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const cond = v as { gt?: Date };
      if (cond.gt) return (row[k] as Date) > cond.gt;
      return true;
    }
    return row[k] === v;
  });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => state.users.find((u) => match(u, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const u = state.users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
      create: vi.fn(async ({ data }: { data: Row & { memberships: { create: Row } } }) => {
        const id = `u${state.users.length + 1}`;
        const { memberships, ...rest } = data;
        const user = { id, ...rest };
        state.users.push(user);
        const m = { id: `m-${id}`, userId: id, archivedAt: null, ...memberships.create };
        state.memberships.push(m);
        return { ...user, memberships: [{ id: m.id }] };
      }),
    },
    passwordResetToken: {
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = state.tokens.filter((t) => match(t, where));
        rows.forEach((t) => Object.assign(t, data));
        return { count: rows.length };
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `t${state.tokens.length + 1}`, usedAt: null, ...data };
        state.tokens.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => state.tokens.find((t) => match(t, where)) ?? null),
    },
    workspaceInvite: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const inv = state.invites.find((i) => i.token === where.token);
        if (!inv) return null;
        return { ...inv, workspace: state.workspaces.find((w) => w.id === inv.workspaceId) };
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const inv = state.invites.find((i) => i.id === where.id)!;
        Object.assign(inv, data);
        return inv;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `i${state.invites.length + 1}`, token: `tok${state.invites.length + 1}`, ...data };
        state.invites.push(row);
        return row;
      }),
    },
    workspace: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const w = state.workspaces.find((x) => match(x, where));
        return w ? { ...w, createdAt: new Date(0), updatedAt: new Date(0), _count: { members: 0 } } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const w = { id: `ws${state.workspaces.length + 1}`, ...data };
        state.workspaces.push(w);
        return w;
      }),
    },
    workspaceMember: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        state.memberships
          .filter((m) => m.userId === where.userId)
          .map((m) => ({
            createdAt: new Date(0),
            permissions: [],
            permissionOverrides: {},
            ...m,
            workspace: state.workspaces.find((w) => w.id === m.workspaceId),
          })),
      ),
    },
  },
}));
vi.mock("@/server/email", () => ({
  escapeHtml: (s: string) => s,
  sendWorkspaceEmail: vi.fn(async (msg: { to: string; text?: string; workspaceId: string }) => {
    state.emails.push(msg);
    return { ok: true, id: "e1" };
  }),
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn(async () => []) }));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: vi.fn(async () => undefined) }));
vi.mock("@/server/auth/effective-user", () => ({ ForbiddenError: class extends Error {} }));
vi.mock("@/server/seed-accounts", () => ({ seedAccountUserWhere: () => ({}), isSeedAccount: () => false }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async (p: string) => `hash:${p}`) } }));

import { completePasswordReset, hashResetToken, requestPasswordReset } from "../auth/password-reset";
import { acceptInviteWithPassword } from "../team";
import { createPlatformBusiness } from "../platform/workspaces";

beforeEach(() => {
  state.workspaces = [
    { id: "ws-g", slug: "gitwork", name: "Gitwork" },
    { id: "ws-c", slug: "canary", name: "Canary" },
  ];
  state.users = [
    { id: "staff", email: "staff@gitwork.co.uk", name: "Staff" },
    { id: "owner", email: "owner@canary.test", name: "Jo Owner" },
  ];
  state.memberships = [
    { id: "m1", userId: "staff", workspaceId: "ws-g", role: "ADMIN", archivedAt: null },
    { id: "m2", userId: "owner", workspaceId: "ws-c", role: "SUPER_ADMIN", archivedAt: null },
  ];
  state.tokens = [];
  state.invites = [];
  state.emails = [];
});

const tokenFromEmail = () => /token=([^\s&]+)/.exec(state.emails[0]?.text ?? "")?.[1] ?? "";

describe("password reset", () => {
  it("emails a business member a link, and stores only a hash of it", async () => {
    await requestPasswordReset(" Owner@Canary.test ");
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({ to: "owner@canary.test", workspaceId: "ws-c" });
    const token = decodeURIComponent(tokenFromEmail());
    expect(token.length).toBeGreaterThan(30);
    expect(state.tokens[0].tokenHash).toBe(hashResetToken(token));
    expect(JSON.stringify(state.tokens)).not.toContain(token);
  });

  it("sends nothing for a Gitwork Google account, or an unknown address", async () => {
    await requestPasswordReset("staff@gitwork.co.uk");
    await requestPasswordReset("nobody@x.test");
    expect(state.emails).toHaveLength(0);
    expect(state.tokens).toHaveLength(0);
  });

  it("a link sets the password once", async () => {
    await requestPasswordReset("owner@canary.test");
    const token = decodeURIComponent(tokenFromEmail());
    expect(await completePasswordReset(token, "new-password-1")).toEqual({ ok: true, email: "owner@canary.test" });
    expect(state.users[1].passwordHash).toBe("hash:new-password-1");
    expect((await completePasswordReset(token, "another-pass-2")).ok).toBe(false);
    expect(state.users[1].passwordHash).toBe("hash:new-password-1");
  });

  it("two submissions of one link at once: only one sets the password", async () => {
    await requestPasswordReset("owner@canary.test");
    const token = decodeURIComponent(tokenFromEmail());
    const results = await Promise.all([
      completePasswordReset(token, "first-password"),
      completePasswordReset(token, "second-password"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("asking again cancels the earlier link", async () => {
    await requestPasswordReset("owner@canary.test");
    const first = decodeURIComponent(tokenFromEmail());
    state.emails = [];
    await requestPasswordReset("owner@canary.test");
    expect((await completePasswordReset(first, "new-password-1")).ok).toBe(false);
  });

  it("refuses an expired link, a made-up one, and a short password", async () => {
    await requestPasswordReset("owner@canary.test");
    const token = decodeURIComponent(tokenFromEmail());
    expect((await completePasswordReset(token, "short")).ok).toBe(false);
    expect((await completePasswordReset("made-up-token-value", "new-password-1")).ok).toBe(false);
    state.tokens[0].expiresAt = new Date(Date.now() - 1000);
    expect((await completePasswordReset(token, "new-password-1")).ok).toBe(false);
    expect(state.users[1].passwordHash).toBeUndefined();
  });
});

describe("accepting a business invite with a password", () => {
  beforeEach(() => {
    state.invites = [
      { id: "i1", token: "canary-owner", workspaceId: "ws-c", status: "PENDING", expiresAt: null, email: "new@canary.test", role: "ADMIN" },
      { id: "i2", token: "gitwork-open", workspaceId: "ws-g", status: "PENDING", expiresAt: null, email: null, role: null },
    ];
  });

  it("creates the account with the invite's role, in that business", async () => {
    const res = await acceptInviteWithPassword({ token: "canary-owner", name: "New", email: "NEW@canary.test", password: "long-enough" });
    expect(res).toEqual({ ok: true, email: "new@canary.test" });
    expect(state.memberships.at(-1)).toMatchObject({ workspaceId: "ws-c", role: "ADMIN" });
    expect(state.users.at(-1)).toMatchObject({ email: "new@canary.test", passwordHash: "hash:long-enough" });
    expect(state.invites[0].status).toBe("ACCEPTED");
  });

  it("refuses another email for an addressed invite", async () => {
    const res = await acceptInviteWithPassword({ token: "canary-owner", name: "X", email: "x@evil.test", password: "long-enough" });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(state.users).toHaveLength(2);
  });

  it("never sets a password on an existing account", async () => {
    state.invites[0].email = null;
    const res = await acceptInviteWithPassword({ token: "canary-owner", name: "X", email: "staff@gitwork.co.uk", password: "long-enough" });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(state.users[0].passwordHash).toBeUndefined();
  });

  it("refuses a Gitwork invite: Gitwork is Google-only", async () => {
    const res = await acceptInviteWithPassword({ token: "gitwork-open", name: "X", email: "x@x.test", password: "long-enough" });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(state.users).toHaveLength(2);
  });
});

describe("creating a business", () => {
  it("gets the default bundle, its own AI keys, and an owner invite addressed to the owner", async () => {
    const res = await createPlatformBusiness("dan", { name: "Canary", ownerName: "Jo", ownerEmail: "jo@canary2.test" });
    const ws = state.workspaces.at(-1)!;
    expect(ws).toMatchObject({ slug: "canary-2", modulesRestricted: true, platformAiKeysAllowed: false });
    expect(ws.enabledModules).not.toContain("support");
    const inv = state.invites.at(-1)!;
    expect(inv).toMatchObject({ workspaceId: ws.id, email: "jo@canary2.test", role: "SUPER_ADMIN", status: "PENDING" });
    expect(inv.expiresAt).toBeInstanceOf(Date);
    expect(res.inviteUrl).toMatch(/\/invite\/tok\d+$/);
    expect(state.emails.at(-1)).toMatchObject({ to: "jo@canary2.test", workspaceId: ws.id });
  });
});
