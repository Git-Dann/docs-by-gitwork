/**
 * React Query hook for the P5.18 linked-documents widget.
 *
 * Fetches the doc's parent (if any) and direct children. The relationship is one-level —
 * children are docs with `parentId` pointing at this one. Re-fetched whenever the underlying
 * proposal changes (caller invalidates).
 */

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { DocumentType } from "@/types/proposal";

export interface RelationDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  documentType: DocumentType;
  status: string;
  updatedAt: string;
}

export interface RelationsPayload {
  parent: RelationDocument | null;
  children: RelationDocument[];
}

const relationsKey = (id: string) => ["document-relations", id] as const;

export function useDocumentRelations(documentId: string | undefined) {
  return useQuery({
    queryKey: relationsKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: () => apiFetch<RelationsPayload>(`/api/proposals/${documentId}/relations`),
    staleTime: 30_000,
  });
}

/** Helper for callers that mutated parentId on the doc and want the widget to re-fetch. */
export function useInvalidateDocumentRelations() {
  const qc = useQueryClient();
  return (documentId: string) => qc.invalidateQueries({ queryKey: relationsKey(documentId) });
}
