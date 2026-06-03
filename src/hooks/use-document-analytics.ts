/**
 * React Query hooks for document engagement analytics (Phase 1).
 *
 *   useDocumentAnalytics(id)      → GET /api/documents/[id]/analytics   (per-document depth)
 *   useWorkspaceDocAnalytics(...) → GET /api/documents/analytics        (cross-document rollup)
 *
 * Types are imported (type-only) from the server module so the JSON contract has a single
 * source of truth — the import is erased at compile, so no server code reaches the client bundle.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  DocumentAnalytics,
  WorkspaceDocAnalytics,
} from "@/server/document-analytics";

export type {
  DocumentAnalytics,
  WorkspaceDocAnalytics,
  SectionEngagement,
  DocumentVisitRow,
} from "@/server/document-analytics";

export function useDocumentAnalytics(documentId: string | undefined) {
  return useQuery({
    queryKey: ["document-analytics", documentId ?? "—"],
    enabled: Boolean(documentId),
    queryFn: () =>
      apiFetch<{ analytics: DocumentAnalytics }>(`/api/documents/${documentId}/analytics`).then(
        (r) => r.analytics,
      ),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export function useWorkspaceDocAnalytics(params: { documentType?: string; days?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.documentType && params.documentType !== "ALL") qs.set("documentType", params.documentType);
  if (params.days) qs.set("days", String(params.days));
  const query = qs.toString();
  return useQuery({
    queryKey: ["workspace-doc-analytics", query],
    queryFn: () =>
      apiFetch<{ analytics: WorkspaceDocAnalytics }>(
        `/api/documents/analytics${query ? `?${query}` : ""}`,
      ).then((r) => r.analytics),
    staleTime: 30_000,
  });
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Humanise a millisecond duration for the analytics UI: "0s", "45s", "3m 12s", "1h 4m". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a 0–1 rate as a percentage string, or "—" when null. */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}
