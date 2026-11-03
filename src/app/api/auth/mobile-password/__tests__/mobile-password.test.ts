import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The iOS app's email-and-password sign-in (multi-tenant Phase 3). These run the real
 * `verifyPassword` and `findHomeMembership` against a mocked database, because the rules
 * that matter live in them: who may use a password, and which workspace the token names.
 */

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; email: string; name: string | null; passwordHash: string | null }>,
  memberships: {} as Record<string, Array<Record<string, unknown>>>,
  rateLimitCalls: [] as string[],
  rateLimited: null as string | null,
}));

vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "gitwork" }));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn(async () => ["pulse"]) }));
vi.mock("@/server/rate-limit", () => ({
  clientIpFrom: (h: Headers) => h.get("x-forwarded-for"),
  assertWithinRateLimit: vi.fn(async ({ bucket, message }: { bucket: string; message?: string }) => {
    state.rateLimitCalls.push(bucket);
    if (state.rateLimited && bucket.startsWith(state.rateLimited)) {
      const err = new Error(message ?? "Too many") as Error & { status: number };
      err.status = 429;
      throw err;
    }
  }),
}));
const { create, update } = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        state.users.find((u) => u.email === where.email) ?? null,
      ),
      create,
      update,
    },
    workspaceMember: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => state.memberships[where.userId] ?? []),
      create,
      update,
    },
  },
}));

import { POST } from "../route";
import { verifyMobileToken } from "@/server/auth/mobile-jwt";

process.env.AUTH_SECRET = "test-secret-for-mobile-password";

const HASH = bcrypt.hashSync("correct horse", 4);
const GENERIC = "That email and password didn't match an account.";

function member(over: Record<string, unknown>) {
  return {
    id: "m-1",
    workspaceId: "ws-acme",
    role: "ADMIN",
    permissions: [],
    permissionOverrides: null,
    archivedAt: null,
    createdAt: new Date(0),
    workspace: { slug: "acme", rolePermissions: null, modulesRestricted: false, enabledModules: [] },
    ...over,
  };
}

function req(body: unknown, ip = "203.0.113.7") {
  return new NextRequest("https://foundry.test/api/auth/mobile-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const res = await POST(req(body));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  state.users = [
    { id: "u-biz", email: "sam@acme.test", name: "Sam Acme", passwordHash: HASH },
    { id: "u-staff", email: "jo@gitwork.co.uk", name: "Jo Gitwork", passwordHash: HASH },
    { id: "u-archived", email: "ex@acme.test", name: "Ex Acme", passwordHash: HASH },
  ];
  state.memberships = {
    "u-biz": [member({})],
    "u-staff": [member({ id: "m-2", workspaceId: "ws-gitwork", role: "STAFF", workspace: { slug: "gitwork" } })],
    "u-archived": [member({ id: "m-3", archivedAt: new Date("2026-10-01") })],
  };
  state.rateLimitCalls = [];
  state.rateLimited = null;
  create.mockClear();
  update.mockClear();
});

describe("POST /api/auth/mobile-password", () => {
  it("gives an unknown email and a wrong password the identical 401", async () => {
    const unknown = await call({ email: "nobody@acme.test", password: "correct horse" });
    const wrong = await call({ email: "sam@acme.test", password: "wrong" });
    expect(unknown.status).toBe(401);
    expect(wrong).toEqual(unknown);
    expect(unknown.body.error).toBe(GENERIC);
  });

  it("refuses a Gitwork staff account (Google only) with the same 401, even with the right password", async () => {
    const staff = await call({ email: "jo@gitwork.co.uk", password: "correct horse" });
    expect(staff.status).toBe(401);
    expect(staff.body).toEqual((await call({ email: "nobody@acme.test", password: "x" })).body);
    expect(staff.body.token).toBeUndefined();
  });

  it("refuses an archived member with the same 401", async () => {
    const archived = await call({ email: "ex@acme.test", password: "correct horse" });
    expect(archived.status).toBe(401);
    expect(archived.body.error).toBe(GENERIC);
  });

  it("gives a business member a token naming their workspace, in mobile-callback's shape", async () => {
    const ok = await call({ email: "  Sam@Acme.test ", password: "correct horse" });
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body).sort()).toEqual(["token", "user"]);
    expect(ok.body.user).toEqual({
      id: "u-biz",
      email: "sam@acme.test",
      name: "Sam Acme",
      role: "ADMIN",
      permissions: ["pulse"],
    });
    const claims = await verifyMobileToken(ok.body.token);
    expect(claims).toMatchObject({ sub: "u-biz", role: "ADMIN", workspaceId: "ws-acme", permissions: ["pulse"] });
  });

  it("never creates or promotes anything", async () => {
    await call({ email: "sam@acme.test", password: "correct horse" });
    await call({ email: "nobody@acme.test", password: "correct horse" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rate limits per IP and per email before checking the password", async () => {
    await call({ email: "Sam@acme.test", password: "wrong" });
    expect(state.rateLimitCalls).toEqual(["mobile-password:ip:203.0.113.7", "mobile-password:email:sam@acme.test"]);

    state.rateLimited = "mobile-password:email:";
    const limited = await call({ email: "sam@acme.test", password: "correct horse" });
    expect(limited.status).toBe(429);
    expect(limited.body.token).toBeUndefined();
  });

  it("refuses a missing password as a bad request, not a sign-in", async () => {
    const res = await call({ email: "sam@acme.test" });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });
});
