import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailDomainError, normaliseAllowedDomains } from "@/lib/email-domains";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  users: [] as Row[],
  members: [] as Row[],
  workspaces: [] as Row[],
  invites: [] as Row[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => state.users.find((u) => u.email === where.email) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const u = { id: `u${state.users.length + 1}`, ...data };
        state.users.push(u);
        return u;
      }),
    },
    workspace: {
      findMany: vi.fn(async ({ where }: { where: { allowedEmailDomains: { has: string } } }) =>
        state.workspaces.filter((w) => (w.allowedEmailDomains as string[]).includes(where.allowedEmailDomains.has)),
      ),
    },
    workspaceInvite: {
      findMany: vi.fn(async ({ where }: { where: { email: string } }) => state.invites.filter((i) => i.email === where.email && i.status === "PENDING")),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(state.invites.find((i) => i.id === where.id)!, data)),
    },
    workspaceMember: {
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        const m = { id: `m${state.members.length + 1}`, archivedAt: null, ...create };
        state.members.push(m);
        return m;
      }),
    },
  },
}));
vi.mock("@/server/auth/home-membership", () => ({
  findHomeMembership: vi.fn(async (userId: string) =>
    state.members.find((m) => m.userId === userId && m.archivedAt === null) ?? null,
  ),
}));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn(async () => []) }));

import { businessGoogleAllowed, provisionBusinessGoogleUser } from "../auth/business-google";

beforeEach(() => {
  state.users = [];
  state.members = [];
  state.workspaces = [{ id: "ws-c", allowedEmailDomains: ["canary.test"] }];
  state.invites = [];
});

describe("allowed email domains", () => {
  it("cleans and de-duplicates", () => {
    expect(normaliseAllowedDomains([" @Canary.test", "canary.test", "", "canary.co.uk"])).toEqual(["canary.test", "canary.co.uk"]);
  });
  it("never a public mail service, Gitwork's domain, or junk", () => {
    expect(() => normaliseAllowedDomains(["gmail.com"])).toThrow(EmailDomainError);
    expect(() => normaliseAllowedDomains(["gitwork.co.uk"])).toThrow(EmailDomainError);
    expect(() => normaliseAllowedDomains(["not a domain"])).toThrow(EmailDomainError);
  });
});

describe("Google sign-in for a business", () => {
  it("a new person on the business's domain joins it as a Developer", async () => {
    expect(await businessGoogleAllowed("jo@canary.test")).toBe("ok");
    const id = await provisionBusinessGoogleUser("jo@canary.test", "Jo");
    expect(id).toBeTruthy();
    expect(state.members[0]).toMatchObject({ workspaceId: "ws-c", role: "DEVELOPER" });
  });

  it("refuses an unknown domain and Gitwork's domain", async () => {
    expect(await businessGoogleAllowed("x@elsewhere.test")).toBe("not_allowed");
    expect(await businessGoogleAllowed("dan@gitwork.co.uk")).toBe("not_allowed");
    expect(await provisionBusinessGoogleUser("x@elsewhere.test", null)).toBeNull();
  });

  it("a domain never brings back someone who was removed", async () => {
    state.users.push({ id: "old", email: "gone@canary.test" });
    state.members.push({ id: "m-old", userId: "old", workspaceId: "ws-c", archivedAt: new Date() });
    expect(await businessGoogleAllowed("gone@canary.test")).toBe("revoked");
    expect(await provisionBusinessGoogleUser("gone@canary.test", null)).toBeNull();
  });

  it("an addressed invite admits them with its role, on any domain", async () => {
    state.invites.push({ id: "i1", email: "boss@elsewhere.test", status: "PENDING", expiresAt: null, role: "ADMIN", workspaceId: "ws-c" });
    expect(await businessGoogleAllowed("boss@elsewhere.test")).toBe("ok");
    await provisionBusinessGoogleUser("boss@elsewhere.test", "Boss");
    expect(state.members[0]).toMatchObject({ workspaceId: "ws-c", role: "ADMIN" });
    expect(state.invites[0].status).toBe("ACCEPTED");
  });

  it("a domain two businesses claim admits nobody", async () => {
    state.workspaces.push({ id: "ws-d", allowedEmailDomains: ["canary.test"] });
    expect(await businessGoogleAllowed("jo@canary.test")).toBe("not_allowed");
  });
});
