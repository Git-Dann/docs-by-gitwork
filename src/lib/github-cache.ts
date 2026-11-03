/**
 * Conditional-request cache for GitHub REST GETs.
 *
 * Every Pulse repo scan and CodeClear analysis shares ONE token, and its 5,000 REST calls an
 * hour are the platform's whole repo-scan capacity (CLAUDE.md §61, §62.7). GitHub does not
 * count a conditional request that comes back `304 Not Modified` against that limit. So we
 * remember each response's `ETag` / `Last-Modified` with its body, send them back on the next
 * identical GET, and on a 304 hand the stored body to the caller as if it were a 200. A repo
 * scanned twice (a rescan, a monitor, the same file read by two agents) then costs almost
 * nothing the second time.
 *
 * Measured 27 Oct 2026 against api.github.com/repos/vercel/next.js: with a token, three 304s in
 * a row left X-RateLimit-Used unchanged while a plain GET spent one. WITHOUT a token a 304 still
 * spends one, so this saves nothing on an unauthenticated server; it is the token path it is for.
 *
 * Rules, each with a test:
 * - Only successful (200) responses that carry a validator are stored. An error is never
 *   cached, and a stored body is only ever used when GitHub itself says 304.
 * - Entries are keyed on URL + Accept + a short hash of the token, never the token itself, so
 *   two tokens (or an unauthenticated call) never share an entry. A private repo's body read
 *   with one token cannot be served to a caller holding another.
 * - Bounded in-process LRU: by entry count and by total bytes. Oversize bodies are not stored.
 *
 * Second tier (CLAUDE.md §84.15). Memory alone is emptied by every deploy, so the next rescan of
 * every repo paid full price. A `GithubCacheStore` (Postgres, `src/server/github-cache-store.ts`)
 * can be attached: lookups read memory first, then the store; stored 200s and deletions are
 * written through to it in the background. The store is OPTIONAL and never trusted to be up:
 * - a read that fails or takes longer than `storeTimeoutMs` is treated as a miss, and the store
 *   is then skipped for `storeCooldownMs`, so a dead database costs one timeout, not one per GET;
 * - writes are fire-and-forget and their failures only mark the store down;
 * - a stored body is still only ever served on GitHub's own 304, so a stale or failed-to-delete
 *   row can never be returned as current: GitHub only answers 304 if its ETag still matches.
 *
 * ⚠️ This file and github.ts are imported by client components. Import NO Node built-ins and no
 * server module here; the store is injected from server code (src/instrumentation.ts).
 */

export type CachedGithubResponse = {
  body: string;
  etag: string | null;
  lastModified: string | null;
  bytes: number;
};

export type GithubCacheOptions = {
  maxEntries: number;
  maxBytes: number;
  maxEntryBytes: number;
  /** A persistent-store read slower than this is treated as a miss. */
  storeTimeoutMs: number;
  /** After a store failure, skip the store for this long. */
  storeCooldownMs: number;
};

/**
 * A persistent second tier. Implementations must never throw synchronously; rejected promises
 * are caught and treated as "store unavailable".
 */
export interface GithubCacheStore {
  get(key: string): Promise<CachedGithubResponse | null>;
  set(key: string, entry: CachedGithubResponse): Promise<void>;
  delete(key: string): Promise<void>;
}

export const DEFAULT_GITHUB_CACHE_OPTIONS: GithubCacheOptions = {
  maxEntries: 2_000,
  maxBytes: 50 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
  storeTimeoutMs: 500,
  storeCooldownMs: 30_000,
};

export type GithubCacheStats = {
  /** GETs sent with a validator that came back 304 and were served from the cache. */
  notModified: number;
  /** GETs sent with no stored entry (or whose stored entry GitHub replaced with a fresh 200). */
  misses: number;
  /** 200 responses stored. */
  stored: number;
  /** Responses not stored because the body was over the per-entry cap. */
  oversize: number;
  /** Entries read back from the persistent store (memory had none, e.g. after a restart). */
  restored: number;
  /** Persistent-store reads or writes that failed or timed out. */
  storeErrors: number;
  entries: number;
  bytes: number;
};

