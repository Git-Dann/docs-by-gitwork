"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Client-facing DTOs — mirror the serialized shapes in src/server/curator/* (redeclared here so
// client components don't import server-only modules, matching the use-checks.ts pattern).

export interface CuratorConfig {
  enabled: boolean;
  staleAfterDays: number;
  archiveAfterDays: number;
  consolidate: boolean;
  intervalDays: number;
}

export interface CuratorStats {
  startersScanned: number;
  startersStaled: number;
  startersArchived: number;
  starterCandidates: number;
  checksAggregated: number;
  deadChecks: number;
  alwaysPassChecks: number;
  noisyChecks: number;
  proposalsCreated: number;
  aiSkipped: boolean;
}

export interface CuratorTransition {
  kind: "starter_stale" | "starter_archive";
  target: string;
  targetLabel?: string;
  from: string;
  to: string;
}

export type ProposalKind =
  | "STARTER_ARCHIVE"
  | "STARTER_CONSOLIDATE"
  | "CHECK_DISABLE"
  | "CHECK_SEVERITY"
  | "CHECK_RELABEL";

export interface CuratorProposal {
  id: string;
  kind: ProposalKind;
  target: string;
  targetLabel?: string;
  rationale: string;
  payload?: Record<string, unknown>;
  status: "open" | "applied" | "dismissed";
}

export interface CuratorRunSummary {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: CuratorStats | null;
  transitions: CuratorTransition[];
  proposals: CuratorProposal[];
  aiModel: string | null;
  error: string | null;
}

export interface LruStarter {
  id: string;
  name: string;
  usageCount: number;
  lastUsedAt: string | null;
  curatorState: string;
}

export interface CuratorStatus {
  config: CuratorConfig;
  latestRun: CuratorRunSummary | null;
  nextDueAt: string | null;
  lruStarters: LruStarter[];
}

const KEY = ["curator"];

export function useCuratorStatus(enabled = true) {
  return useQuery<CuratorStatus>({
    queryKey: [...KEY, "status"],
    queryFn: async () => (await apiFetch<{ status: CuratorStatus }>("/api/curator/status")).status,
    enabled,
  });
}

export function useCuratorRuns(enabled = true) {
  return useQuery<CuratorRunSummary[]>({
    queryKey: [...KEY, "runs"],
    queryFn: async () => (await apiFetch<{ runs: CuratorRunSummary[] }>("/api/curator/runs")).runs,
    enabled,
  });
}

export function useRunCurator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode?: "prune" | "consolidate"; dryRun?: boolean }) =>
      apiFetch("/api/curator/runs", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCuratorProposalAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: string; proposalId: string; action: "apply" | "dismiss" }) =>
      apiFetch("/api/curator/proposals", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRestoreCuratorRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch("/api/curator/restore", { method: "POST", body: JSON.stringify({ runId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCuratorConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CuratorConfig>) =>
      apiFetch("/api/curator/config", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
