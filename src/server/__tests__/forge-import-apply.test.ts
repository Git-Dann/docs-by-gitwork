/**
 * The import's write path, against a recording fake database: what it may write, and what it
 * must never do. A plan bug can make a card wrong; only this file can make it destructive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { model: string; op: string; args: Record<string, unknown> };
const calls = vi.hoisted(() => [] as Call[]);
const state = vi.hoisted(() => ({
  columns: [] as unknown[],
  tasks: [] as Array<Record<string, unknown>>,
  releases: [] as Array<Record<string, unknown>>,
  feed: {} as unknown,
}));

vi.mock("@/lib/prisma", () => {
  let n = 0;
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async (args: Record<string, unknown> = {}) => {
          calls.push({ model: name, op, args });
          if (name === "workspaceClient" && op === "findFirst") return { id: "client1", taskBoardColumns: state.columns };
          if (name === "task" && op === "findMany") return state.tasks;
          if (name === "clientRelease" && op === "findMany") return state.releases;
          if (op === "findFirst") return null;
          if (op === "groupBy") return [];
          if (op === "create") return { id: `${name}_new_${++n}` };
          if (op === "updateMany") return { count: 1 };
          return null;
        },
      },
    );
  const client = { task: model("task"), clientRelease: model("clientRelease"), workspaceClient: model("workspaceClient"), auditLog: model("auditLog") };
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client) } };
});

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: async () => new Response("﻿" + JSON.stringify(state.feed), { status: 200 }),
}));

import { applyForgeImport, ForgeImportError, planForgeImport } from "../forge-import";
import { FORGE_STAGES } from "@/lib/forge-import/stages";

const COLUMNS = Object.values(FORGE_STAGES)
  .filter((p) => p.column)
  .map((p, i) => ({ id: `col_${String(i).padStart(6, "0")}`, name: p.column, stage: p.status }));

function dbTask(over: Record<string, unknown>) {
  return {
    status: "BACKLOG",
    parentId: null,
    archivedAt: null,
    itemType: null,
    productCardId: null,
    externalRef: null,
    description: null,
    releaseId: null,
    tier: null,
    area: null,
    estimateHours: null,
    boardColumnId: null,
    metadata: null,
    ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  state.columns = COLUMNS;
  state.releases = [];
  state.tasks = [
    dbTask({ id: "t_rate", title: "Rate Course", metadata: { clickup: { dept: "x" } } }),
    dbTask({ id: "t_hazards", title: "Distance to Hazards", status: "DONE", archivedAt: new Date() }),
  ];
  state.feed = {
    features: [
      { id: "1", name: "Rate Course", workflowStage: "future-idea", category: "Premium Perks", featurePrice: "free" },
      { id: "2", name: "Distance to Hazards", workflowStage: "live-features", stageDates: { "live-features": "2026-07-01" }, releaseId: "r1" },
      { id: "3", name: "Swing Analysis", workflowStage: "triage" },
    ],
    subitems: [{ id: "4", name: "Ai Swing Coach", parentFeatureId: "3", workflowStage: "triage" }],
    bugs: [],
    feedback: [],
    releases: [{ id: "r1", name: "v1.1.0 | Q2: Bags", versionNumber: "1.1.0", startWeek: "2026-06-30", endWeek: "2026-07-21" }],
  };
});

const base = { workspaceId: "ws1", clientId: "client1", actorId: "u1", approvedReviewLinks: [] };
const writes = () => calls.filter((c) => !["findMany", "findFirst", "groupBy"].includes(c.op));

describe("planning", () => {
  it("writes nothing at all", async () => {
    const plan = await planForgeImport({ workspaceId: "ws1", clientId: "client1" });
    expect(plan.counts.considered).toBe(4);
    expect(writes()).toEqual([]);
  });

  it("refuses a feed that isn't https", async () => {
    await expect(planForgeImport({ workspaceId: "ws1", clientId: "client1", feedUrl: "http://ops.example/items" })).rejects.toBeInstanceOf(ForgeImportError);
  });
});

describe("applying", () => {
  it("never deletes, archives, reparents or re-statuses an existing task", async () => {
    await applyForgeImport(base);
    for (const c of writes()) {
      expect(["create", "updateMany"], `${c.model}.${c.op}`).toContain(c.op);
      if (c.model === "task" && c.op === "updateMany") {
        const data = c.args.data as Record<string, unknown>;
        for (const k of ["archivedAt", "parentId", "status", "title", "deletedAt"]) expect(data, k).not.toHaveProperty(k);
        // Every update is scoped to this client, so a stale id can't touch another client's task.
        expect(c.args.where).toMatchObject({ workspaceId: "ws1", clientId: "client1" });
      }
    }
  });

  it("creates the release, the new cards (sub-item under its feature), and links the archived dev task", async () => {
    const r = await applyForgeImport(base);
    expect(r).toMatchObject({ releasesCreated: 1, created: 3, linked: 1, devLinked: 1 });
    const creates = calls.filter((c) => c.model === "task" && c.op === "create").map((c) => c.args.data as Record<string, unknown>);
    const hazards = creates.find((d) => d.title === "Distance to Hazards")!;
    expect(hazards).toMatchObject({ status: "DONE", itemType: "feature", externalRef: "forge:2", releaseId: expect.stringMatching(/^clientRelease_new_/) });
    expect((hazards.completedAt as Date).toISOString().slice(0, 10)).toBe("2026-07-01");
    const swing = creates.find((d) => d.title === "Swing Analysis")!;
    const coach = creates.find((d) => d.title === "Ai Swing Coach")!;
    expect(coach.parentId).toBeTruthy();
    expect(swing.parentId).toBeNull();
    const devLink = calls.find((c) => c.op === "updateMany" && (c.args.data as Record<string, unknown>).productCardId);
    expect(devLink!.args.where).toMatchObject({ id: { in: ["t_hazards"] }, itemType: null, productCardId: null });
  });

  it("only fills what's empty on a task that becomes a card, keeping its own metadata", async () => {
    await applyForgeImport(base);
    const link = calls.find((c) => c.op === "updateMany" && (c.args.where as Record<string, unknown>).id === "t_rate")!;
    const data = link.args.data as Record<string, unknown>;
    expect(data).toMatchObject({ itemType: "feature", externalRef: "forge:1", tier: "free", area: "Premium Perks" });
    expect(data.metadata).toMatchObject({ clickup: { dept: "x" }, forge: { id: "1" } });
  });

  it("refuses to run until the board has every column it needs", async () => {
    state.columns = COLUMNS.filter((c) => c.name !== "Triage");
    await expect(applyForgeImport(base)).rejects.toThrow(/Triage/);
    expect(writes()).toEqual([]);
  });

  it("records who ran it", async () => {
    await applyForgeImport(base);
    expect(calls.find((c) => c.model === "auditLog")?.args.data).toMatchObject({ action: "tasks.forge_import.applied", actorId: "u1" });
  });
});
