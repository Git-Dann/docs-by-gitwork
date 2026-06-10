/**
 * Live exchange rate helper. Source: Frankfurter (api.frankfurter.app) —
 * ECB-backed, free, no API key. Rates update daily ~16:00 CET.
 *
 * Cached via Next.js fetch with a 12-hour TTL so we make at most two
 * outbound requests per server per day. The 12h (vs 24h) gives us a fresh
 * read either side of the ECB cutover even if a server happens to spin up
 * just before it.
 *
 * If the API is unreachable, callers get `null` back and the UI falls
 * back to "show USD only" — never block a render on FX.
 */

const TWELVE_HOURS = 60 * 60 * 12;

export interface FxRate {
  /** Source currency (e.g. "USD"). */
  base: string;
  /** Target currency (e.g. "GBP"). */
  quote: string;
  /** 1 unit of `base` = `rate` units of `quote`. */
  rate: number;
  /** Frankfurter's date stamp for the ECB-published rate (YYYY-MM-DD). */
  asOf: string;
}

/**
 * Fetches the latest USD → GBP rate. Returns null on any failure so the
 * caller can degrade gracefully (UI shows USD only without breaking).
 */
export async function getUsdToGbpRate(): Promise<FxRate | null> {
  return fetchRate("USD", "GBP");
}

async function fetchRate(base: string, quote: string): Promise<FxRate | null> {
  try {
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}`;
    const res = await fetch(url, {
      next: { revalidate: TWELVE_HOURS, tags: [`fx:${base}-${quote}`] },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rate = data.rates?.[quote];
    if (!rate || !data.date) return null;
    return { base, quote, rate, asOf: data.date };
  } catch {
    return null;
  }
}
