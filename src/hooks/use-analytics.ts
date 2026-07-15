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

export type { PortalAnalytics } from "@/server/analytics/portal-analytics";

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
