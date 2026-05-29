/**
 * Document relations hook (P5.18).
 *
 * Reads from the shared `document-snapshot` React Query (`useDocumentCollab.useDocumentSnapshot`)
 * so this hook doesn't issue its own HTTP request — the snapshot endpoint already includes the
 * parent + children list. Same shape as the dedicated /api/proposals/[id]/relations route which
 * is kept around for non-editor callers.
 */

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { snapshotKey, type DocumentSnapshot, type RelationDocument } from "@/hooks/use-document-collab";

export type { RelationDocument };

export interface RelationsPayload {
  parent: RelationDocument | null;
  children: RelationDocument[];
}

export function useDocumentRelations(documentId: string | undefined) {
  return useQuery({
    queryKey: snapshotKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: () => apiFetch<DocumentSnapshot>(`/api/documents/${documentId}/snapshot`),
    refetchInterval: 10_000,
    staleTime: 8_000,
    select: (snap): RelationsPayload => snap.relations,
  });
}

/** Helper for callers that mutated parentId on the doc and want the snapshot to re-fetch. */
export function useInvalidateDocumentRelations() {
  const qc = useQueryClient();
  return (documentId: string) => qc.invalidateQueries({ queryKey: snapshotKey(documentId) });
}
