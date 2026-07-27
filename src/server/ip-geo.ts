/**
 * IP → coarse geo (country/city) lookup.
 *
 * Background: on Vercel, geo arrived free in `x-vercel-ip-*` request headers.
 * Since the VPS migration there's no such header (nginx doesn't ship GeoIP by
 * default), so `geoFromRequest` returns nulls and doc-open notifications fell
 * back to printing a raw IP ("Opened from 154.192.49.228"). This restores the
 * city/country by resolving the visitor IP once per view.
 *
 * Deliberately dependency-free and fail-soft:
 *  - no API key, no npm package, no DB table
 *  - short timeout; ANY failure resolves to nulls (tracking still records the
 *    view, it just has no location)
 *  - in-memory cache so repeat views from the same IP cost nothing
 *  - private/loopback IPs are skipped entirely
 *
 * If the VPS later gains nginx GeoIP2 (or Cloudflare fronts the site), the
 * header path in `geoFromRequest` wins and this never runs.
 */

import { isPrivateIp } from "@/server/visitor-context";

export interface IpGeo {
  country: string | null;
  city: string | null;
}

const EMPTY: IpGeo = { country: null, city: null };

// Per-process cache. Bounded so a burst of unique IPs can't grow it unchecked;
// entries expire so a re-used IP eventually refreshes.
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;
const cache = new Map<string, { at: number; geo: IpGeo }>();

const TIMEOUT_MS = 1500;

/**
 * Resolve an IP to { country, city }. Never throws; returns nulls on any
 * failure, an unusable IP, or a timeout.
 */
export async function resolveGeoForIp(ip: string | null | undefined): Promise<IpGeo> {
  if (!ip) return EMPTY;
  const key = ip.trim();
  if (!key || isPrivateIp(key)) return EMPTY;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.geo;

  let geo = EMPTY;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // ipwho.is — free, keyless, HTTPS, no attribution requirement.
      const res = await fetch(
        `https://ipwho.is/${encodeURIComponent(key)}?fields=success,country_code,city`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          success?: boolean;
          country_code?: string | null;
          city?: string | null;
        };
        if (data?.success !== false) {
          geo = {
            country: data.country_code?.trim() || null,
            city: data.city?.trim() || null,
          };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network error, abort, or bad JSON — fall through with nulls.
    geo = EMPTY;
  }

  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest inserted key.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { at: Date.now(), geo });
  return geo;
}