/** Short, non-reversible identity for a token. Empty string means unauthenticated. */
export function tokenIdentity(token: string | undefined | null): string {
  const t = token?.trim();
  if (!t) return "anon";
  // Two independent 32-bit FNV-1a passes (different offset bases) give 64 bits. Not
  // cryptographic, and it need not be: the value only keeps entries for different tokens
  // apart inside this process and is never sent or logged. node:crypto is avoided because
  // src/lib/github.ts is also imported by a client component, and a Node built-in breaks
  // the browser bundle (it failed the production build once).
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export function cacheKey(url: string, accept: string, tokenId: string): string {
  return `${tokenId}\u0000${accept}\u0000${url}`;
}

export class GithubConditionalCache {
  private readonly entries = new Map<string, CachedGithubResponse>();
  private totalBytes = 0;
  private counts = emptyCounts();
  private storeDownUntil = 0;
  private readonly pending = new Set<Promise<void>>();
  private readonly options: GithubCacheOptions;

  constructor(
    options: Partial<GithubCacheOptions> = {},
    /** Returns the persistent store, or null when none is attached. Read on every call. */
    private readonly storeProvider: () => GithubCacheStore | null = () => null,
  ) {
    this.options = { ...DEFAULT_GITHUB_CACHE_OPTIONS, ...options };
  }

  /**
   * Memory first, then the persistent store. A store hit is promoted into memory. Never throws,
   * and never waits on the store for longer than `storeTimeoutMs`.
   */
  async lookup(key: string): Promise<CachedGithubResponse | undefined> {
    const memory = this.get(key);
    if (memory) return memory;
    const store = this.liveStore();
    if (!store) return undefined;
    try {
      const entry = await withTimeout(store.get(key), this.options.storeTimeoutMs);
      if (!entry || (!entry.etag && !entry.lastModified)) return undefined;
      const bytes = byteLength(entry.body);
      if (bytes > this.options.maxEntryBytes) return undefined;
      const restored = { ...entry, bytes };
      this.put(key, restored);
      this.counts.restored++;
      return restored;
    } catch {
      this.storeFailed();
      return undefined;
    }
  }

  /** Wait for background store writes. Tests and shutdown only. */
  async flush(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /** Look up an entry and mark it most recently used. */
  get(key: string): CachedGithubResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  /** The conditional headers to send for a key, or {} when nothing is stored. */
  conditionalHeaders(key: string): Record<string, string> {
    const entry = this.entries.get(key);
    if (!entry) return {};
    const headers: Record<string, string> = {};
    if (entry.etag) headers["If-None-Match"] = entry.etag;
    else if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
    return headers;
  }

  /** Store a 200 body with its validators. Returns false when it was not stored. */
  set(key: string, body: string, etag: string | null, lastModified: string | null): boolean {
    if (!etag && !lastModified) return false;
    const bytes = byteLength(body);
    if (bytes > this.options.maxEntryBytes) {
      this.counts.oversize++;
      this.delete(key);
      return false;
    }
    const entry = { body, etag, lastModified, bytes };
    this.put(key, entry);
    this.counts.stored++;
    this.background((store) => store.set(key, entry));
    return true;
  }

  /** Remove from memory and (in the background) from the persistent store. */
  delete(key: string): void {
    this.dropMemory(key);
    this.background((store) => store.delete(key));
  }

  recordNotModified(): void {
    this.counts.notModified++;
  }

  recordMiss(): void {
    this.counts.misses++;
  }

  stats(): GithubCacheStats {
    return { ...this.counts, entries: this.entries.size, bytes: this.totalBytes };
  }

  /** Empty the in-memory tier only (the persistent store is untouched, as on a restart). */
  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
    this.counts = emptyCounts();
    this.storeDownUntil = 0;
  }

  private put(key: string, entry: CachedGithubResponse): void {
    this.dropMemory(key);
    this.entries.set(key, entry);
    this.totalBytes += entry.bytes;
    this.evict();
  }

  private dropMemory(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.entries.delete(key);
    this.totalBytes -= existing.bytes;
  }

  private liveStore(): GithubCacheStore | null {
    if (Date.now() < this.storeDownUntil) return null;
    try {
      return this.storeProvider();
    } catch {
      return null;
    }
  }

  private storeFailed(): void {
    this.counts.storeErrors++;
    this.storeDownUntil = Date.now() + this.options.storeCooldownMs;
  }

  private background(write: (store: GithubCacheStore) => Promise<void>): void {
    const store = this.liveStore();
    if (!store) return;
    let p: Promise<void>;
    try {
      p = withTimeout(write(store), this.options.storeTimeoutMs * 20);
    } catch {
      this.storeFailed();
      return;
    }
    const tracked = p.catch(() => this.storeFailed()).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  private evict(): void {
    // Map iteration order is insertion order, and get() re-inserts, so the first key is the
    // least recently used.
    while (
      this.entries.size > this.options.maxEntries ||
      this.totalBytes > this.options.maxBytes
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      // Memory pressure only: the persistent tier has its own, larger bounds.
      this.dropMemory(oldest.value);
    }
  }
}

function emptyCounts() {
  return { notModified: 0, misses: 0, stored: 0, oversize: 0, restored: 0, storeErrors: 0 };
}

/** UTF-8 byte length without Buffer, so this file stays browser-safe. */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("github cache store timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
