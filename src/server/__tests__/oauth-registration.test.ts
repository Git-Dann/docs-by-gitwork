import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/oauth/register/route";
import { isAllowedRedirectUri, redirectUrisMatch } from "@/server/oauth";
import type { OAuthClient } from "@prisma/client";

const { createClient, enabledWorkspace } = vi.hoisted(() => ({
  createClient: vi.fn(),
  enabledWorkspace: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: { create: createClient },
    workspace: { findFirst: enabledWorkspace },
  },
}));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: vi.fn() }));

function register(redirectUris: string[]) {
  return POST(new Request("https://foundry.example/api/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Desktop MCP client",
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  enabledWorkspace.mockResolvedValue({ id: "workspace" });
  createClient.mockImplementation(async ({ data }) => ({
    ...data, id: "client", createdAt: new Date("2026-10-01T00:00:00Z"),
  }));
});

describe("OAuth dynamic client registration", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:49152/callback",
    "http://127.0.0.1:49152/callback/desktop-session",
    "http://[::1]:49152/callback",
  ])("registers a supported callback: %s", async (uri) => {
    const response = await register([uri]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      client_id: "client", redirect_uris: [uri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
    });
    expect(createClient).toHaveBeenCalledWith({ data: expect.objectContaining({ redirectUris: [uri] }) });
  });

  it.each([
    "http://example.com/callback",
    "http://localhost.example.com/callback",
    "http://localhost@evil.example/callback",
    "http://127.0.0.1.example.com/callback",
    "http://192.168.1.1/callback",
    "http://0.0.0.0/callback",
    "http://[::]/callback",
    "https://user:password@example.com/callback",
    "https://example.com/callback#fragment",
    "http://127.0.0.1:49152/callback#fragment",
    "file:///callback",
    "/callback",
    "not a URL",
  ])("rejects an unsafe callback without saving it: %s", async (uri) => {
    const response = await register([uri]);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_client_metadata" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects the whole registration when one callback is invalid", async () => {
    const response = await register(["https://claude.ai/callback", "http://evil.example/callback"]);
    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("still honours the workspace MCP switch", async () => {
    enabledWorkspace.mockResolvedValue(null);
    const response = await register(["http://127.0.0.1:49152/callback"]);
    expect(response.status).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("OAuth redirect URI matching", () => {
  const client = {
    redirectUris: [
      "http://127.0.0.1:49152/callback/desktop-session",
      "http://[::1]:49152/callback/desktop-session",
      "https://claude.ai/api/mcp/auth_callback",
    ],
  } as OAuthClient;

  it.each([
    "http://127.0.0.1:63383/callback/desktop-session",
    "http://localhost:63383/callback/desktop-session",
    "http://[::1]:63383/callback/desktop-session",
  ])("accepts an equivalent loopback callback when its host alias or ephemeral port changed: %s", (uri) => {
    expect(isAllowedRedirectUri(client, uri)).toBe(true);
  });

  it.each([
    "http://127.0.0.1:63383/callback/other-session",
    "https://claude.ai:8443/api/mcp/auth_callback",
  ])("still rejects a callback whose host, path, or HTTPS port changed: %s", (uri) => {
    expect(isAllowedRedirectUri(client, uri)).toBe(false);
  });

  it("matches the proxy-normalized authorization callback during token exchange", () => {
    expect(redirectUrisMatch(
      "http://localhost:53872/callback/desktop-session",
      "http://127.0.0.1:53872/callback/desktop-session",
    )).toBe(true);
  });

  it("still requires the authorization callback port during token exchange", () => {
    expect(redirectUrisMatch(
      "http://localhost:53872/callback/desktop-session",
      "http://127.0.0.1:63383/callback/desktop-session",
    )).toBe(false);
  });
});
