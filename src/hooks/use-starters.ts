"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  StarterListItem,
  StarterRecord,
  StarterType,
  StarterStatus,
  StarterContent,
} from "@/server/starters";

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface StarterInput {
  name: string;
  summary: string;
  description?: string | null;
  type: StarterType;
  status?: StarterStatus;
  tags?: string[];
  content?: StarterContent | null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useStarterList(enabled = true) {
  return useQuery({
    queryKey: ["starters", "list"],
    queryFn: () => apiFetch<{ starters: StarterListItem[] }>("/api/starters").then((r) => r.starters),
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useStarter(id: string | null) {
  return useQuery({
    queryKey: ["starters", id],
    queryFn: () => apiFetch<{ starter: StarterRecord }>(`/api/starters/${id}`).then((r) => r.starter),
    enabled: Boolean(id),
    staleTime: 1000 * 10,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateStarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StarterInput) =>
      apiFetch<{ starter: StarterRecord }>("/api/starters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.starter),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starters", "list"] }),
  });
}

export function useUpdateStarter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StarterInput> & { isArchived?: boolean }) =>
      apiFetch<{ starter: StarterRecord }>(`/api/starters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.starter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["starters", id] });
      qc.invalidateQueries({ queryKey: ["starters", "list"] });
    },
  });
}

export function useDeleteStarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/starters/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starters", "list"] }),
  });
}

export function useDuplicateStarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ starter: StarterRecord }>(`/api/starters/${id}/duplicate`, { method: "POST" }).then(
        (r) => r.starter,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starters", "list"] }),
  });
}

export function useAdoptStarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { scanId: string; starterId: string }) =>
      apiFetch<{ scanId: string; starterId: string }>("/api/starters/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      // Refresh the linked scan so the scan-results "Starters" slot flips to "View starter".
      qc.invalidateQueries({ queryKey: ["pulse-scan", result.scanId] });
    },
  });
}

// ── Demo seed ─────────────────────────────────────────────────────────────────

export function useLoadStartersDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ count: number }>("/api/dev/seed-starters-demo", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starters", "list"] }),
  });
}
