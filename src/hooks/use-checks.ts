"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface CheckConfigRecord {
  checkKey: string;
  category: string;
  label: string;
  enabled: boolean;
  labelOverride: string | null;
  severityOverride: string | null;
  isCustom: boolean;
  customConfig: Record<string, unknown> | null;
  sortOrder: number;
}

export function useChecks() {
  return useQuery<CheckConfigRecord[]>({
    queryKey: ["settings", "checks"],
    queryFn: () => apiFetch("/api/settings/checks"),
  });
}

export function useSaveCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      checkKey: string;
      enabled?: boolean;
      labelOverride?: string | null;
      severityOverride?: string | null;
    }) =>
      apiFetch("/api/settings/checks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "checks"] }),
  });
}

export interface CheckStat {
  signal: string | null;
  fireCount: number;
  passRate: number;
  lastFiredAt: string | null;
}

/** Per-check usage stats (from the Curator's aggregation) keyed by checkKey. */
export function useCheckStats() {
  return useQuery<Record<string, CheckStat>>({
    queryKey: ["settings", "check-stats"],
    queryFn: async () => (await apiFetch<{ stats: Record<string, CheckStat> }>("/api/curator/check-stats")).stats,
  });
}

export function useResetCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkKey: string) =>
      apiFetch(`/api/settings/checks/${encodeURIComponent(checkKey)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "checks"] }),
  });
}
