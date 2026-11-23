/**
 * Projects (CLAUDE.md §150), run through the real server module against a mocked store.
 *
 * Pinned: money figures are never even read for someone who can't see client financials; a
 * linked document's cost lines set the budget the way Money works it out; another client's
 * project is a 404 and another client's document can't be linked; a task, release or category
 * can only point at a live project of its own client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  documents: [] as Array<Record<string, unknown>>,
  placementReads: 0,
  documentSelects: [] as unknown[],
  created: [] as Array<Record<string, unknown>>,
}));

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "clientId" && v && typeof v === "object" && "in" in (v as object)) {
      if (!(v as { in: unknown[] }).in.includes(row.clientId)) return false;
      continue;
    }
    if (k === "id" && v && typeof v === "object" && "in" in (v as object)) {
      if (!(v as { in: unknown[] }).in.includes(row.id)) return false;
      continue;
    }
    if (k === "archivedAt" && v === null) {
      if (row.archivedAt) return false;
      continue;
    }
    if (typeof v !== "object" && row[k] !== v) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.projects.filter((p) => matches(p, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.projects.find((p) => matches(p, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        store.created.push(data);
        return { id: "new-project" };
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    clientRelease: { findMany: vi.fn(async () => []) },
    featureBlock: { findMany: vi.fn(async () => []) },
    task: {
      findMany: vi.fn(async () => [
        { id: "t1", title: "A", status: "DONE", estimateHours: 4, projectId: "p1", releaseId: null, featureBlockId: null, updatedAt: new Date() },
        { id: "t2", title: "B", status: "TODO", estimateHours: 6, projectId: "p1", releaseId: null, featureBlockId: null, updatedAt: new Date() },
      ]),
    },
    document: {
      findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: unknown }) => {
        store.documentSelects.push(select);
        return store.documents.filter((d) => matches(d, where));
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.documents.find((d) => matches(d, where)) ?? null),
    },
    placement: {
      findMany: vi.fn(async () => {
        store.placementReads += 1;
        return [
          {
            clientId: "c1",
            candidateId: "dev",
            startDate: new Date("2026-01-01"),
            endDate: null,
            candidate: { devGroup: "BENCH", rateCardPerson: { sourceRate: 4400, billingPeriod: "MONTH", sourceCurrencyCode: "GBP", archivedAt: null } },
          },
        ];
      }),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

vi.mock("@/server/fx", () => ({
  loadFxRates: vi.fn(async (base: string) => ({ base, rates: {}, asOf: null, error: null })),
}));

import { assertProjectInClient, createProject, getClientProject, listClientProjects } from "@/server/projects";

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  workspaceId: "w1",
  clientId: "c1",
  name: "Platform build",
  status: "ACTIVE",
  startDate: new Date("2026-11-02"),
  endDate: new Date("2026-12-31"),
  documentId: "d1",
  budgetAmount: null,
  budgetCurrency: null,
  createdAt: new Date("2026-11-01"),
  updatedAt: new Date("2026-11-01"),
  archivedAt: null,
  ...over,
});

const acceptedDoc = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  workspaceId: "w1",
  clientId: "c1",
  title: "Platform SOW",
  archivedAt: null,
  status: "ACCEPTED",
  acceptedAt: new Date("2026-10-20"),
  updatedAt: new Date("2026-10-20"),
  signatureRequests: [],
  costLineItems: [{ itemName: "proposal-role:dev", quantity: 3, unitCost: 5000, subtotal: 15000, costKind: "ONE_OFF" }],
  sections: [],
  ...over,
});

const now = new Date("2026-11-30T12:00:00Z");

beforeEach(() => {
  store.projects = [project()];
  store.documents = [acceptedDoc()];
  store.placementReads = 0;
  store.documentSelects = [];
  store.created = [];
});

describe("money figures", () => {
  it("are never read for someone who can't see client financials", async () => {
    const [p] = await listClientProjects("w1", "c1", { financials: false, now });
    expect(p.money).toBeNull();
    expect(store.placementReads).toBe(0);
    // The document is read for its title only, never its cost lines.
    expect(JSON.stringify(store.documentSelects)).not.toContain("costLineItems");
    expect(p.progress).toMatchObject({ tasks: 2, done: 1 });
  });

  it("take the budget from the linked document, as Money works it out", async () => {
    const [p] = await listClientProjects("w1", "c1", { financials: true, now });
    expect(p.money?.budget).toBe(15000);
    expect(p.money?.budgetSource).toBe("document");
    // November 2026: 21 weekdays; the project runs from Mon 2 Nov to today (30 Nov) = 21.
    expect(p.money?.spent).toBe(4400);
    expect(p.money?.verdict.kind).toBe("on_budget");
  });

  it("say why a document gives no budget instead of reading as £0", async () => {
    store.documents = [acceptedDoc({ acceptedAt: null, status: "SENT" })];
    const [p] = await listClientProjects("w1", "c1", { financials: true, now });
    expect(p.money?.budget).toBeNull();
    expect(p.money?.budgetProblem).toMatch(/hasn't been accepted/);
    expect(p.money?.verdict.kind).toBe("no_budget");
  });
});

describe("scoping", () => {
  it("another client's project is a 404", async () => {
    await expect(getClientProject("w1", "c2", "p1", { financials: true, now })).rejects.toMatchObject({ status: 404 });
  });

  it("an archived project is a 404", async () => {
    store.projects = [project({ archivedAt: new Date() })];
    await expect(getClientProject("w1", "c1", "p1", { financials: false, now })).rejects.toMatchObject({ status: 404 });
  });

  it("can't link another client's document", async () => {
    store.documents = [acceptedDoc({ clientId: "c2" })];
    await expect(createProject("w1", "c1", "u1", { name: "X", startDate: "2026-11-01", documentId: "d1" })).rejects.toMatchObject({ status: 400 });
    expect(store.created).toHaveLength(0);
  });

  it("drops a typed budget when a document is linked", async () => {
    await createProject("w1", "c1", "u1", { name: "X", startDate: "2026-11-01", documentId: "d1", budgetAmount: 999, budgetCurrency: "GBP" });
    expect(store.created[0]).toMatchObject({ documentId: "d1", budgetAmount: null });
  });

  it("a task, release or category can only point at a live project of its own client", async () => {
    await expect(assertProjectInClient("w1", "c1", "p1")).resolves.toBeUndefined();
    await expect(assertProjectInClient("w1", "c2", "p1")).rejects.toMatchObject({ status: 400 });
  });
});
