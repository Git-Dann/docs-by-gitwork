"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Client-facing DTOs — mirror the serialized shapes in src/server/foreman/* (redeclared here so
// client components don't import server-only modules, matching the use-curator.ts pattern).

export type Severity = "critical" | "warn" | "info";
export type Trend = "new" | "worsening" | "improving" | "steady";
export type FindingCategory = "project" | "developer" | "blindspot";

export interface ForemanFinding {
  key: string;
  category: FindingCategory;
  kind: string;
  severity: Severity;
  subjectId: string;
  subjectLabel: string;
  href?: string;
  headline: string;
  evidence: string[];
  metric: number;
  recommendation: string;
  trend: Trend;
  previousMetric: number | null;
}

export interface ForemanConfig {
  enabled: boolean;
  dueSoonDays: number;
  criticalOverdue: number;
  staleDoingDays: number;
  consolidate: boolean;
}

export interface ForemanStats {
  clientsScanned: number;
  developersScanned: number;
  critical: number;
  warn: number;
  info: number;
  projectFindings: number;
  developerFindings: number;
  blindSpots: number;
  newSinceLast: number;
  worseningSinceLast: number;
  improvingSinceLast: number;
  aiSkipped: boolean;
}

export interface ForemanNarrative {
  summary: string;
  priorities: string[];
}

export interface ForemanRunSummary {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: ForemanStats | null;
  findings: ForemanFinding[];
  narrative: ForemanNarrative | null;
  aiModel: string | null;
  error: string | null;
}

export interface ForemanStatus {
  config: ForemanConfig;
  latestRun: ForemanRunSummary | null;
  nextDueAt: string | null;
}

export interface ForemanReport {
  runId: string;
  generatedAt: string;
  stats: ForemanStats | null;
  findings: ForemanFinding[];
  narrative: ForemanNarrative | null;
}

export type FindingState = "active" | "muted" | "dismissed";
export type FindingActionKind = "dismiss" | "mute" | "clear";
export interface AnnotatedFinding extends ForemanFinding {
  state: FindingState;
}
export interface ForemanFindingsView {
  generatedAt: string | null;
  findings: AnnotatedFinding[];
  counts: { active: number; dismissed: number; muted: number };
}

const KEY = ["foreman"];

export function useForemanStatus(enabled = true) {
  return useQuery<ForemanStatus>({
    queryKey: [...KEY, "status"],
    queryFn: async () => (await apiFetch<{ status: ForemanStatus }>("/api/foreman/status")).status,
    enabled,
  });
}

export function useForemanReport(enabled = true) {
  return useQuery<ForemanReport | null>({
    queryKey: [...KEY, "report"],
    queryFn: async () => (await apiFetch<{ report: ForemanReport | null }>("/api/foreman/report")).report,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useForemanRuns(enabled = true) {
  return useQuery<ForemanRunSummary[]>({
    queryKey: [...KEY, "runs"],
    queryFn: async () => (await apiFetch<{ runs: ForemanRunSummary[] }>("/api/foreman/runs")).runs,
    enabled,
  });
}

export function useRunForeman() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { consolidate?: boolean; dryRun?: boolean }) =>
      apiFetch("/api/foreman/runs", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateForemanConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ForemanConfig>) =>
      apiFetch("/api/foreman/config", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useForemanFindings(enabled = true) {
  return useQuery<ForemanFindingsView>({
    queryKey: [...KEY, "findings"],
    queryFn: async () => (await apiFetch<{ view: ForemanFindingsView }>("/api/foreman/findings")).view,
    enabled,
  });
}

export function useForemanFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { findingKeys: string[]; action: FindingActionKind }) =>
      apiFetch("/api/foreman/findings", { method: "POST", body: JSON.stringify(input) }),
    // Invalidate the whole foreman key so the Desk report, findings manager and status all refresh.
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
