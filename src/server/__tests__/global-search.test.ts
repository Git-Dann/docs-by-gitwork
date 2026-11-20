/**
 * ⌘K record search, server side: each group is searched only for someone who can open what it
 * finds, tasks are limited to the person's clients, every word must match, and a group that fails
 * is named rather than shown as "no results".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, state, rec } = vi.hoisted(() => {
  const calls: Record<string, unknown[]> = {};
  const state = { failCare: false };
  const rec = (name: string, rows: unknown[]) =>
    vi.fn(async (args: unknown) => {
      (calls[name] ??= []).push(args);
      if (name === "care" && state.failCare) throw new Error("boom");
      return rows;
    });
  return { calls, state, rec };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(async () => ({ modulesRestricted: false, enabledModules: [] })) },
    task: { findMany: rec("tasks", [{ id: "t1", title: "Booking email", status: "DOING", client: { name: "Northwind", slug: "northwind" } }]) },
    clientWikiIntakeItem: { findMany: rec("requests", []) },
    meeting: { findMany: rec("meetings", []) },
    supportConversation: { findMany: rec("care", [{ id: "c1", subject: "Booking email", customerLabel: "sam@x.com", clientId: "sc1", client: { name: "Northwind" } }]) },
    candidate: { findMany: rec("people", []) },
  },
}));

vi.mock("@/server/tasks", () => ({ assignedClientIds: vi.fn(async () => ["client-a"]) }));
// The real rule, without pulling NextAuth into the test.
vi.mock("@/server/auth/effective-user", () => ({
  canSeeAllClients: (u: { role: string; permissions: string[] }) => u.role === "SUPER_ADMIN" || u.permissions.includes("seeAllClients"),
}));

import { globalSearch } from "../global-search";
import type { EffectiveUser } from "@/server/auth/effective-user";

const user = (role: string, permissions: string[], seeAll = false): EffectiveUser =>
  ({ id: "u1", workspaceId: "w1", role, permissions: seeAll ? [...permissions, "seeAllClients"] : permissions }) as unknown as EffectiveUser;

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  state.failCare = false;
});

describe("globalSearch", () => {
  it("searches nothing a developer can't open, and limits tasks to their clients", async () => {
    const r = await globalSearch(user("DEVELOPER", ["clients"]), "booking email");
    expect(calls.care).toBeUndefined();
    expect(calls.people).toBeUndefined();
    const where = (calls.tasks[0] as { where: { client: unknown; AND: unknown[] } }).where;
    expect(where.client).toEqual({ id: { in: ["client-a"] } });
    // Every word must match.
    expect(where.AND).toHaveLength(2);
    expect(r.hits.map((h) => h.group)).toEqual(["Tasks"]);
    expect(r.hits[0].href).toBe("/app/portal/northwind/tasks?task=t1");
  });

  it("searches no client records for someone without Portal", async () => {
    await globalSearch(user("STAFF", ["support"]), "booking");
    expect(calls.tasks).toBeUndefined();
    expect(calls.requests).toBeUndefined();
    expect(calls.meetings).toBeUndefined();
    expect(calls.care).toHaveLength(1);
  });

  it("links a Care hit straight to its conversation", async () => {
    const r = await globalSearch(user("STAFF", ["support"]), "booking");
    expect(r.hits[0].href).toBe("/app/care?client=sc1&conversation=c1");
  });

  it("names a group that failed instead of reporting no results", async () => {
    state.failCare = true;
    const r = await globalSearch(user("SUPER_ADMIN", []), "booking");
    expect(r.failed).toEqual(["Care"]);
    expect(r.hits.some((h) => h.group === "Tasks")).toBe(true);
  });

  it("sees every client when the person sees all clients", async () => {
    await globalSearch(user("ADMIN", ["clients"], true), "booking");
    expect((calls.tasks[0] as { where: { client: unknown } }).where.client).toEqual({});
  });
});
