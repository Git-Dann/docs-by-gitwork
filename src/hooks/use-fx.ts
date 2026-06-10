"use client";

import { useQuery } from "@tanstack/react-query";

export interface FxRateResponse {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
}

/**
 * Fetches the latest USD → GBP rate from /api/fx/usd-gbp. Cached client-side
 * for 12 hours; upstream Frankfurter source is cached server-side too. On
 * failure the hook returns `data: undefined` and the caller falls back to
 * USD-only — never block the page on FX.
 */
export function useUsdToGbpRate() {
  return useQuery<FxRateResponse>({
    queryKey: ["fx", "usd-gbp"],
    queryFn: async () => {
      const res = await fetch("/api/fx/usd-gbp", { credentials: "include" });
      if (!res.ok) throw new Error("FX rate unavailable");
      const json = await res.json();
      return json.data ?? json;
    },
    // ECB rates only update once a day; 12 h staleness is plenty for the
    // UI and keeps re-renders cheap.
    staleTime: 1000 * 60 * 60 * 12,
    // If a fetch fails we'd rather show USD-only than spin forever.
    retry: 1,
  });
}

/** Format a USD figure to a localised currency string, no decimals. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback for an unknown ISO code — render raw with the code.
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}
