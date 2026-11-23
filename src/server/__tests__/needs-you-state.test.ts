/**
 * §151: a person's own snoozes and dismissals in the "Needs you" inbox. The rule that matters is
 * scope: every read and write is the caller's own user AND workspace, so nobody can see or change
 * anyone else's, and one row is kept per item without a unique constraint.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  workspaceId: string;
  userId: string;
  itemKey: string;
  fingerprint: string;
  state: string;
  until: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const db = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(row[k as keyof Row]);
    return row[k as keyof Row] === v;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    needsYouState: {
      findMany: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
        const out = db.rows.filter((r) => matches(r, where));
        if (orderBy) out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return out.map((r) => ({ ...r }));
      }),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt" | "updatedAt"> }) => {
        const row = { ...data, id: `r${++db.seq}`, createdAt: new Date(), updatedAt: new Date() } as Row;
        db.rows.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        let count = 0;
        for (const r of db.rows) if (matches(r, where)) {
          Object.assign(r, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const before = db.rows.length;
        db.rows = db.rows.filter((r) => !matches(r, where));
        return { count: before - db.rows.length };
      }),
    },
  },
}));

const auth = vi.hoisted(() => ({ user: { id: "u1", workspaceId: "w1" } as Record<string, unknown> }));
vi.mock("@/server/auth/effective-user", () => ({ requireAuthedUser: vi.fn(async () => auth.user) }));

import { pruneHolds, readHolds, setHold } from "@/server/needs-you-state";
import { POST } from "@/app/api/hq/needs-you/state/route";

const NOW = new Date("2026-11-20T12:00:00Z");
const ME = { id: "u1", workspaceId: "w1" };
const OTHER = { id: "u2", workspaceId: "w1" };
const ME_ELSEWHERE = { id: "u1", workspaceId: "w2" };
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

beforeEach(() => {
  db.rows = [];
  db.seq = 0;
  auth.user = { id: "u1", workspaceId: "w1" };
});

describe("setHold", () => {
  it("keeps one person's snooze to themselves, in their own workspace", async () => {
    await setHold(OTHER, { action: "dismiss", itemKey: "docs:d1", fingerprint: "viewed" }, NOW);
    await setHold(ME_ELSEWHERE, { action: "dismiss", itemKey: "docs:d1", fingerprint: "viewed" }, NOW);
    await setHold(ME, { action: "snooze", itemKey: "docs:d1", fingerprint: "viewed", until: inHours(5) }, NOW);

    const mine = await readHolds(ME);
    expect(mine).toHaveLength(1);
    expect(mine[0].state).toBe("snoozed");
    expect((await readHolds(OTHER))[0].state).toBe("dismissed");
    expect((await readHolds(ME_ELSEWHERE))[0].state).toBe("dismissed");
  });

  it("clears only the caller's own row", async () => {
    await setHold(OTHER, { action: "dismiss", itemKey: "docs:d1", fingerprint: "1" }, NOW);
    await setHold(ME, { action: "dismiss", itemKey: "docs:d1", fingerprint: "1" }, NOW);
    await setHold(ME, { action: "clear", itemKey: "docs:d1" }, NOW);
    expect(await readHolds(ME)).toHaveLength(0);
    expect(await readHolds(OTHER)).toHaveLength(1);
  });

  it("keeps one row per item, updating it and removing duplicates", async () => {
    db.rows.push(
      { id: "a", workspaceId: "w1", userId: "u1", itemKey: "docs:d1", fingerprint: "1", state: "dismissed", until: null, createdAt: NOW, updatedAt: new Date(NOW.getTime() - 1000) },
      { id: "b", workspaceId: "w1", userId: "u1", itemKey: "docs:d1", fingerprint: "1", state: "dismissed", until: null, createdAt: NOW, updatedAt: NOW },
    );
    await setHold(ME, { action: "snooze", itemKey: "docs:d1", fingerprint: "2", until: inHours(3) }, NOW);
    const rows = await readHolds(ME);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "b", state: "snoozed", fingerprint: "2" });
  });

  it("refuses a key no source makes, and a snooze in the past or too far ahead", async () => {
    await expect(setHold(ME, { action: "dismiss", itemKey: "bogus:1", fingerprint: "1" }, NOW)).rejects.toThrow(/isn't an item/);
    await expect(setHold(ME, { action: "snooze", itemKey: "docs:1", fingerprint: "1", until: inHours(-1) }, NOW)).rejects.toThrow(/future/);
    await expect(setHold(ME, { action: "snooze", itemKey: "docs:1", fingerprint: "1", until: inHours(24 * 40) }, NOW)).rejects.toThrow(/30 days/);
    expect(db.rows).toHaveLength(0);
  });
});

describe("pruneHolds", () => {
  it("only ever deletes the caller's own rows, whatever ids it is handed", async () => {
    await setHold(OTHER, { action: "dismiss", itemKey: "docs:gone", fingerprint: "1" }, NOW);
    await setHold(ME, { action: "dismiss", itemKey: "docs:gone", fingerprint: "1" }, NOW);
    const all = db.rows.map((r) => ({ ...r }));
    // Hand it every row (including the other person's): the source was read and the item is gone.
    await pruneHolds(ME, all, [], ["docs"], NOW);
    expect(await readHolds(ME)).toHaveLength(0);
    expect(await readHolds(OTHER)).toHaveLength(1);
  });
});

describe("POST /api/hq/needs-you/state", () => {
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://x/api/hq/needs-you/state", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("writes for the signed-in person, never for a user named in the body", async () => {
    const res = await POST(req({ action: "dismiss", itemKey: "docs:d1", fingerprint: "1", userId: "u2" }));
    expect(res.status).toBe(400);
    expect(db.rows).toHaveLength(0);

    const ok = await POST(req({ action: "dismiss", itemKey: "docs:d1", fingerprint: "1" }));
    expect(ok.status).toBe(200);
    expect(db.rows).toEqual([expect.objectContaining({ userId: "u1", workspaceId: "w1", itemKey: "docs:d1" })]);
  });

  it("refuses while viewing as someone", async () => {
    const res = await POST(req({ action: "dismiss", itemKey: "docs:d1", fingerprint: "1" }, { "x-view-as-user": "u1" }));
    expect(res.status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });
});
