/**
 * golf-cache.ts — tiny in-process TTL cache for the Golf Data console's live
 * external reads (course backend + app analytics). Foundry runs as a single
 * long-lived container, so an in-memory Map is the lightest effective cache:
 * first load pays the external latency, subsequent loads within the TTL are
 * instant, and the upstream APIs (+ CockroachDB cold starts) get hit far less.
 *
 * `force` bypasses + refreshes the entry (wired to the console's Refresh button).
 */

interface Entry {
  expiresAt: number;
  value: unknown;
}

const store = new Map<string, Entry>();

/** Default TTL for live golf reads. */
export const GOLF_CACHE_TTL_MS = 5 * 60 * 1000;

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const ttl = opts.ttlMs ?? GOLF_CACHE_TTL_MS;
  const now = Date.now();

  if (!opts.force) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now) return hit.value as T;
  }

  const value = await loader();
  store.set(key, { expiresAt: now + ttl, value });
  return value;
}

/** Drop every cached golf entry for a client (keys are `<kind>:<clientId>`). */
export function bustGolfCache(clientId: string): void {
  const suffix = `:${clientId}`;
  for (const k of store.keys()) if (k.endsWith(suffix)) store.delete(k);
}
