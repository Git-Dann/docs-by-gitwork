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

/** Plain words for the reader. Never the provider's raw text. */
function describeFxError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout/i.test(msg)) return "the exchange-rate service did not answer in time";
  if (/HTTP 4\d\d/.test(msg)) return "the exchange-rate service refused the request";
  if (/HTTP 5\d\d/.test(msg)) return "the exchange-rate service is down";
  return "the exchange rates could not be read";
}

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

/**
 * Every rate into `base`, for the Money page: 1 unit of each currency = rates[code] units of
 * base. Same source and cache as above. A failed read returns no rates, never a guess: the page
 * then leaves other currencies out of totals and says how much.
 */
export async function loadFxRates(base = "GBP"): Promise<import("@/lib/money").FxRates> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`, {
      next: { revalidate: TWELVE_HOURS, tags: [`fx:${base}-all`] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    // Frankfurter gives 1 base = r units of X; we want 1 X = 1/r base.
    const rates: Record<string, number> = {};
    for (const [code, r] of Object.entries(body.rates ?? {})) {
      if (typeof r === "number" && r > 0) rates[code] = 1 / r;
    }
    return { base, rates, asOf: typeof body.date === "string" ? body.date : null, error: null };
  } catch (err) {
    console.error("[fx] rates could not be read", err);
    // ⚠️ An empty rate table and "this currency has no rate" are not the same fact. Without
    // `error` the Money page can only say an amount was left out, never that the rate service
    // was unreachable — which is CLAUDE.md §35 in miniature.
    return { base, rates: {}, asOf: null, error: describeFxError(err) };
  }
}
