/**
 * React Query hooks for the content snippet library (Phase 3).
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ContentSnippetRecord } from "@/server/snippets";

export type { ContentSnippetRecord } from "@/server/snippets";

const SNIPPETS_KEY = ["snippets"] as const;

export function useSnippets() {
  return useQuery({
    queryKey: SNIPPETS_KEY,
    queryFn: () =>
      apiFetch<{ snippets: ContentSnippetRecord[] }>("/api/snippets").then((r) => r.snippets),
    staleTime: 30_000,
  });
}

export function useCreateSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; sectionKey: string; data: unknown }) =>
      apiFetch<{ snippet: ContentSnippetRecord }>("/api/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.snippet),
    onSuccess: () => qc.invalidateQueries({ queryKey: SNIPPETS_KEY }),
  });
}

export function useDeleteSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/snippets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SNIPPETS_KEY }),
  });
}
