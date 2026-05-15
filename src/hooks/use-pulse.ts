"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PulseScanRecord } from "@/types/pulse";
import {
  listPulseScans,
  createPulseScan,
  getPulseScan,
  deletePulseScan,
  generateProposalFromScan,
} from "@/lib/api";

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
    refetchInterval: (query: { state: { data?: { scan: PulseScanRecord } | undefined } }) => {
      const scan = query.state.data?.scan;
      return scan?.status === "RUNNING" ? 3000 : false;
    },
  });
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
