/**
 * Pulse scans and Study stay inside the caller's workspace (multi-tenant Phase 2.2b).
 * Another business's id reads as not found, nothing is written, and AI work runs on the
 * row's own workspace keys, never Gitwork's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  scan: { id: "s1", workspaceId: "w1", clientId: null, triggeredByUserId: "u1", status: "COMPLETED" } as Record<string, unknown>,
  study: { id: "st1", workspaceId: "w1" } as Record<string, unknown>,
  writes: [] as string[],
  workspaceLookups: [] as string[],
}));

function match(row: Record<string, unknown>, where: { id?: string; workspaceId?: string }) {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.workspaceId !== undefined && row.workspaceId !== where.workspaceId) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pulseScan: {
      findFirst: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) =>
        match(db.scan, a.where) ? { ...db.scan, checks: [], llmAnalysis: null } : null),
      count: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => (match(db.scan, a.where) ? 1 : 0)),
      deleteMany: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => {
        if (match(db.scan, a.where)) db.writes.push("scan.delete");
        return { count: 0 };
      }),
      update: vi.fn(async () => { db.writes.push("scan.update"); return db.scan; }),
    },
    study: {
      findFirst: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => (match(db.study, a.where) ? null : null)),
      count: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => (match(db.study, a.where) ? 1 : 0)),
      update: vi.fn(async () => { db.writes.push("study.update"); return db.study; }),
      deleteMany: vi.fn(async (a: { where: { id?: string; workspaceId?: string } }) => {
        if (match(db.study, a.where)) db.writes.push("study.delete");
        return { count: 0 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...db.study, plan: null })),
    },
    workspace: {
      findUniqueOrThrow: vi.fn(async (a: { where: { id: string } }) => {
        db.workspaceLookups.push(a.where.id);
        return { id: a.where.id, aiProvider: "ANTHROPIC", anthropicApiKey: null, platformAiKeysAllowed: false };
      }),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => {
    throw new Error("must not fall back to the Gitwork workspace");
  }),
}));

import { assertPulseScanAccess, deletePulseScan, getPulseScan, reanalysePulseScan, renamePulseScan } from "../pulse";
import { deleteStudy, runStudy, updateStudy } from "../study";

const SUPER_ADMIN_ELSEWHERE = { id: "x", workspaceId: "w2", role: "SUPER_ADMIN", permissions: [] } as never;

beforeEach(() => {
  db.writes = [];
  db.workspaceLookups = [];
});

describe("Pulse scans", () => {
  it("getPulseScan finds a scan only in its own workspace", async () => {
    expect(await getPulseScan("s1", "w2")).toBeNull();
  });

  it("refuses another business's scan even to its Super Admin", async () => {
    await expect(assertPulseScanAccess(SUPER_ADMIN_ELSEWHERE, "s1", async () => [])).rejects.toMatchObject({ status: 404 });
  });

  it("rename and delete write nothing for another workspace", async () => {
    await expect(renamePulseScan("s1", "w2", "x")).rejects.toMatchObject({ status: 404 });
    await deletePulseScan("s1", "w2");
    expect(db.writes).toEqual([]);
  });

  it("re-analysis reads the scan's own workspace, never Gitwork's", async () => {
    await expect(reanalysePulseScan("s1", "w2")).rejects.toMatchObject({ status: 404 });
    expect(db.workspaceLookups).toEqual([]);
    // In its own workspace it loads that workspace (and then stops: no AI key configured).
    await reanalysePulseScan("s1", "w1").catch(() => undefined);
    expect(db.workspaceLookups).toEqual(["w1"]);
  });
});

describe("Study", () => {
  it("update and delete write nothing for another workspace", async () => {
    expect(await updateStudy("st1", "w2", { title: "x" })).toBeNull();
    await deleteStudy("st1", "w2");
    expect(db.writes).toEqual([]);
  });

  it("a study runs on its own workspace's AI settings", async () => {
    await runStudy("st1").catch(() => undefined);
    expect(db.workspaceLookups).toEqual(["w1"]);
  });
});
