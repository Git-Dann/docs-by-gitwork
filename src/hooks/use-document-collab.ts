/**
 * React Query hooks for P1 collaboration features: comments, versions, presence.
 */

"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Comments ───────────────────────────────────────────────────────────────

export interface DocumentCommentRecord {
  id: string;
  documentId: string;
  sectionId: string | null;
  parentId: string | null;
  authorKind: "PUBLIC" | "WORKSPACE";
  authorName: string;
  authorEmail: string | null;
  body: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  replies?: DocumentCommentRecord[];
}

const commentsKey = (id: string) => ["document-comments", id] as const;

export function useDocumentComments(documentId: string | undefined) {
  return useQuery({
    queryKey: commentsKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: async () => {
      const res = await apiFetch<{ comments: DocumentCommentRecord[] }>(
        `/api/documents/${documentId}/comments`,
      );
      return res.comments;
    },
    staleTime: 15_000,
  });
}

export function useCreateWorkspaceComment(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sectionId?: string | null; parentId?: string | null; body: string }) => {
      const res = await apiFetch<{ comment: DocumentCommentRecord }>(
        `/api/documents/${documentId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return res.comment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commentsKey(documentId) }),
  });
}

export function useToggleCommentResolved(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, resolved }: { commentId: string; resolved: boolean }) => {
      await apiFetch(`/api/documents/${documentId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commentsKey(documentId) }),
  });
}

// ── Versions ───────────────────────────────────────────────────────────────

export interface DocumentVersionRecord {
  id: string;
  version: string;
  changelog: string | null;
  createdById: string;
  createdAt: string;
}

const versionsKey = (id: string) => ["document-versions", id] as const;

export function useDocumentVersions(documentId: string | undefined) {
  return useQuery({
    queryKey: versionsKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: async () => {
      const res = await apiFetch<{ versions: DocumentVersionRecord[] }>(
        `/api/documents/${documentId}/versions`,
      );
      return res.versions;
    },
    staleTime: 30_000,
  });
}

export function useCreateDocumentVersion(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { version: string; changelog?: string }) => {
      const res = await apiFetch<{ version: DocumentVersionRecord }>(
        `/api/documents/${documentId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return res.version;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: versionsKey(documentId) }),
  });
}

// ── Presence ───────────────────────────────────────────────────────────────

export interface ActivePresence {
  sessionId: string;
  userName: string;
  userId: string | null;
  lastSeenAt: string;
}

/**
 * Heartbeat presence: pings POST /api/documents/[id]/presence every 8s with a tab-scoped
 * session ID, and polls GET every 12s for the list of active operators.
 *
 * Returns the dedup'd `active` list for rendering avatar bubbles.
 */
export function useEditorPresence(documentId: string | undefined): ActivePresence[] {
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 14),
  );
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["editor-presence", documentId ?? "—"],
    enabled: Boolean(documentId),
    queryFn: async () => {
      const res = await apiFetch<{ active: ActivePresence[] }>(
        `/api/documents/${documentId}/presence`,
      );
      return res.active;
    },
    refetchInterval: 12_000,
    staleTime: 8_000,
  });

  // Heartbeat: 8s cadence.
  useEffect(() => {
    if (!documentId) return;
    const sessionId = sessionIdRef.current;

    async function ping() {
      try {
        await apiFetch(`/api/documents/${documentId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        qc.invalidateQueries({ queryKey: ["editor-presence", documentId] });
      } catch {
        // Heartbeats are best-effort; swallow.
      }
    }

    void ping();
    const interval = setInterval(ping, 8_000);
    return () => clearInterval(interval);
  }, [documentId, qc]);

  return query.data ?? [];
}
