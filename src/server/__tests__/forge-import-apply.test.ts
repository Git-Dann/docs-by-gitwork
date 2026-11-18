/**
 * The import's write path, against a recording fake database: what it may write, and what it
 * must never do. A plan bug can make a card wrong; only this file can make it destructive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { model: string; op: string; args: Record<string, unknown> };
const calls = vi.hoisted(() => [] as Call[]);
const state = vi.hoisted(() => ({
  locked: true,
  transactions: 0,
  columns: [] as unknown[],
  tasks: [] as Array<Record<string, unknown>>,
  releases: [] as Array<Record<string, unknown>>,
  feed: {} as unknown,
  keyDates: [] as Array<{ externalRef: string }>,
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
          if (name === "wikiBoardKeyDate" && op === "findMany") return state.keyDates;
          if (op === "findFirst") return null;
          if (op === "groupBy") return [];
          if (op === "create") return { id: `${name}_new_${++n}` };
          if (op === "updateMany") return { count: 1 };
          return null;
        },
      },
    );
  const client = {
    task: model("task"),
    clientRelease: model("clientRelease"),
    workspaceClient: model("workspaceClient"),
    auditLog: model("auditLog"),
    wikiBoardKeyDate: model("wikiBoardKeyDate"),
    // The per-client advisory lock (a tagged template in the code).
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ model: "$queryRaw", op: "lock", args: { sql: strings.join("?"), values } });
      return [{ locked: state.locked }];
    },
  };
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => {
        state.transactions++;
        return fn(client);
      },
    },
  };
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
  state.locked = true;
  state.transactions = 0;
  state.columns = COLUMNS;
  state.releases = [];
  state.keyDates = [];
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
const writes = () => calls.filter((c) => !["findMany", "findFirst", "groupBy", "lock"].includes(c.op));
/** Every task write is scoped to this client, either directly or as the first AND clause. */
const scopeOf = (where: Record<string, unknown>) =>
  Array.isArray(where.AND) ? (where.AND as Array<Record<string, unknown>>)[0] : where;
