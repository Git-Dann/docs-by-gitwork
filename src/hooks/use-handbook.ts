"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HandbookListItem, HandbookRecord, HandbookStatus } from "@/server/handbook";

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface HandbookCategoryCount {
  category: string;
  count: number;
}

export interface HandbookInput {
  title: string;
  summary?: string | null;
  category?: string | null;
  content?: string | null;
  tags?: string[];
  keywords?: string[];
  status?: HandbookStatus;
}

interface HandbookListResponse {
  articles: HandbookListItem[];
  categories: HandbookCategoryCount[];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useHandbookList(params?: { q?: string; category?: string; includeArchived?: boolean }) {
  const q = params?.q?.trim() ?? "";
  const category = params?.category ?? "";
  const includeArchived = params?.includeArchived ?? false;
  return useQuery({
    queryKey: ["handbook", "list", { q, category, includeArchived }],
    queryFn: () => {
      const search = new URLSearchParams();
      if (q) search.set("q", q);
      if (category) search.set("category", category);
      if (includeArchived) search.set("includeArchived", "true");
      const suffix = search.toString();
      return apiFetch<HandbookListResponse>(`/api/handbook${suffix ? `?${suffix}` : ""}`);
    },
    staleTime: 1000 * 20,
  });
}

export function useHandbookArticle(id: string | null) {
  return useQuery({
    queryKey: ["handbook", "article", id],
    queryFn: () =>
      apiFetch<{ article: HandbookRecord }>(`/api/handbook/${id}`).then((r) => r.article),
    enabled: Boolean(id),
    staleTime: 1000 * 10,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateHandbookArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: HandbookInput) =>
      apiFetch<{ article: HandbookRecord }>("/api/handbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.article),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handbook", "list"] }),
  });
}

export function useUpdateHandbookArticle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HandbookInput> & { featured?: boolean }) =>
      apiFetch<{ article: HandbookRecord }>(`/api/handbook/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.article),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handbook", "article", id] });
      qc.invalidateQueries({ queryKey: ["handbook", "list"] });
    },
  });
}

export function useDeleteHandbookArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/handbook/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handbook", "list"] }),
  });
}

export function useToggleHandbookFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      apiFetch<{ article: HandbookRecord }>(`/api/handbook/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured }),
      }).then((r) => r.article),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["handbook", "list"] });
      qc.invalidateQueries({ queryKey: ["handbook", "article", a.id] });
    },
  });
}
