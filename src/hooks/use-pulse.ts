"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PulseScanRecord } from "@/types/pulse";
import {
  listPulseScans,
  createPulseScan,
  getPulseScan,
  deletePulseScan,
  cancelPulseScan,
  retryPulseScan,
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
  deleteMonitor,
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
        const msg = JSON.parse(event.data) as { type: string; scan?: PulseScanRecord };
        if (msg.type === "state" && msg.scan) {
          queryClient.setQueryData(["pulse-scan", scanId], { scan: msg.scan });
        }
        if (msg.type === "complete") {
          es.close();
          // Final authoritative fetch after stream closes
          queryClient.invalidateQueries({ queryKey: ["pulse-scan", scanId] });
          queryClient.invalidateQueries({ queryKey: ["pulse-scans"] });
          queryClient.invalidateQueries({ queryKey: ["pulse-stats"] });
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

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMonitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulse-monitors"] });
    },
  });
}
