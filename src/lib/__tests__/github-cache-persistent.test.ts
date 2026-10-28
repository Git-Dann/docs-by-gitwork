// @vitest-environment node
/**
 * The persistent second tier of the GitHub conditional cache (CLAUDE.md §84.15). Memory is
 * emptied by every deploy; the store lets the first rescan after one still be answered by 304s.
 * These pin: a restart is survived, errors are never persisted, the store's own bounds hold,
 * and a broken or slow store degrades to memory-only without failing a request.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __flushGithubCacheWrites,
  __resetGithubCache,
  __resetGithubRateLimit,
  githubCacheStats,
  githubRequest,
  setGithubCacheStore,
} from "@/lib/github";
import {
  GithubConditionalCache,
  type CachedGithubResponse,
  type GithubCacheStore,
} from "@/lib/github-cache";
import { createGithubCacheStore, storeRowId, type GithubCacheDb } from "@/server/github-cache-store";

class FakeStore implements GithubCacheStore {
  rows = new Map<string, CachedGithubResponse>();
  calls = { get: 0, set: 0, delete: 0 };
  async get(key: string) {
    this.calls.get++;
    return this.rows.get(key) ?? null;
  }
  async set(key: string, entry: CachedGithubResponse) {
    this.calls.set++;
    this.rows.set(key, entry);
  }
  async delete(key: string) {
    this.calls.delete++;
    this.rows.delete(key);
  }
}

function stubFetch(responses: Array<() => Response>) {
  const calls: Array<Record<string, string>> = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ ...(init?.headers as Record<string, string>) });
      return responses[Math.min(i++, responses.length - 1)]();
    }),
  );
  return calls;
}
const ok = (body: unknown, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status: 200, headers });
const notModified = () => new Response(null, { status: 304 });

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  setGithubCacheStore(store);
  __resetGithubCache();
  __resetGithubRateLimit();
  process.env.GITHUB_TOKEN = "token-a";
});
afterEach(() => {
  setGithubCacheStore(null);
  vi.unstubAllGlobals();
});

describe("survives a restart", () => {
  it("a 200 is written through, and after memory is emptied a 304 is served from the store", async () => {
    stubFetch([ok({ name: "next.js" }, { etag: '"v1"' })]);
    await githubRequest("/repos/a/b");
    await __flushGithubCacheWrites();
    expect(store.rows.size).toBe(1);

    __resetGithubCache(); // the deploy
    const calls = stubFetch([notModified]);
    const body = await githubRequest<{ name: string }>("/repos/a/b");
    expect(calls[0]["If-None-Match"]).toBe('"v1"');
    expect(body).toEqual({ name: "next.js" });
    expect(githubCacheStats().restored).toBe(1);
    expect(githubCacheStats().notModified).toBe(1);
  });

  it("a fresh cache object over the same store reads the entry back", async () => {
    const a = new GithubConditionalCache({}, () => store);
    a.set("k", '{"x":1}', '"e"', null);
    await a.flush();
    const b = new GithubConditionalCache({}, () => store);
    expect((await b.lookup("k"))?.etag).toBe('"e"');
    // promoted into memory: a second lookup does not touch the store
    const gets = store.calls.get;
    await b.lookup("k");
    expect(store.calls.get).toBe(gets);
  });

  it("a 304 with nothing in memory or the store is still an error", async () => {
    stubFetch([notModified]);
    await expect(githubRequest("/repos/a/b")).rejects.toThrow();
  });
});

describe("errors are never persisted", () => {
  it("a 404 is not written, and removes a stored entry", async () => {
    stubFetch([ok({ n: 1 }, { etag: '"v1"' })]);
    await githubRequest("/x");
    await __flushGithubCacheWrites();
    expect(store.rows.size).toBe(1);

    stubFetch([() => new Response("nope", { status: 404 })]);
    await expect(githubRequest("/x")).rejects.toThrow();
    await __flushGithubCacheWrites();
    expect(store.rows.size).toBe(0);
  });

  it("a 500 never reaches the store", async () => {
    stubFetch([() => new Response("boom", { status: 500 })]);
    await expect(githubRequest("/x")).rejects.toThrow();
    await __flushGithubCacheWrites();
    expect(store.calls.set).toBe(0);
  });

  it("a 200 with no validator is not written", async () => {
    stubFetch([ok({ n: 1 })]);
    await githubRequest("/x");
    await __flushGithubCacheWrites();
    expect(store.calls.set).toBe(0);
  });

  it("the store never sees the token", async () => {
    process.env.GITHUB_TOKEN = "ghp_SECRET_TOKEN_VALUE";
    stubFetch([ok({ n: 1 }, { etag: '"v1"' })]);
    await githubRequest("/x");
    await __flushGithubCacheWrites();
    const [key] = [...store.rows.keys()];
    expect(key).not.toContain("SECRET");
    expect(storeRowId(key)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("a broken store degrades to memory", () => {
  it("a store whose reads reject: the request still succeeds and the store is skipped for a while", async () => {
    const bad: GithubCacheStore = {
      get: vi.fn(async () => {
        throw new Error("db down");
      }),
      set: vi.fn(async () => {
        throw new Error("db down");
      }),
      delete: vi.fn(async () => undefined),
    };
    setGithubCacheStore(bad);
    stubFetch([ok({ n: 1 }, { etag: '"v1"' }), notModified, ok({ n: 2 }, { etag: '"v2"' })]);
    expect(await githubRequest("/x")).toEqual({ n: 1 });
    expect(await githubRequest("/x")).toEqual({ n: 1 }); // served from memory on 304
    expect(await githubRequest("/y")).toEqual({ n: 2 }); // a memory miss: store still skipped
    await __flushGithubCacheWrites();
    expect(bad.get).toHaveBeenCalledTimes(1); // cooled down after the first failure
    expect(bad.set).not.toHaveBeenCalled();
    expect(githubCacheStats().storeErrors).toBeGreaterThanOrEqual(1);
  });

  it("a store that hangs costs at most the timeout", async () => {
    const hang: GithubCacheStore = {
      get: () => new Promise(() => undefined),
      set: () => new Promise(() => undefined),
      delete: () => new Promise(() => undefined),
    };
    const cache = new GithubConditionalCache({ storeTimeoutMs: 30 }, () => hang);
    const started = Date.now();
    expect(await cache.lookup("k")).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(500);
    expect(cache.stats().storeErrors).toBe(1);
  });

  it("a store that throws synchronously does not throw out of set()", () => {
    const sync: GithubCacheStore = {
      get: () => {
        throw new Error("x");
      },
      set: () => {
        throw new Error("x");
      },
      delete: () => {
        throw new Error("x");
      },
    };
    const cache = new GithubConditionalCache({}, () => sync);
    expect(cache.set("k", "{}", '"e"', null)).toBe(true);
    expect(() => cache.delete("k")).not.toThrow();
  });

  it("an oversize body read back from the store is ignored", async () => {
    store.rows.set("k", { body: "x".repeat(100), etag: '"e"', lastModified: null, bytes: 100 });
    const cache = new GithubConditionalCache({ maxEntryBytes: 10 }, () => store);
    expect(await cache.lookup("k")).toBeUndefined();
  });
});

// ── The Prisma store itself, against an in-memory fake of the one table it uses ─────────────────
type Row = {
  key: string;
  etag: string | null;
  lastModified: string | null;
  body: Uint8Array;
  size: number;
  storedAt: Date;
  lastUsedAt: Date;
};
function fakeDb() {
  const rows = new Map<string, Row>();
  const match = (r: Row, where: { key?: string | { in: string[] }; lastUsedAt?: { lt: Date } }) => {
    if (typeof where.key === "string" && r.key !== where.key) return false;
    if (where.key && typeof where.key === "object" && !where.key.in.includes(r.key)) return false;
    if (where.lastUsedAt && !(r.lastUsedAt < where.lastUsedAt.lt)) return false;
    return true;
  };
  const table = {
    findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null,
    update: async ({ where, data }: { where: { key: string }; data: Partial<Row> }) => {
      Object.assign(rows.get(where.key)!, data);
    },
    upsert: async ({ create, update }: { create: Row; update: Partial<Row> }) => {
      const existing = rows.get(create.key);
      if (existing) Object.assign(existing, update);
      else rows.set(create.key, { ...create });
    },
    deleteMany: async ({ where }: { where: Parameters<typeof match>[1] }) => {
      let count = 0;
      for (const r of [...rows.values()]) {
        if (!match(r, where)) continue;
        rows.delete(r.key);
        count++;
      }
      return { count };
    },
    aggregate: async () => ({
      _count: { _all: rows.size },
      _sum: { size: [...rows.values()].reduce((n, r) => n + r.size, 0) },
    }),
    findMany: async ({ take }: { take: number }) =>
      [...rows.values()]
        .sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime())
        .slice(0, take)
        .map((r) => ({ key: r.key })),
  };
  return { rows, db: { githubResponseCache: table } as unknown as GithubCacheDb };
}

describe("Postgres store", () => {
  it("round-trips a body, compressed at rest, keyed by a hash", async () => {
    const { rows, db } = fakeDb();
    const s = createGithubCacheStore(db, { pruneEveryMs: Infinity });
    const body = JSON.stringify({ files: Array.from({ length: 200 }, (_, i) => `src/file-${i}.ts`) });
    await s.set("anon\u0000accept\u0000https://api.github.com/x", { body, etag: '"e"', lastModified: null, bytes: 0 });
    const [row] = [...rows.values()];
    expect(row.key).toMatch(/^[0-9a-f]{64}$/);
    expect(row.size).toBeLessThan(body.length / 2);
    expect(row.size).toBe(row.body.length);
    const back = await s.get("anon\u0000accept\u0000https://api.github.com/x");
    expect(back?.body).toBe(body);
    expect(back?.etag).toBe('"e"');
  });

  it("prune holds the row bound, removing least-recently-used first", async () => {
    const { rows, db } = fakeDb();
    const s = createGithubCacheStore(db, { maxRows: 3, pruneBatch: 1, pruneEveryMs: Infinity });
    const base = Date.now();
    for (let i = 0; i < 6; i++) {
      rows.set(`r${i}`, {
        key: `r${i}`, etag: '"e"', lastModified: null, body: gzipSync("{}"), size: 10,
        storedAt: new Date(base), lastUsedAt: new Date(base - (10 - i) * 1000),
      });
    }
    await s.prune(new Date(base));
    expect([...rows.keys()].sort()).toEqual(["r3", "r4", "r5"]);
  });

  it("prune holds the byte bound, and drops rows unused for maxAgeDays", async () => {
    const { rows, db } = fakeDb();
    const s = createGithubCacheStore(db, { maxBytes: 25, maxAgeDays: 30, pruneBatch: 1, pruneEveryMs: Infinity });
    const now = Date.now();
    const mk = (key: string, ageMs: number) =>
      rows.set(key, {
        key, etag: '"e"', lastModified: null, body: gzipSync("{}"), size: 10,
        storedAt: new Date(now), lastUsedAt: new Date(now - ageMs),
      });
    mk("ancient", 40 * 86_400_000);
    mk("old", 3000);
    mk("mid", 2000);
    mk("new", 1000);
    await s.prune(new Date(now));
    expect([...rows.keys()].sort()).toEqual(["mid", "new"]);
  });

  it("set prunes on write, throttled", async () => {
    const { rows, db } = fakeDb();
    const s = createGithubCacheStore(db, { maxRows: 1, pruneEveryMs: 60_000 });
    await s.set("a", { body: "{}", etag: '"1"', lastModified: null, bytes: 2 });
    await new Promise((r) => setTimeout(r, 10));
    await s.set("b", { body: "{}", etag: '"2"', lastModified: null, bytes: 2 });
    await new Promise((r) => setTimeout(r, 10));
    // The first write pruned (nothing over the bound then); the second is inside the throttle.
    expect(rows.size).toBe(2);

    const unthrottled = fakeDb();
    const t = createGithubCacheStore(unthrottled.db, { maxRows: 1, pruneEveryMs: 0 });
    await t.set("a", { body: "{}", etag: '"1"', lastModified: null, bytes: 2 });
    await new Promise((r) => setTimeout(r, 10));
    await t.set("b", { body: "{}", etag: '"2"', lastModified: null, bytes: 2 });
    await new Promise((r) => setTimeout(r, 10));
    expect([...unthrottled.rows.keys()]).toEqual([storeRowId("b")]);
  });
});

describe("browser-bundle safety", () => {
  // github.ts is imported by client components. A Node built-in there broke the production build
  // once; the persistent tier must reach it only by injection.
  for (const file of ["src/lib/github.ts", "src/lib/github-cache.ts"]) {
    it(`${file} imports no Node built-in and no server module`, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      const specifiers = [...src.matchAll(/(?:from|import\(|require\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
      // The matcher must actually find github.ts's import, or a broken regex passes forever.
      if (file.endsWith("github.ts")) expect(specifiers).toContain("./github-cache");
      for (const s of specifiers) {
        expect(s).not.toMatch(/^node:/);
        expect(s).not.toMatch(/^(fs|path|crypto|zlib|util|stream|os|child_process|net|tls|http|https)$/);
        expect(s).not.toMatch(/(@\/server|\/server\/|@prisma|@\/lib\/prisma)/);
      }
      if (file.endsWith("github-cache.ts")) expect(src).not.toMatch(/\bBuffer\./);
    });
  }
});
