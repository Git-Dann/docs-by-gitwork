/**
 * The all-clients board route. Two rules: only the agency's own wiki answers (so no client's
 * wiki can be made to list other clients), and a restricted user sees only the clients they
 * could open one at a time anyway.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; workspaceId: string; role: string; permissions: string[] },
  loadMonitorBoard: vi.fn(),
  assertClientAccessBySlug: vi.fn(),
  assignedClientIds: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { workspaceClient: { findUnique: async () => ({ id: "agency-id" }) } },
}));
vi.mock("@/server/auth/effective-user", () => ({
  requireAuthedUser: async () => {
    if (!h.user) throw Object.assign(new Error("Sign in"), { status: 401 });
    return h.user;
  },
  canSeeAllClients: (u: { role: string; permissions: string[] }) =>
    u.role === "SUPER_ADMIN" || u.permissions.includes("seeAllClients"),
}));
vi.mock("@/server/client-assignments", () => ({ assertClientAccessBySlug: h.assertClientAccessBySlug }));
vi.mock("@/server/tasks", () => ({ assignedClientIds: h.assignedClientIds }));
vi.mock("@/server/wiki-monitor-board", () => ({ loadMonitorBoard: h.loadMonitorBoard }));

import { GET } from "@/app/api/clients/[slug]/wiki/monitors/board/route";

const call = (slug: string) =>
  GET(new Request("http://x") as never, { params: Promise.resolve({ slug }) });

beforeEach(() => {
  h.user = null;
  h.loadMonitorBoard.mockReset().mockResolvedValue({ clients: [], readAt: "now" });
  h.assertClientAccessBySlug.mockReset().mockResolvedValue(undefined);
  h.assignedClientIds.mockReset().mockResolvedValue([]);
});

describe("GET /api/clients/[slug]/wiki/monitors/board", () => {
  it("⚠️ 404s for any client but the agency", async () => {
    const res = await call("fellas-loaded");
    expect(res.status).toBe(404);
    expect(h.loadMonitorBoard).not.toHaveBeenCalled();
  });

  it("needs a signed-in person", async () => {
    const res = await call("gitwork");
    expect(res.status).toBe(401);
    expect(h.loadMonitorBoard).not.toHaveBeenCalled();
  });

  it("returns every client to someone who sees all clients", async () => {
    h.user = { id: "u", workspaceId: "ws1", role: "ADMIN", permissions: ["seeAllClients"] };
    const res = await call("gitwork");
    expect(res.status).toBe(200);
    expect(h.loadMonitorBoard).toHaveBeenCalledWith("ws1", null);
  });

  it("⚠️ narrows a restricted user to their own clients plus Gitwork", async () => {
    h.user = { id: "u", workspaceId: "ws1", role: "DEVELOPER", permissions: [] };
    h.assignedClientIds.mockResolvedValue(["wedge-id"]);
    await call("gitwork");
    expect(h.loadMonitorBoard).toHaveBeenCalledWith("ws1", ["wedge-id", "agency-id"]);
  });

  it("refuses someone who can't open the Gitwork client at all", async () => {
    h.user = { id: "u", workspaceId: "ws1", role: "DEVELOPER", permissions: [] };
    const err = Object.assign(new Error("You don't have access to this client."), { status: 403 });
    h.assertClientAccessBySlug.mockRejectedValue(err);
    const res = await call("gitwork");
    expect(res.status).toBe(403);
    expect(h.loadMonitorBoard).not.toHaveBeenCalled();
  });
});
