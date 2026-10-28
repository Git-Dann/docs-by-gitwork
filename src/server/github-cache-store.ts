/**
 * Postgres-backed second tier for the GitHub conditional-request cache (CLAUDE.md §84.15).
 *
 * The in-memory LRU in src/lib/github-cache.ts is emptied by every deploy, so the first rescan of
 * every repo after one paid full price against the shared 5,000/hour token. This store keeps the
 * ETag / Last-Modified and (gzipped) body in `GithubResponseCache`, so validators survive a
 * restart and GitHub can keep answering 304.
 *
 * Server only: imports node:crypto, node:zlib and Prisma. It is attached by src/instrumentation.ts;
 * github.ts never imports it (github.ts is also in the browser bundle).
 *
 * - Row id is SHA-256 of the cache key. The key holds a 64-bit hash of the token, never the token,
 *   and contains NUL separators Postgres text cannot store; hashing handles both.
 * - Bounded: `maxRows` and `maxBytes` (compressed). Pruned on write, at most every
 *   `pruneEveryMs`: rows unused for `maxAgeDays` go first, then least-recently-used in batches
 *   until under both bounds. No cron needed.
 * - `lastUsedAt` is refreshed on read only when it is older than `touchAfterMs`, so a hot rescan
 *   does not turn every GET into a database write.
 * - Every method may reject; the cache treats that as "store unavailable" and carries on in memory.
 */
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { PrismaClient } from "@prisma/client";
import type { CachedGithubResponse, GithubCacheStore } from "@/lib/github-cache";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type GithubCacheStoreOptions = {
  maxRows: number;
  /** Compressed bytes across all rows. */
  maxBytes: number;
  maxAgeDays: number;
  pruneEveryMs: number;
  pruneBatch: number;
  touchAfterMs: number;
};

export const DEFAULT_GITHUB_CACHE_STORE_OPTIONS: GithubCacheStoreOptions = {
  maxRows: 20_000,
  maxBytes: 500 * 1024 * 1024,
  maxAgeDays: 30,
  pruneEveryMs: 10 * 60_000,
  pruneBatch: 500,
  touchAfterMs: 60 * 60_000,
};

/** The slice of Prisma this store uses, so tests can supply a fake. */
export type GithubCacheDb = Pick<PrismaClient, "githubResponseCache">;

export function storeRowId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function createGithubCacheStore(
  db: GithubCacheDb,
  options: Partial<GithubCacheStoreOptions> = {},
): GithubCacheStore & { prune(now?: Date): Promise<number> } {
  const opts = { ...DEFAULT_GITHUB_CACHE_STORE_OPTIONS, ...options };
  const table = db.githubResponseCache;
  let lastPrune = 0;
  let pruning: Promise<number> | null = null;

  async function prune(now = new Date()): Promise<number> {
    let removed = 0;
    const cutoff = new Date(now.getTime() - opts.maxAgeDays * 86_400_000);
    removed += (await table.deleteMany({ where: { lastUsedAt: { lt: cutoff } } })).count;

    // Least-recently-used out, a batch at a time, until under both bounds.
    for (let i = 0; i < 200; i++) {
      const agg = await table.aggregate({ _count: { _all: true }, _sum: { size: true } });
      const rows = agg._count._all;
      const bytes = agg._sum.size ?? 0;
      if (rows <= opts.maxRows && bytes <= opts.maxBytes) break;
      const oldest = await table.findMany({
        select: { key: true },
        orderBy: { lastUsedAt: "asc" },
        // Over on rows: remove exactly the excess (a batch at a time). Over on bytes only: we
        // cannot know how many rows that is, so take a batch and measure again.
        take: rows > opts.maxRows ? Math.min(opts.pruneBatch, rows - opts.maxRows) : opts.pruneBatch,
      });
      if (!oldest.length) break;
      removed += (await table.deleteMany({ where: { key: { in: oldest.map((r) => r.key) } } })).count;
    }
    return removed;
  }

  function maybePrune(): void {
    const now = Date.now();
    if (pruning || now - lastPrune < opts.pruneEveryMs) return;
    lastPrune = now;
    pruning = prune()
      .catch((err) => {
        console.warn(`[github] cache prune failed: ${err instanceof Error ? err.message : err}`);
        return 0;
      })
      .finally(() => {
        pruning = null;
      });
  }

  return {
    async get(key: string): Promise<CachedGithubResponse | null> {
      const id = storeRowId(key);
      const row = await table.findUnique({
        where: { key: id },
        select: { etag: true, lastModified: true, body: true, lastUsedAt: true },
      });
      if (!row) return null;
      const body = (await gunzipAsync(Buffer.from(row.body))).toString("utf8");
      if (Date.now() - row.lastUsedAt.getTime() > opts.touchAfterMs) {
        void table
          .update({ where: { key: id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
      }
      return {
        body,
        etag: row.etag,
        lastModified: row.lastModified,
        bytes: Buffer.byteLength(body, "utf8"),
      };
    },

    async set(key: string, entry: CachedGithubResponse): Promise<void> {
      const id = storeRowId(key);
      const compressed = await gzipAsync(Buffer.from(entry.body, "utf8"));
      const now = new Date();
      const data = {
        etag: entry.etag,
        lastModified: entry.lastModified,
        body: new Uint8Array(compressed),
        size: compressed.length,
        storedAt: now,
        lastUsedAt: now,
      };
      await table.upsert({ where: { key: id }, create: { key: id, ...data }, update: data });
      maybePrune();
    },

    async delete(key: string): Promise<void> {
      await table.deleteMany({ where: { key: storeRowId(key) } });
    },

    prune,
  };
}
