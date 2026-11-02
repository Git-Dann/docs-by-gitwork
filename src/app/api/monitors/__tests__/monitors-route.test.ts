import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_ROLE_PERMISSIONS } from "@/types/auth";
import { hasModuleAccess } from "@/server/auth/module-gate";

const user = { current: null as Record<string, unknown> | null };

vi.mock("@/server/auth/effective-user", () => {
  class ForbiddenError extends Error { status = 403; }
  const can = (u: { role: string; permissions: string[] }, id: string) =>
    u.role === "SUPER_ADMIN" || u.permissions.includes(id);
  return {
    ForbiddenError,
    requireAuthedUser: vi.fn(async () => user.current),
    canViewMonitors: (u: { role: string; permissions: string[] }) => can(u, "monitors"),
    canSeeAllClients: (u: { role: string; permissions: string[] }) => can(u, "seeAllClients"),
  };
});
vi.mock("@/server/tasks", () => ({ assignedClientIds: vi.fn(async () => ["c1"]) }));
vi.mock("@/server/wiki-monitor-board", () => ({
  loadMonitorBoard: vi.fn(async () => ({ clients: [], incidents: [], readAt: "2026-11-02T00:00:00Z" })),
}));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/monitors");
const as = (role: string, permissions: string[]) => {
  user.current = { userId: "u1", workspaceId: "w1", role, permissions };
};

describe("Monitors permission defaults", () => {
  it("Staff and Admin have it; Developers and Guests don't", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.STAFF).toContain("monitors");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toContain("monitors");
    expect(DEFAULT_ROLE_PERMISSIONS.DEVELOPER).not.toContain("monitors");
  });

  it("the page is gated on it, and never open to a guest", () => {
    expect(hasModuleAccess("/app/monitors", ["monitors"], "DEVELOPER")).toBe(true);
    expect(hasModuleAccess("/app/monitors", ["clients"], "DEVELOPER")).toBe(false);
    expect(hasModuleAccess("/app/monitors", ["monitors"], "GUEST")).toBe(false);
  });
});

describe("GET /api/monitors", () => {
  beforeEach(() => { user.current = null; });

  it("refuses someone without the permission", async () => {
    as("DEVELOPER", ["clients"]);
    expect((await GET(req())).status).toBe(403);
  });

  it("refuses a guest even when granted", async () => {
    as("GUEST", ["monitors"]);
    expect((await GET(req())).status).toBe(403);
  });

  it("a granted developer sees the board, with links only to their own clients", async () => {
    as("DEVELOPER", ["monitors", "clients"]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('"openableClientIds":["c1"]');
  });

  it("no Portal permission → no links at all", async () => {
    as("DEVELOPER", ["monitors"]);
    const body = await (await GET(req())).json();
    expect(JSON.stringify(body)).toContain('"openableClientIds":[]');
  });

  it("someone who sees every client → null (all openable)", async () => {
    as("STAFF", ["monitors", "clients", "seeAllClients"]);
    const body = await (await GET(req())).json();
    expect(JSON.stringify(body)).toContain('"openableClientIds":null');
  });
});
