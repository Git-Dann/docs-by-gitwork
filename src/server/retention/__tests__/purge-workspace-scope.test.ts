/**
 * Purge review stays inside the caller's workspace.
 *
 * ⚠️ `canReviewPurges` is a WORKSPACE role — `isAtLeast(user.role, "ADMIN")`. Before this,
 * none of the three functions filtered on `workspaceId`, so an admin of any business could
 * list every other business's cold-archive ids from `/api/retention/purge-candidates` and
 * then hand them straight back to `/api/retention/purge`, which deletes the cold object and
 * stamps `purgedAt`. `/api/retention/**` is in no module gate, so nothing else stopped it.
 * It is the only destructive step in the retention lifecycle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; workspaceId: string | null; purgedAt: Date | null; byteSize: number | null };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  purged: [] as string[],
  removedFromStore: [] as string[],
}));

function match(row: Row, where: Record<string, unknown>): boolean {
  if (where.workspaceId !== undefined && row.workspaceId !== where.workspaceId) return false;
  if (where.purgedAt !== undefined && row.purgedAt !== null) return false;
  const id = where.id as { in?: string[] } | string | undefined;
  if (typeof id === "string" && row.id !== id) return false;
  if (id && typeof id === "object" && id.in && !id.in.includes(row.id)) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coldArchive: {
      findMany: vi.fn(async (a: { where: Record<string, unknown> }) =>
        db.rows.filter((r) => match(r, a.where)).map((r) => ({
          ...r,
          policyKey: "docs.view-events",
          entity: "DocumentViewEvent",
          scopeId: null,
          rowCount: 1,
          periodStart: null,
          periodEnd: null,
          purgeEligibleAt: new Date("2026-01-01"),
          store: "fs",
          ref: `ref-${r.id}`,
          workspace: { id: r.workspaceId, docsBackupEnabled: false, coldStoreFolderId: null },
        })),
      ),
      count: vi.fn(async (a: { where: Record<string, unknown> }) => db.rows.filter((r) => match(r, a.where)).length),
      aggregate: vi.fn(async (a: { where: Record<string, unknown> }) => ({
        _sum: { byteSize: db.rows.filter((r) => match(r, a.where)).reduce((n, r) => n + (r.byteSize ?? 0), 0) },
      })),
      update: vi.fn(async (a: { where: { id: string } }) => {
        db.purged.push(a.where.id);
        return {};
      }),
    },
  },
}));

vi.mock("@/server/retention/cold-store", () => ({
  getColdStore: vi.fn(async () => ({
    remove: vi.fn(async (ref: { ref: string }) => {
      db.removedFromStore.push(ref.ref);
    }),
  })),
}));

vi.mock("@/server/workspaces/scope", () => ({
  requestWorkspaceId: vi.fn(async (u: { workspaceId: string } | null) => u?.workspaceId ?? "gitwork"),
}));

import { approvePurge, getPurgeAttention, listPurgeCandidates } from "../purge";

const ADMIN_A = { id: "u-a", workspaceId: "ws-a", role: "ADMIN" } as never;

beforeEach(() => {
  db.rows = [
    { id: "a1", workspaceId: "ws-a", purgedAt: null, byteSize: 100 },
    { id: "b1", workspaceId: "ws-b", purgedAt: null, byteSize: 900 },
    { id: "b2", workspaceId: "ws-b", purgedAt: null, byteSize: 50 },
  ];
  db.purged = [];
  db.removedFromStore = [];
});

describe("listPurgeCandidates", () => {
  it("returns only the caller's workspace, so another business's ids are never handed out", async () => {
    const rows = await listPurgeCandidates("ws-a");
    expect(rows.map((r) => r.id)).toEqual(["a1"]);
  });
});

describe("getPurgeAttention", () => {
  it("counts and sizes only the caller's workspace", async () => {
    const out = await getPurgeAttention(ADMIN_A);
    expect(out).toEqual({ count: 1, reclaimableBytes: 100 });
  });

  it("stays empty for someone who may not review purges", async () => {
    const dev = { id: "u-d", workspaceId: "ws-a", role: "DEVELOPER" } as never;
    expect(await getPurgeAttention(dev)).toEqual({ count: 0, reclaimableBytes: 0 });
  });
});

describe("approvePurge", () => {
  it("purges an id the caller's workspace owns", async () => {
    const out = await approvePurge("ws-a", ["a1"]);
    expect(out.purged).toBe(1);
    expect(db.purged).toEqual(["a1"]);
    expect(db.removedFromStore).toEqual(["ref-a1"]);
  });

  it("DELETES NOTHING when handed another workspace's ids", async () => {
    const out = await approvePurge("ws-a", ["b1", "b2"]);
    expect(out.purged).toBe(0);
    expect(out.errors).toEqual([]);
    expect(db.purged).toEqual([]);
    // The cold object matters as much as the row: this is a file, permanently removed.
    expect(db.removedFromStore).toEqual([]);
  });

  it("purges only the owned ids out of a mixed list, rather than refusing the lot", async () => {
    const out = await approvePurge("ws-a", ["a1", "b1"]);
    expect(out.purged).toBe(1);
    expect(db.purged).toEqual(["a1"]);
  });
});
