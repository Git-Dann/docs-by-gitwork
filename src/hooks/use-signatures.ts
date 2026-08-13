/**
 * React Query hooks for the e-signature flow (Sprint 4).
 *
 *   useSignatureRequests(documentId)     — list every SR for a doc, newest first
 *   useCreateSignatureRequest(docId)     — auto-creates from parties/signatures section
 *   useSendSignatureRequest(docId)       — flips DRAFT → SENT, returns signer URLs
 *   useRevokeSignatureRequest(docId)     — cancels a SENT request
 *
 * Mutations all invalidate the matching list query so the UI updates without a refetch dance.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type SignatureRequestStatus =
  | "DRAFT"
  | "SENT"
  | "COMPLETED"
  | "DECLINED"
  | "REVOKED"
  | "EXPIRED";

export type SignerStatus = "PENDING" | "VIEWED" | "SIGNED" | "DECLINED";

export interface SignatureSignerRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string | null;
  signerType?: string | null;
  variableName?: string | null;
  accessToken: string;
  status: SignerStatus;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  invitedAt: string | null;
  firstViewedAt: string | null;
  signingOrder: number | null;
  docusealSlug?: string | null;
  docusealEmbedSrc?: string | null;
}

export interface SignatureEventRecord {
  id: string;
  kind: string;
  signerId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SignatureRequestRecord {
  id: string;
  documentId: string;
  status: SignatureRequestStatus;
  message: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  docusealSubmissionId?: string | null;
  createdAt: string;
  updatedAt: string;
  signers: SignatureSignerRecord[];
  events?: SignatureEventRecord[];
  document?: {
    updatedAt: string;
  };
}

const requestKey = (documentId: string) => ["signature-requests", documentId] as const;

export function useSignatureRequests(documentId: string | undefined) {
  return useQuery({
    queryKey: requestKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: async (): Promise<SignatureRequestRecord[]> => {
      const res = await apiFetch<{ requests: SignatureRequestRecord[] }>(
        `/api/documents/${documentId}/signature-requests`,
      );
      return res.requests;
    },
    staleTime: 3_000,
  });
}

export function useCreateSignatureRequest(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { message?: string; expiresAt?: string } = {}) => {
      const res = await apiFetch<{ request: SignatureRequestRecord }>(
        `/api/documents/${documentId}/signature-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return res.request;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKey(documentId) }),
  });
}

export function usePushDocuSeal(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{
        requestId: string;
        docusealSubmissionId: string | number;
        signers: Array<SignatureSignerRecord>;
      }>(`/api/documents/${documentId}/docuseal`, {
        method: "POST",
      });
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKey(documentId) }),
  });
}

export function useSendSignatureRequest(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiFetch<{
        request: SignatureRequestRecord;
        signers: Array<{
          id: string;
          name: string;
          email: string;
          role: string;
          accessToken: string;
          url: string;
          status: SignerStatus;
        }>;
      }>(`/api/documents/${documentId}/signature-requests/${requestId}/send`, {
        method: "POST",
      });
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKey(documentId) }),
  });
}

export function useRevokeSignatureRequest(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      await apiFetch(`/api/documents/${documentId}/signature-requests/${requestId}/send`, {
        method: "DELETE",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKey(documentId) }),
  });
}

/** Convenience: pick the most-recent non-revoked request. */
export function findActiveRequest(
  requests: SignatureRequestRecord[] | undefined,
): SignatureRequestRecord | null {
  if (!requests?.length) return null;
  // SENT > COMPLETED > DRAFT preference; ignore REVOKED + DECLINED + EXPIRED unless nothing else.
  const live = requests.find((r) => r.status === "SENT") ?? requests.find((r) => r.status === "DRAFT");
  if (live) return live;
  return requests[0] ?? null;
}
