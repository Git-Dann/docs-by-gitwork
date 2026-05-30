"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  archiveProposal,
  createClient,
  createClientDesign,
  createClientPlatform,
  createProposal,
  deleteClient,
  deleteClientDesign,
  deleteClientPlatform,
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
  updateClient,
  updateClientDesign,
  updateClientPlatform,
  updateProposal,
} from "@/lib/api";
import type { ClientDesignRecord, ClientPlatformRecord } from "@/types/client";
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

// Clients change rarely — keep the list cached for 5 minutes so navigating
// between Code pages doesn't trigger a refetch every time. Mutations on
// clients still invalidate this query.
export function useClientList(filters?: {
  search?: string;
}) {
  return useQuery({
    queryKey: ["clients", filters],
    queryFn: () => listClients(filters),
    staleTime: 5 * 60 * 1000,
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

type ClientUpdatePayload = {
  name?: string;
  logoUrl?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  notes?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  googleDriveFolderUrl?: string;
  clickupUrl?: string;
  slackChannelId?: string;
};

export function useUpdateClient(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ClientUpdatePayload) => updateClient(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
      queryClient.invalidateQueries({ queryKey: ["proposal"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => deleteClient(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

type PlatformInput = {
  name: string;
  platformType?: string;
  url?: string;
  stagingUrl?: string;
  repoUrl?: string;
  credentials?: string;
  notes?: string;
  previewImageUrl?: string;
};

export function useCreateClientPlatform(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlatformInput) => createClientPlatform(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useUpdateClientPlatform(slug: string, platformId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<PlatformInput>) =>
      updateClientPlatform(slug, platformId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useDeleteClientPlatform(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (platformId: string) => deleteClientPlatform(slug, platformId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useClientPlatformMutations(slug: string, platform: ClientPlatformRecord | null) {
  const createMutation = useCreateClientPlatform(slug);
  const updateMutation = useUpdateClientPlatform(slug, platform?.id ?? "");
  const deleteMutation = useDeleteClientPlatform(slug);

  return { createMutation, updateMutation, deleteMutation };
}

type DesignInput = {
  name: string;
  url?: string;
  notes?: string;
  previewImageUrl?: string;
};

export function useCreateClientDesign(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DesignInput) => createClientDesign(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useUpdateClientDesign(slug: string, designId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<DesignInput>) =>
      updateClientDesign(slug, designId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useDeleteClientDesign(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (designId: string) => deleteClientDesign(slug, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useClientDesignMutations(slug: string, design: ClientDesignRecord | null) {
  const createMutation = useCreateClientDesign(slug);
  const updateMutation = useUpdateClientDesign(slug, design?.id ?? "");
  const deleteMutation = useDeleteClientDesign(slug);

  return { createMutation, updateMutation, deleteMutation };
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

export function useClientSlackActivity(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["client-slack-activity", slug],
    // Use apiFetch so the browser's gitwork_api_session cookie handles auth —
    // sending an empty `Authorization: Bearer ` header was blocking requests.
    queryFn: () =>
      apiFetch<{
        configured: boolean;
        channelName: string | null;
        summary: string | null;
        generatedAt: string | null;
        reason: string;
        messages: Array<{ id: string; author: string; text: string; ts: string }>;
      }>(`/api/clients/${slug}/slack-activity`),
    enabled: Boolean(slug) && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useOgPreview(url: string | null | undefined) {
  return useQuery({
    queryKey: ["og-preview", url],
    queryFn: async () => {
      if (!url) return { imageUrl: null, title: null };
      return apiFetch<{ imageUrl: string | null; title: string | null }>(
        `/api/og-preview?url=${encodeURIComponent(url)}`,
      );
    },
    enabled: Boolean(url),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
