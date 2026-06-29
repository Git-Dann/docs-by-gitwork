"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PulseScanRecord } from "@/types/pulse";
import {
  listPulseScans,
  createPulseScan,
  getPulseScan,
  getPulsePortfolio,
  getPulseBenchmarks,
  getPulseScanHistory,
  getPulseScanDiff,
  emailPulseAudit,
  deletePulseScan,
  cancelPulseScan,
  retryPulseScan,
  reanalysePulseScan,
  generateProposalFromScan,
  getPulseStats,
  sharePulseScan,
  unsharePulseScan,
  triggerFixAgent,
  triggerBrowserAgent,
  triggerDiscoveryKit,
  loadDemoScan,
  listMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  listPulseLeads,
  importPulseLead,
} from "@/lib/api";

export function useSharePulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sharePulseScan,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
    },
  });
}

export function useUnsharePulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unsharePulseScan,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
    },
  });
}

export function usePulseStats() {
  return useQuery({
    queryKey: ["pulse-stats"],
    queryFn: getPulseStats,
    staleTime: 1000 * 15,
  });
}

export function usePulseScans(params?: { clientId?: string }) {
  return useQuery({
    queryKey: ["pulse-scans", params],
    queryFn: () => listPulseScans(params),
  });
}

export function usePulsePortfolio() {
  return useQuery({
    queryKey: ["pulse-portfolio"],
    queryFn: getPulsePortfolio,
    staleTime: 1000 * 15,
  });
}

export function usePulseBenchmarks(scanId: string, enabled = true) {
  return useQuery({
    queryKey: ["pulse-benchmarks", scanId],
    queryFn: () => getPulseBenchmarks(scanId),
    enabled: enabled && Boolean(scanId),
    staleTime: 1000 * 60,
  });
}

export function usePulseScanHistory(scanId: string, enabled = true) {
  return useQuery({
    queryKey: ["pulse-scan-history", scanId],
    queryFn: () => getPulseScanHistory(scanId),
    enabled: enabled && Boolean(scanId),
    staleTime: 1000 * 60,
  });
}

export function usePulseScanDiff(scanId: string, enabled = true) {
  return useQuery({
    queryKey: ["pulse-scan-diff", scanId],
    queryFn: () => getPulseScanDiff(scanId),
    enabled: enabled && Boolean(scanId),
    staleTime: 1000 * 60,
  });
}

export function useEmailPulseAudit() {
  return useMutation({
    mutationFn: ({ scanId, ...input }: { scanId: string; to: string; message?: string }) => emailPulseAudit(scanId, input),
  });
}

export function usePulseScan(scanId: string) {
  return useQuery({
    queryKey: ["pulse-scan", scanId],
    queryFn: () => getPulseScan(scanId),
    enabled: Boolean(scanId),
    // Fallback polling — SSE hook keeps this inactive when stream is open
    refetchInterval: (query: { state: { data?: { scan: PulseScanRecord } | undefined } }) => {
      const scan = query.state.data?.scan;
      return scan?.status === "RUNNING" ? 5000 : false;
    },
  });
}

// Subscribes to the server-sent event stream for a RUNNING scan.
// Merges streamed state into the React Query cache so usePulseScan
// reflects live check/analysis updates without full refetch polling.
export function usePulseScanStream(scanId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !scanId) return;

    const es = new EventSource(`/api/pulse/scans/${scanId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          scan?: Partial<PulseScanRecord>;
          checks?: PulseScanRecord["checks"];
        };

        // Delta: merge only the new checks into the cached scan (by checkKey),
        // re-sorting by sortOrder. Skipped if the base scan hasn't loaded yet —
        // the parallel usePulseScan mount fetch already includes checks-so-far.
        if (msg.type === "checks" && msg.checks?.length) {
          queryClient.setQueryData(
            ["pulse-scan", scanId],
            (old: { scan: PulseScanRecord } | undefined) => {
              if (!old?.scan) return old;
              const byKey = new Map(old.scan.checks.map((c) => [c.checkKey, c]));
              for (const c of msg.checks!) byKey.set(c.checkKey, c);
              const checks = Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder);
              return { scan: { ...old.scan, checks } };
            },
          );
        }

        // Scalar state (status, healthScore, checksCompletedAt…) — small patch.
        if (msg.type === "meta" && msg.scan) {
          queryClient.setQueryData(
            ["pulse-scan", scanId],
            (old: { scan: PulseScanRecord } | undefined) => {
              if (!old?.scan) return old;
              return { scan: { ...old.scan, ...msg.scan } };
            },
          );
        }

        if (msg.type === "complete") {
          es.close();
          // One authoritative fetch to pick up the heavy AI payload (llmAnalysis,
          // discoveryKit, competitorData) that the delta stream intentionally omits.
          queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
          queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
          queryClient.invalidateQueries({ queryKey: ["pulse-stats"] });
          queryClient.invalidateQueries({ queryKey: ["pulse-portfolio"] });
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      // Fall back to polling — invalidate so usePulseScan refetches
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
    };

    return () => {
      es.close();
    };
  }, [scanId, enabled, queryClient]);
}

export function useCreatePulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPulseScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
    },
  });
}

export function useDeletePulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePulseScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-portfolio"] });
    },
  });
}

export function useCancelPulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelPulseScan,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
    },
  });
}

export function useRetryPulseScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryPulseScan,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
    },
  });
}

export function useGeneratePulseProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateProposalFromScan,
    onSuccess: (_data: { proposalId: string }, scanId: string) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useRunFixAgent() {
  return useMutation({
    mutationFn: triggerFixAgent,
  });
}

export function useRunBrowserAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerBrowserAgent,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
    },
  });
}

export function useRunDiscoveryKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerDiscoveryKit,
    onSuccess: (_data, scanId) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
    },
  });
}

export function useReanalysePulseScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scanId, context }: { scanId: string; context?: string }) =>
      reanalysePulseScan(scanId, context),
    onSuccess: (_data, { scanId }) => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
    },
  });
}

export function useLoadDemoScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loadDemoScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-stats"] });
    },
  });
}

export function useMonitors() {
  return useQuery({
    queryKey: ["pulse-monitors"],
    queryFn: listMonitors,
    staleTime: 1000 * 30,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMonitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-monitors"] });
    },
  });
}

export function usePulseLeads() {
  return useQuery({
    queryKey: ["pulse-leads"],
    queryFn: listPulseLeads,
    staleTime: 1000 * 30,
  });
}

export function useImportPulseLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importPulseLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-leads"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
    },
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ monitorId, ...input }: { monitorId: string; frequency?: "DAILY" | "WEEKLY" | "OFF"; isActive?: boolean; alertThreshold?: number }) =>
      updateMonitor(monitorId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-monitors"] });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMonitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-monitors"] });
    },
  });
}
