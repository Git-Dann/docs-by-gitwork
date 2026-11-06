/**
 * The monitor MCP tools: the every-client summary, picking a monitor by name when two share one
 * (an "API" in production and one in staging), and the permissions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  monitors: [] as Array<{ id: string; name: string; environment: string }>,
  updates: [] as Array<{ id: string; input: Record<string, unknown> }>,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { wikiMonitor: { findMany: vi.fn(async () => state.monitors) } },
}));
vi.mock("@/server/wiki-monitors", () => ({
  acknowledgeIncident: vi.fn(),
  addIncidentUpdate: vi.fn(),
  checkMonitorNow: vi.fn(),
  deleteMonitor: vi.fn(async () => true),
  loadWikiMonitors: vi.fn(),
  updateMonitor: vi.fn(async (_c: string, id: string, input: Record<string, unknown>) => {
    state.updates.push({ id, input });
    return { id, name: "API", environment: input.environment ?? "production", enabled: true, maintenance: null };
  }),
}));
const mon = (id: string, name: string, environment: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, name, target: `https://${id}.co`, environment, status, stale: false, alertKind: status === "DOWN" ? "down" : null,
  latencyMs: 90, statusCode: status === "DOWN" ? 503 : 200, error: null, checkedAt: "2026-11-04T12:00:00.000Z",
  downSince: null, uptime24h: 99, ...extra,
});
vi.mock("@/server/wiki-monitor-board", () => ({
  loadMonitorBoard: vi.fn(async () => ({
    readAt: "2026-11-04T12:00:00.000Z",
    incidents: [],
    clients: [
      { clientId: "c1", slug: "fellas", name: "Fellas Loaded", monitors: [mon("p", "API", "production", "UP"), mon("s", "API", "staging", "DOWN")] },
      { clientId: "c2", slug: "wedge", name: "Big Wedge Golf", monitors: [mon("w", "Website", "production", "UP")] },
      { clientId: "c3", slug: "kestrel", name: "Kestrel", monitors: [] },
    ],
  })),
}));

import { buildMonitorTools } from "@/server/mcp/monitor-tools";
import type { EffectiveUser } from "@/server/auth/effective-user";

const textResult = (payload: unknown, summary?: string) => ({
  content: [{ type: "text" as const, text: `${summary ?? ""}\n${JSON.stringify(payload)}` }],
});
const resolveClient = async () => ({ id: "c1", slug: "fellas", name: "Fellas Loaded" });
const tools = buildMonitorTools({ resolveClient, textResult });
const tool = (name: string) => tools.find((t) => t.name === name)!;

const user = (over: Partial<EffectiveUser> = {}): EffectiveUser => ({
  id: "u1", email: "dan@gitwork.co.uk", name: "Dan", avatarUrl: null, role: "SUPER_ADMIN",
  permissions: [], workspaceId: "w", membershipId: "m", ...over,
});
const text = (r: { content: { text: string }[] }) => r.content[0].text;

beforeEach(() => {
  state.updates = [];
  state.monitors = [
    { id: "p", name: "API", environment: "production" },
    { id: "s", name: "API", environment: "staging" },
  ];
});

describe("summarise_monitors", () => {
  it("says what's down, names the environment, and lists who isn't monitored", async () => {
    const out = text(await tool("summarise_monitors").handler(user(), {}));
    expect(out).toContain("1 service down — Fellas Loaded (Staging)");
    expect(out).toContain("Fellas Loaded — API (Staging): down, HTTP 503");
    expect(out).toContain("Not monitored: Kestrel.");
  });

  it("filters to one environment", async () => {
    const out = text(await tool("summarise_monitors").handler(user(), { environment: "production" }));
    expect(out).toContain("All systems operational (Production only)");
  });

  it("needs the Monitors permission", async () => {
    await expect(tool("summarise_monitors").handler(user({ role: "DEVELOPER", permissions: [] }), {})).rejects.toThrow(/access to Monitors/);
  });
});

describe("addressing a monitor", () => {
  it("refuses a name two monitors share, naming the environments", async () => {
    await expect(tool("update_monitor").handler(user(), { client: "fellas", monitor: "api", enabled: false })).rejects.toThrow(
      /2 monitors called "api" \(Production, Staging\)/,
    );
  });

  it("uses `environment` to pick one, and setEnvironment to move it", async () => {
    await tool("update_monitor").handler(user(), { client: "fellas", monitor: "API", environment: "staging", setEnvironment: "production" });
    expect(state.updates).toEqual([{ id: "s", input: { environment: "production" } }]);
  });

  it("refuses an update with nothing to change", async () => {
    await expect(tool("update_monitor").handler(user(), { client: "fellas", monitor: "p" })).rejects.toThrow(/Nothing to change/);
  });

  it("writers need 'Manage clients'", async () => {
    await expect(
      tool("delete_monitor").handler(user({ role: "DEVELOPER", permissions: [] }), { client: "fellas", monitor: "p" }),
    ).rejects.toThrow();
  });
});
