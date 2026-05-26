"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface AgentConfigRecord {
  agentKey: string;
  product: string;
  name: string;
  description: string;
  hasPrompt: boolean;
  enabled: boolean;
  systemPromptOverride: string | null;
  modelOverride: string | null;
  configJson: Record<string, unknown> | null;
}

export function useAgents() {
  return useQuery<AgentConfigRecord[]>({
    queryKey: ["settings", "agents"],
    queryFn: () => apiFetch("/api/settings/agents"),
  });
}

export function useSaveAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AgentConfigRecord> & { agentKey: string }) =>
      apiFetch("/api/settings/agents", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "agents"] }),
  });
}

export function useResetAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentKey: string) =>
      apiFetch(`/api/settings/agents/${encodeURIComponent(agentKey)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "agents"] }),
  });
}
