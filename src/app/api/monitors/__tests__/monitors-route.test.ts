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

const afterTasks: Array<() => Promise<void>> = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => { afterTasks.push(fn); },
}));
const runDueMonitors = vi.fn(async () => ({ checked: 3, pruned: 0 }));
vi.mock("@/server/wiki-monitors", () => ({ runDueMonitors: (...a: unknown[]) => runDueMonitors(...(a as [])) }));

import { GET, POST } from "../route";

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

describe("POST /api/monitors (Refresh runs the overdue checks)", () => {
  const post = () => new NextRequest("http://localhost/api/monitors", { method: "POST" });
  beforeEach(() => { user.current = null; afterTasks.length = 0; runDueMonitors.mockClear(); });

  it("runs this workspace's due checks after answering, without pruning history", async () => {
    as("STAFF", ["monitors"]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain('"started":true');
    expect(runDueMonitors).not.toHaveBeenCalled();
    await afterTasks[0]();
    expect(runDueMonitors).toHaveBeenCalledWith({ workspaceId: "w1", prune: false });
  });

  it("a second press while one is running does not start another", async () => {
    as("STAFF", ["monitors"]);
    await POST(post());
    const body = await (await POST(post())).json();
    expect(JSON.stringify(body)).toContain('"alreadyRunning":true');
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(JSON.stringify(await (await POST(post())).json())).toContain('"started":true');
  });

  it("is gated like the page: no permission, or a guest, gets 403 and nothing runs", async () => {
    as("DEVELOPER", ["clients"]);
    expect((await POST(post())).status).toBe(403);
    as("GUEST", ["monitors"]);
    expect((await POST(post())).status).toBe(403);
    expect(afterTasks).toHaveLength(0);
  });
});
