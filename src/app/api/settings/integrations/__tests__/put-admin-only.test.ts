// @vitest-environment node
/**
 * Saving Settings → Integrations changes the workspace's AI keys, Slack token and email
 * credentials, so it is Admins and Super Admins only (Dan, 3 Nov 2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const caller = vi.fn();
const updateMany = vi.fn(async () => ({ count: 1 }));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/auth/effective-user", async (orig) => {
  const real = await orig<typeof import("@/server/auth/effective-user")>();
  return { ...real, getEffectiveUserOrNull: () => caller() };
});
vi.mock("@/server/workspaces/scope", () => ({
  requestWorkspaceId: vi.fn(async () => "ws1"),
  workspaceIdForRequest: vi.fn(async () => "ws1"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { workspace: { findFirst: vi.fn(async () => ({ id: "ws1" })), updateMany: () => updateMany() } },
}));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: vi.fn(async () => {}) }));

const { PUT } = await import("../route");

const put = () =>
  PUT(
    new Request("https://x.test/api/settings/integrations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiProvider: "ANTHROPIC" }),
    }) as unknown as import("next/server").NextRequest,
  );

const member = (role: string) => ({
  id: "u1", email: "a@gitwork.co.uk", name: "A", avatarUrl: null, role, permissions: [],
  workspaceId: "ws1", membershipId: "m1",
});

beforeEach(() => { caller.mockReset(); updateMany.mockClear(); });

describe("PUT /api/settings/integrations", () => {
  it.each(["DEVELOPER", "STAFF"])("refuses a %s and changes nothing", async (role) => {
    caller.mockResolvedValue(member(role));
    expect((await put()).status).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("lets an %s save", async (role) => {
    caller.mockResolvedValue(member(role));
    expect((await put()).status).toBe(200);
    expect(updateMany).toHaveBeenCalled();
  });
});
