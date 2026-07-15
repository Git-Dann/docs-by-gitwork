/**
 * React Query hooks for the Foundry analytics dashboard (super-admin only).
 *
 *   usePortalAnalytics(...) → GET /api/analytics/portal   (task throughput, mix, dev + client output)
 *
 * Types are imported (type-only) from the server module so the JSON contract has a single source
 * of truth — the import is erased at compile, so no server code reaches the client bundle. AI-usage
 * hooks slot in here alongside once that scope ships.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PortalAnalytics } from "@/server/analytics/portal-analytics";
import type { AiUsageAnalytics } from "@/server/ai-usage";

export type { PortalAnalytics } from "@/server/analytics/portal-analytics";
export type { AiUsageAnalytics } from "@/server/ai-usage";

export function usePortalAnalytics(params: { days?: number; bucket?: "day" | "week" } = {}) {
  const qs = new URLSearchParams();
  if (params.days) qs.set("days", String(params.days));
  if (params.bucket) qs.set("bucket", params.bucket);
  const query = qs.toString();
  return useQuery({
    queryKey: ["portal-analytics", query],
    queryFn: () =>
      apiFetch<{ analytics: PortalAnalytics }>(
        `/api/analytics/portal${query ? `?${query}` : ""}`,
      ).then((r) => r.analytics),
    staleTime: 30_000,
  });
}

export function useAiUsageAnalytics(params: { days?: number; module?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.days) qs.set("days", String(params.days));
  if (params.module) qs.set("module", params.module);
  const query = qs.toString();
  return useQuery({
    queryKey: ["ai-usage-analytics", query],
    queryFn: () =>
      apiFetch<{ analytics: AiUsageAnalytics }>(
        `/api/admin/ai-usage${query ? `?${query}` : ""}`,
      ).then((r) => r.analytics),
    staleTime: 30_000,
  });
}

/** Compact USD formatter for cost readouts: $0.0042, $3.20, $1.2k. */
export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

/** Compact token count: 940, 12.3k, 4.1M. */
export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Compact money in a given currency: £4.2k, $12.3k, £850. */
export function formatMoney(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  return `${symbol}${Math.round(amount)}`;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Humanise a lead-time duration in days: "—", "4h", "2.3d". */
export function formatLeadTimeDays(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  const days = ms / 86_400_000;
  if (days < 1) return `${Math.max(1, Math.round(ms / 3_600_000))}h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

/** Format a bucket key (YYYY-MM-DD) as a compact axis label. */
export function formatBucketLabel(iso: string, bucket: "day" | "week"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return bucket === "week" ? `${day} ${month}` : `${day} ${month}`;
}

/** Format a 0–1 rate as a percentage string, or "—" when null. */
export function formatPct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}
