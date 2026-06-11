"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  archiveProposal,
  createClient,
  createClientDesign,
  createClientPlatform,
  createOnboardingLink,
  createProposal,
  deleteClient,
  deleteClientDesign,
  deleteClientPlatform,
  deleteOnboardingLink,
  deleteProposal,
  duplicateProposal,
  getClientDetail,
  getClientMeetings,
  ingestClientMeeting,
  updateMeetingActionItem,
  getProposal,
  listClients,
  listOnboardingLinks,
  listProposals,
  moveOnboardingToWorkflow,
  requestExport,
  revealClientBankApi,
  saveCosting,
  saveEngagement,
  saveTimeline,
  setClientStatusApi,
  updateClient,
  updateClientDesign,
  updateClientPlatform,
  updateProposal,
} from "@/lib/api";
import type {
  ClientDesignRecord,
  ClientPlatformRecord,
  WorkspaceClientStatus,
} from "@/types/client";
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
  status?: WorkspaceClientStatus | "ALL";
}) {
  return useQuery({
    queryKey: ["clients", filters],
    queryFn: () => listClients(filters),
    staleTime: 5 * 60 * 1000,
    // Avoid blasting the server on every tab switch — the list rarely changes
    // mid-session and mutations invalidate the cache when it matters.
    refetchOnWindowFocus: false,
  });
}

export function useOnboardingLinks() {
  return useQuery({
    queryKey: ["onboarding-links"],
    queryFn: () => listOnboardingLinks(),
    // Onboarding state changes when the public client edits the form — refresh
    // when the operator focuses the tab so they see the latest.
    refetchOnWindowFocus: true,
  });
}

export function useCreateOnboardingLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { label?: string; formId?: string } = {}) => createOnboardingLink(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-links"] });
    },
  });
}

export function useDeleteOnboardingLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOnboardingLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-links"] });
    },
  });
}

export function useMoveOnboardingToWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => moveOnboardingToWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-links"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSetClientStatus(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: WorkspaceClientStatus) => setClientStatusApi(slug, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useRevealClientBank() {
  return useMutation({
    mutationFn: (slug: string) => revealClientBankApi(slug),
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
    // 2-minute stale window — enough freshness for active sessions without
    // hammering the Slack/enrichment APIs on every tab switch.
    staleTime: 2 * 60 * 1000,
    // Window-focus refetch was pulling Slack activity (41+ API calls) on every
    // tab switch. Mutations and explicit navigations still invalidate the cache.
    refetchOnWindowFocus: false,
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
  retainerDays?: number | null;
  retainerDaysUsed?: number | null;
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
    // Keep the last successful data visible while a background refetch runs,
    // so the digest never flashes to an empty state mid-refresh.
    placeholderData: keepPreviousData,
  });
}

// ─── Scribe (client meeting notes) ─────────────────────────────────────────

export function useClientMeetings(slug: string, enabled = true, q = "") {
  return useQuery({
    queryKey: ["client-meetings", slug, q],
    queryFn: () => getClientMeetings(slug, q),
    enabled: Boolean(slug) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    // Keep showing the previous results while a new search query loads — no flicker.
    placeholderData: (prev) => prev,
  });
}

export function useIngestClientMeeting(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      calendarEventId: string;
      meetingCode: string;
      title: string;
      start?: string;
      end?: string;
      attendees?: string[];
    }) => ingestClientMeeting(slug, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-meetings", slug] });
    },
  });
}

export function useToggleMeetingActionItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ meetingId, actionItemId, done }: { meetingId: string; actionItemId: string; done: boolean }) =>
      updateMeetingActionItem(slug, meetingId, { actionItemId, done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-meetings", slug] });
    },
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
