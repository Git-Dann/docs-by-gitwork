/**
 * React Query hooks for editor collaboration state: comments, versions, presence, relations,
 * and the activity feed.
 *
 * All polling consumers in the editor share a single underlying query — `useDocumentSnapshot`
 * — which fetches `/api/documents/[id]/snapshot` every 10s and returns the union of every
 * editor-polling resource. Each typed hook (`useDocumentComments`, `useDocumentVersions`, etc.)
 * is a thin selector over that shared query, so the editor only fires one HTTP request per
 * polling cycle no matter how many panels are mounted.
 *
 * Mutations (create comment, snapshot version, toggle resolved) invalidate the snapshot key
 * directly so every dependent hook re-derives on the next render.
 */

"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { DocumentType } from "@/types/proposal";

// ── Shared snapshot ────────────────────────────────────────────────────────

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

export interface DocumentVersionRecord {
  id: string;
  version: string;
  changelog: string | null;
  createdAt: string;
}

export interface ActivePresence {
  sessionId: string;
  userName: string;
  userId: string | null;
  lastSeenAt: string;
}

export interface RelationDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  documentType: DocumentType;
  status: string;
  updatedAt: string;
}

export type ActivityFeedItem =
  | {
      kind: "VIEW";
      id: string;
      createdAt: string;
      origin: string;
      signerName: string | null;
      signerRole: string | null;
      ip: string | null;
    }
  | {
      kind: "SIGNATURE_EVENT";
      id: string;
      createdAt: string;
      eventKind: string;
      signerName: string | null;
      signerRole: string | null;
      ip: string | null;
      metadata: unknown;
    }
  | {
      kind: "COMMENT";
      id: string;
      createdAt: string;
      authorKind: "PUBLIC" | "WORKSPACE";
      authorName: string;
      excerpt: string;
      status: "OPEN" | "RESOLVED";
    }
  | {
      kind: "VERSION";
      id: string;
      createdAt: string;
      version: string;
      changelog: string | null;
    };

export interface DocumentSnapshot {
  document: {
    id: string;
    title: string;
    documentType: DocumentType;
    documentNumber: string | null;
  };
  comments: DocumentCommentRecord[];
  versions: DocumentVersionRecord[];
  presence: ActivePresence[];
  relations: { parent: RelationDocument | null; children: RelationDocument[] };
  activity: ActivityFeedItem[];
  summary: {
    totalViews: number;
    lastViewedAt: string | null;
    totalComments: number;
    totalVersions: number;
    activeEditors: number;
  };
}

export const snapshotKey = (id: string) => ["document-snapshot", id] as const;

/**
 * Single source of truth for editor-polling data. Every other hook in this module reads from
 * this query via a `select` projection so React Query dedupes the network request.
 */
export function useDocumentSnapshot(documentId: string | undefined) {
  return useQuery({
    queryKey: snapshotKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: () => apiFetch<DocumentSnapshot>(`/api/documents/${documentId}/snapshot`),
    refetchInterval: 10_000,
    staleTime: 8_000,
  });
}

function useSnapshotSlice<T>(
  documentId: string | undefined,
  select: (snapshot: DocumentSnapshot) => T,
) {
  return useQuery({
    queryKey: snapshotKey(documentId ?? "—"),
    enabled: Boolean(documentId),
    queryFn: () => apiFetch<DocumentSnapshot>(`/api/documents/${documentId}/snapshot`),
    refetchInterval: 10_000,
    staleTime: 8_000,
    select,
  });
}

// ── Comments ───────────────────────────────────────────────────────────────

export function useDocumentComments(documentId: string | undefined) {
  return useSnapshotSlice(documentId, (snap) => snap.comments);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: snapshotKey(documentId) }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: snapshotKey(documentId) }),
  });
}

// ── Versions ───────────────────────────────────────────────────────────────

export function useDocumentVersions(documentId: string | undefined) {
  return useSnapshotSlice(documentId, (snap) => snap.versions);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: snapshotKey(documentId) }),
  });
}

// ── Presence ───────────────────────────────────────────────────────────────

/**
 * Heartbeat presence: pings POST /api/documents/[id]/presence every 8s with a tab-scoped
 * session ID; reads the active-editors list out of the shared snapshot query.
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
  const query = useSnapshotSlice(documentId, (snap) => snap.presence);

  // Heartbeat: 8s cadence so the server-side TTL (30s) doesn't drop the row mid-session.
  useEffect(() => {
    if (!documentId) return;
    // Capture into a local so the inner closure has a non-undefined value (TS narrowing
    // doesn't flow through nested function expressions).
    const docId = documentId;
    const sessionId = sessionIdRef.current;

    async function ping() {
      try {
        await apiFetch(`/api/documents/${docId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        // The heartbeat creates a new row but our local snapshot doesn't know that yet —
        // poke it so the next render sees the updated presence list.
        qc.invalidateQueries({ queryKey: snapshotKey(docId) });
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
