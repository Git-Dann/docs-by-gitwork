"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StarterRecipeRecord, StarterRecipeWithStarters } from "@/server/starter-recipes";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface StarterRecipeInput {
  name: string;
  summary: string;
  description?: string | null;
  starterIds?: string[];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useStarterRecipeList(enabled = true) {
  return useQuery({
    queryKey: ["starter-recipes", "list"],
    queryFn: () =>
      apiFetch<{ recipes: StarterRecipeWithStarters[] }>("/api/starter-recipes").then((r) => r.recipes),
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useStarterRecipe(id: string | null) {
  return useQuery({
    queryKey: ["starter-recipes", id],
    queryFn: () =>
      apiFetch<{ recipe: StarterRecipeWithStarters }>(`/api/starter-recipes/${id}`).then((r) => r.recipe),
    enabled: Boolean(id),
    staleTime: 1000 * 10,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateStarterRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StarterRecipeInput) =>
      apiFetch<{ recipe: StarterRecipeRecord }>("/api/starter-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.recipe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starter-recipes", "list"] }),
  });
}

export function useUpdateStarterRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StarterRecipeInput> & { isArchived?: boolean }) =>
      apiFetch<{ recipe: StarterRecipeRecord }>(`/api/starter-recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.recipe),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["starter-recipes", id] });
      qc.invalidateQueries({ queryKey: ["starter-recipes", "list"] });
    },
  });
}

export function useDeleteStarterRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/starter-recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starter-recipes", "list"] }),
  });
}
