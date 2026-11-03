/**
 * How Foundry logs in to the Big Wedge API.
 *
 * Every previous "fix" for Wedge's course requests was a pasted token, and every one
 * quietly expired. These pin the rules that stop that: a service-account login beats any
 * stored token, and an expired stored token is reported AS expired — with the fix — rather
 * than failing as a bare 401 that reads like "Big Wedge is down".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ config: null as Record<string, unknown> | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportClient: { findFirst: vi.fn(async () => ({ id: "sc1" })) },
    workspaceClient: { findUnique: vi.fn(async () => null) },
    accountConnection: {
      findFirst: vi.fn(async () => (db.config ? { scraperConfig: db.config } : null)),
    },
  },
}));
vi.mock("@/server/support-scraper-config", () => ({
  decryptScraperConfig: (c: unknown) => c,
}));

import { accessFromLoginResponse, jwtExpiry, loginBody, resolveBigWedgeAccess } from "../bigwedge-api-auth";

const NOW = new Date("2026-10-14T12:00:00.000Z");
function jwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ exp })}.sig`;
}
const EXPIRED = jwt(Date.parse("2026-08-03T00:00:00Z") / 1000);
const LIVE = jwt(Date.parse("2026-12-01T00:00:00Z") / 1000);

const fetchMock = vi.fn();
beforeEach(() => {
  db.config = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.BIGWEDGE_API_USERNAME;
  delete process.env.BIGWEDGE_API_PASSWORD;
  delete process.env.BIGWEDGE_API_URL;
});
afterEach(() => vi.unstubAllGlobals());

describe("reading a token", () => {
  it("reads the expiry from a JWT without verifying it", () => {
    expect(jwtExpiry(EXPIRED)?.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(jwtExpiry("not-a-jwt")).toBeNull();
  });
  it("accepts both the documented and the enveloped login response", () => {
    expect(accessFromLoginResponse({ access: "a".repeat(20) })).toBe("a".repeat(20));
    expect(accessFromLoginResponse({ status: "success", data: { access: "b".repeat(20) } })).toBe("b".repeat(20));
    expect(accessFromLoginResponse({ status: "error" })).toBeNull();
  });
});

describe("the login body", () => {
  it("⚠️ sends a username as `username` — the API validates `email` as an address and rejects it", () => {
    expect(loginBody("foundry-svc", "pw")).toEqual({ username: "foundry-svc", password: "pw" });
  });
  it("sends an email as `email`", () => {
    expect(loginBody("svc@example.com", "pw")).toEqual({ email: "svc@example.com", password: "pw" });
  });
  it("logs in with a username end to end", async () => {
    process.env.BIGWEDGE_API_USERNAME = "foundry-svc";
    process.env.BIGWEDGE_API_PASSWORD = "pw";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access: "fresh-token-0123456789" }), { status: 200 }));
    await resolveBigWedgeAccess("wc1", NOW);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: "foundry-svc", password: "pw" });
  });
});

describe("which credential wins", () => {
  it("logs in with the service account, even when a stored token exists", async () => {
    process.env.BIGWEDGE_API_USERNAME = "svc@example.com";
    process.env.BIGWEDGE_API_PASSWORD = "pw";
    db.config = { apiToken: LIVE, baseUrl: "https://api.example" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access: "fresh-token-0123456789" }), { status: 200 }));

    const r = await resolveBigWedgeAccess("wc1", NOW);
    expect(r).toEqual({ ok: true, baseUrl: "https://api.example", token: "fresh-token-0123456789", via: "login" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/api/v1/auth/login/");
  });

  it("a rejected login says so, names the setting, and never echoes the password", async () => {
    process.env.BIGWEDGE_API_USERNAME = "svc@example.com";
    process.env.BIGWEDGE_API_PASSWORD = "hunter2";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "error", message: "Invalid credentials" }), { status: 400 }),
    );
    const r = await resolveBigWedgeAccess("wc1", NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Invalid credentials");
    expect(r.error).toContain("BIGWEDGE_API_PASSWORD");
    expect(r.error).not.toContain("hunter2");
    expect(r.error).not.toContain("svc@example.com");
  });

  it("⚠️ an expired stored token is reported as expired, with the fix — not used and left to 401", async () => {
    db.config = { apiToken: EXPIRED };
    const r = await resolveBigWedgeAccess("wc1", NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("expired on 2026-08-03");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a live stored token still works when no service account is set", async () => {
    db.config = { apiToken: LIVE };
    const r = await resolveBigWedgeAccess("wc1", NOW);
    expect(r).toMatchObject({ ok: true, token: LIVE, via: "stored-token" });
  });

  it("with nothing configured, it says what to set", async () => {
    const r = await resolveBigWedgeAccess("wc1", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("BIGWEDGE_API_USERNAME");
  });
});
