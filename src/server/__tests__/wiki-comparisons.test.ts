/**
 * The comparison store against a mocked database: what is written is re-parsed, a write
 * past a limit is refused before it reaches the database, and every read and write is
 * scoped through the client's own wiki.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> & { id: string; wikiClientId: string }>,
  created: null as null | Record<string, unknown>,
  updated: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
  findFirstWhere: [] as unknown[],
  count: 0,
}));

function payload(r: Record<string, unknown>) {
  return {
    id: r.id,
    title: r.title ?? "T",
    description: r.description ?? null,
    columns: r.columns ?? [],
    rows: r.rows ?? [],
    orderKey: r.orderKey ?? 0,
    updatedAt: new Date("2026-10-20T00:00:00Z"),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: {
      upsert: vi.fn(async () => ({ id: "wiki-1", _count: { comparisons: db.count } })),
      findUnique: vi.fn(async () => ({
        comparisonsEnabled: true,
        comparisons: db.rows.filter((r) => r.wikiClientId === "client-1").map(payload),
      })),
    },
    wikiComparison: {
      findFirst: vi.fn(async (args: { where: { id?: string; wiki?: { clientId: string }; wikiId?: string } }) => {
        db.findFirstWhere.push(args.where);
        if (args.where.wikiId) return null; // the orderKey lookup
        const row = db.rows.find(
          (r) => r.id === args.where.id && r.wikiClientId === args.where.wiki?.clientId,
        );
        return row ? payload(row) : null;
      }),
      findMany: vi.fn(async (args: { where: { wiki: { clientId: string } } }) =>
        db.rows.filter((r) => r.wikiClientId === args.where.wiki.clientId).map((r) => ({ id: r.id })),
      ),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.created = args.data;
        return payload({ id: "new", ...args.data });
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        db.updated.push(args);
        const row = db.rows.find((r) => r.id === args.where.id)!;
        return payload({ ...row, ...args.data });
      }),
      delete: vi.fn(async () => ({ id: "x" })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import {
  ComparisonLimitError,
  ComparisonNotFoundError,
  createWikiComparison,
  loadWikiComparisons,
  reorderWikiComparisons,
  updateWikiComparison,
} from "../wiki-comparisons";

beforeEach(() => {
  db.rows = [
    { id: "mine", wikiClientId: "client-1", title: "Plans", columns: [{ id: "a", title: "A" }], rows: [] },
    { id: "theirs", wikiClientId: "client-2", title: "Other client" },
  ];
  db.created = null;
  db.updated = [];
  db.findFirstWhere = [];
  db.count = 0;
});

const input = (columns: number) => ({
  title: "  What's in each plan  ",
  description: "",
  columns: Array.from({ length: columns }, (_, i) => ({ id: `c${i}`, title: `Plan ${i}` })),
  rows: [
    {
      id: "r1",
      kind: "row" as const,
      label: "Sync",
      cells: { c0: { state: "yes" as const }, ghost: { state: "yes" as const } },
    },
  ],
});

describe("createWikiComparison", () => {
  it("stores the RE-PARSED content: a cell for a column not in the table is dropped", async () => {
    const t = await createWikiComparison("client-1", input(3));
    const stored = db.created as { rows: Array<{ cells: Record<string, unknown> }>; title: string; description: unknown };
    expect(Object.keys(stored.rows[0].cells)).toEqual(["c0"]);
    expect(stored.title).toBe("What's in each plan");
    expect(stored.description).toBeNull();
    expect(t.columns).toHaveLength(3);
  });

  it("refuses a 46th column before anything reaches the database", async () => {
    await expect(createWikiComparison("client-1", input(46))).rejects.toBeInstanceOf(ComparisonLimitError);
    expect(db.created).toBeNull();
  });

  it("accepts exactly 45", async () => {
    const t = await createWikiComparison("client-1", input(45));
    expect(t.columns).toHaveLength(45);
  });

  it("refuses a table past the per-wiki limit", async () => {
    db.count = 40;
    await expect(createWikiComparison("client-1", input(2))).rejects.toThrow(/at most 40/);
  });
});

describe("scoping — an id from another client's wiki can be neither read nor written", () => {
  it("update looks the table up THROUGH the client's wiki and 404s a foreign id", async () => {
    await expect(updateWikiComparison("client-1", "theirs", input(2))).rejects.toBeInstanceOf(
      ComparisonNotFoundError,
    );
    expect(db.findFirstWhere[0]).toEqual({ id: "theirs", wiki: { clientId: "client-1" } });
    expect(db.updated).toHaveLength(0);
  });

  it("reorder writes only this client's tables, ignoring foreign ids", async () => {
    await reorderWikiComparisons("client-1", ["theirs", "mine"]);
    expect(db.updated.map((u) => u.where.id)).toEqual(["mine"]);
    expect(db.updated[0].data).toEqual({ orderKey: 0 });
  });
});

describe("loadWikiComparisons", () => {
  it("parses stored JSON defensively on the way out", async () => {
    db.rows[0].rows = [{ id: "r", kind: "row", label: "x", cells: { a: { state: "bogus" } } }];
    const section = await loadWikiComparisons("client-1");
    expect(section.enabled).toBe(true);
    expect(section.comparisons.map((c) => c.id)).toEqual(["mine"]);
    expect(section.comparisons[0].rows[0].cells).toEqual({});
  });
});