const taskUpdates = (id: string) =>
  calls.filter((c) => c.model === "task" && c.op === "updateMany" && (scopeOf(c.args.where as Record<string, unknown>).id === id));

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
        for (const k of ["archivedAt", "parentId", "status", "title", "deletedAt", "boardColumnId"]) expect(data, k).not.toHaveProperty(k);
        // Every update is scoped to this client, so a stale id can't touch another client's task.
        expect(scopeOf(c.args.where as Record<string, unknown>)).toMatchObject({ workspaceId: "ws1", clientId: "client1" });
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

  it("fills a task that becomes a card one field at a time, each only where it is still empty", async () => {
    await applyForgeImport(base);
    const fills = taskUpdates("t_rate").filter((c) => !("metadata" in (c.args.data as Record<string, unknown>)));
    const byField = new Map(fills.map((c) => [Object.keys(c.args.data as Record<string, unknown>)[0], c]));
    expect([...byField.keys()].sort()).toEqual(["area", "description", "externalRef", "itemType", "tier"]);
    // The emptiness test is IN the WHERE, so a value set since the board was read is kept.
    expect(byField.get("tier")!.args.where).toEqual({ AND: [{ id: "t_rate", workspaceId: "ws1", clientId: "client1" }, { tier: null }] });
    expect(byField.get("description")!.args.where).toMatchObject({ AND: [{ id: "t_rate" }, { OR: [{ description: null }, { description: "" }] }] });
  });

  it("never moves a team task into a column, and records what it filled so a re-run never refills it", async () => {
    await applyForgeImport(base);
    for (const c of taskUpdates("t_rate")) expect(c.args.data).not.toHaveProperty("boardColumnId");
    const meta = taskUpdates("t_rate").find((c) => "metadata" in (c.args.data as Record<string, unknown>))!;
    const m = (meta.args.data as { metadata: Record<string, unknown> }).metadata;
    expect(m).toMatchObject({ clickup: { dept: "x" }, forge: { id: "1" } });
    expect(((m.forge as Record<string, unknown>).filled as string[]).sort()).toEqual(["area", "description", "externalRef", "itemType", "tier"]);
  });

  it("does not refill a field a card had filled before, even when the team has since cleared it", async () => {
    state.tasks = [
      dbTask({ id: "card1", title: "Rate Course", itemType: "feature", externalRef: "forge:1", tier: null, metadata: { forge: { id: "1", filled: ["tier", "area"] } } }),
    ];
    state.feed = { ...(state.feed as object), features: [{ id: "1", name: "Rate Course", workflowStage: "future-idea", category: "Premium Perks", featurePrice: "free" }], subitems: [] };
    await applyForgeImport(base);
    const fields = taskUpdates("card1").flatMap((c) => Object.keys(c.args.data as Record<string, unknown>));
    expect(fields).not.toContain("tier");
    expect(fields).not.toContain("area");
  });

  it("takes a per-client lock first, and plans only once it holds it", async () => {
    await applyForgeImport(base);
    const lockAt = calls.findIndex((c) => c.op === "lock");
    const readAt = calls.findIndex((c) => c.model === "task" && c.op === "findMany");
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(readAt);
    expect(calls[lockAt].args.values).toEqual(["forge:client1"]);
    // One transaction: a failure part-way leaves the board as it was.
    expect(state.transactions).toBe(1);
  });

  it("refuses a second import for the same client while one is running, writing nothing", async () => {
    state.locked = false;
    await expect(applyForgeImport(base)).rejects.toMatchObject({ status: 409 });
    expect(writes()).toEqual([]);
    expect(calls.some((c) => c.model === "task" && c.op === "findMany")).toBe(false);
  });

  it("keys releases on their Forge id: a renamed one is reused, and it is stamped and given its doc", async () => {
    state.releases = [{ id: "rel_old", version: "v1.1.0", name: "Renamed in Foundry", externalRef: "forge:r1", docUrl: null }];
    (state.feed as Record<string, unknown>).releases = [
      { id: "r1", name: "v1.1.0 | Q2: Bags", versionNumber: "1.1.0", links: [{ label: "Release Doc", url: "https://docs.example/r1" }] },
    ];
    const r = await applyForgeImport(base);
    expect(r.releasesCreated).toBe(0);
    const doc = calls.find((c) => c.model === "clientRelease" && c.op === "updateMany")!;
    expect(doc.args).toMatchObject({ where: { id: "rel_old", docUrl: null }, data: { docUrl: "https://docs.example/r1" } });
  });

  it("never folds two Forge releases with the same version and name into one", async () => {
    state.releases = [{ id: "rel_plain", version: "v2.0.0", name: "Q4", externalRef: null, docUrl: null }];
    (state.feed as Record<string, unknown>).releases = [
      { id: "a", name: "v2.0.0 | Q4", versionNumber: "2.0.0" },
      { id: "b", name: "v2.0.0 | Q4", versionNumber: "2.0.0" },
    ];
    const r = await applyForgeImport(base);
    expect(r.releasesCreated).toBe(1);
    const stamp = calls.find((c) => c.model === "clientRelease" && c.op === "updateMany" && (c.args.data as Record<string, unknown>).externalRef)!;
    expect(stamp.args).toMatchObject({ where: { id: "rel_plain", externalRef: null }, data: { externalRef: "forge:a" } });
    const made = calls.find((c) => c.model === "clientRelease" && c.op === "create")!;
    expect(made.args.data).toMatchObject({ externalRef: "forge:b" });
  });

  it("hangs a sub-item one level deep: under its feature card's own parent when that card is a subtask", async () => {
    state.tasks = [dbTask({ id: "card_feat", title: "Swing Analysis", itemType: "feature", externalRef: "forge:3", parentId: "top_card" })];
    await applyForgeImport(base);
    const coach = calls.find((c) => c.model === "task" && c.op === "create" && (c.args.data as Record<string, unknown>).title === "Ai Swing Coach")!;
    expect((coach.args.data as Record<string, unknown>).parentId).toBe("top_card");
  });

  it("refuses to run until the board has every column it needs", async () => {
    state.columns = COLUMNS.filter((c) => c.name !== "Triage");
    await expect(applyForgeImport(base)).rejects.toThrow(/Triage/);
    expect(writes()).toEqual([]);
  });

  it("brings the planning tool's calendar dates onto the Schedule once (§128)", async () => {
    (state.feed as Record<string, unknown>).companyDates = [
      { id: "469", title: "Mini Major", date: "2026-06-25", tracked: true },
      { id: "474", title: "Million Pound Drop", date: "2026-08-17", tracked: true },
    ];
    state.keyDates = [{ externalRef: "forge-date:469" }];
    const r = await applyForgeImport(base);
    const created = calls.find((c) => c.model === "wikiBoardKeyDate" && c.op === "createMany");
    expect((created?.args.data as Array<Record<string, unknown>>).map((d) => [d.externalRef, d.clientId, d.title])).toEqual([
      ["forge-date:474", "client1", "Million Pound Drop"],
    ]);
    expect(r.keyDatesCreated).toBe(1);
  });

  it("records who ran it", async () => {
    await applyForgeImport(base);
    expect(calls.find((c) => c.model === "auditLog")?.args.data).toMatchObject({ action: "tasks.forge_import.applied", actorId: "u1" });
  });
});
