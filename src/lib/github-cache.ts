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
 * - No database and no dependencies: losing the cache on restart costs one full read per URL.
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
};

export const DEFAULT_GITHUB_CACHE_OPTIONS: GithubCacheOptions = {
  maxEntries: 2_000,
  maxBytes: 50 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
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
  private counts = { notModified: 0, misses: 0, stored: 0, oversize: 0 };

  constructor(private readonly options: GithubCacheOptions = DEFAULT_GITHUB_CACHE_OPTIONS) {}

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
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > this.options.maxEntryBytes) {
      this.counts.oversize++;
      this.delete(key);
      return false;
    }
    this.delete(key);
    this.entries.set(key, { body, etag, lastModified, bytes });
    this.totalBytes += bytes;
    this.counts.stored++;
    this.evict();
    return true;
  }

  delete(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.entries.delete(key);
    this.totalBytes -= existing.bytes;
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

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
    this.counts = { notModified: 0, misses: 0, stored: 0, oversize: 0 };
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
      this.delete(oldest.value);
    }
  }
}
