"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveProposal,
  createClient,
  createProposal,
  deleteProposal,
  duplicateProposal,
  getClientDetail,
  getProposal,
  listClients,
  listProposals,
  requestExport,
  saveCosting,
  saveEngagement,
  saveTimeline,
  updateProposal,
} from "@/lib/api";
import type { CostingSectionData, ProposalDocument } from "@/types/proposal";

export function useProposalList(filters: {
  search?: string;
  status?: string;
  sort?: string;
}) {
  return useQuery({
    queryKey: ["proposals", filters],
    queryFn: () => listProposals(filters),
  });
}

export function useProposal(id: string) {
  return useQuery({
    queryKey: ["proposal", id],
    queryFn: () => getProposal(id),
    enabled: Boolean(id),
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useClientList(filters?: {
  search?: string;
}) {
  return useQuery({
    queryKey: ["clients", filters],
    queryFn: () => listClients(filters),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useClientDetail(slug: string) {
  return useQuery({
    queryKey: ["client", slug],
    queryFn: () => getClientDetail(slug),
    enabled: Boolean(slug),
  });
}

export function useUpdateProposal(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<ProposalDocument>) => updateProposal(id, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["proposal", id], result);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useDuplicateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: duplicateProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useArchiveProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSaveCosting(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      costLineItems: ProposalDocument["costLineItems"];
      currency?: "GBP" | "USD" | "EUR";
      discount?: number;
      taxRate?: number;
      monthlyCostSummary?: string;
      durationSummary?: string;
      totalCostLabel?: string;
      supportingNarrative?: string;
      paymentScheduleIntro?: string;
      paymentTerms?: string;
      vatNotice?: string;
      ipTransferNotice?: string;
      teamAllocations?: CostingSectionData["teamAllocations"];
      paymentSchedule?: CostingSectionData["paymentSchedule"];
      additionalNotes?: string[];
    }) => saveCosting(id, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["proposal", id], result);
    },
  });
}

export function useSaveTimeline(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      timelinePhases: ProposalDocument["timelinePhases"];
      viewMode?: "LIST" | "MILESTONE";
    }) => saveTimeline(id, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["proposal", id], result);
    },
  });
}

export function useSaveEngagement(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      ctas: ProposalDocument["ctas"];
      links: ProposalDocument["links"];
    }) => saveEngagement(id, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["proposal", id], result);
    },
  });
}

export function useExportProposal(id: string) {
  return useMutation({
    mutationFn: (payload: {
      format: "PRINT" | "PDF" | "SHARE_LINK";
      settings?: Record<string, unknown>;
    }) => requestExport(id, payload),
  });
}
