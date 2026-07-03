"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  archiveProposal,
  createClient,
  createClientDesign,
  createClientPlatform,
  updateClientProductTeam,
  listTeamMembers,
  createOnboardingLink,
  createProposal,
  addMeetingDecisionApi,
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
  linkMeetingActionItemTask,
  removeMeetingDecisionApi,
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
  setProposalFavorite,
  listClientTouchpoints,
  createClientTouchpoint,
  type LeadInput,
  updateClient,
  updateClientDesign,
  updateClientPlatform,
  revealClientPlatformApi,
  createPlatformLogin,
  updatePlatformLogin,
  deletePlatformLogin,
  revealPlatformLogin,
  updateProposal,
} from "@/lib/api";
import type {
  ClientDesignRecord,
  ClientPlatformRecord,
  TouchpointType,
  WorkspaceClientStatus,
} from "@/types/client";
import type { CostingSectionData, ProposalDocument } from "@/types/proposal";

export function useProposalList(filters: {
  search?: string;
  status?: string;
  sort?: string;
  documentType?: string;
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
    // 60s (was 5min): the acting user's mutations invalidate immediately, but a
    // 5-minute window meant *other* teammates saw stale client state — e.g. a
    // status flipped to ACTIVE still showing PENDING. 60s keeps cross-user state
    // fresh without refetch storms; keepPreviousData avoids a flash on refetch.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
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
    mutationFn: (input: {
      status: WorkspaceClientStatus;
      resumeAt?: string | null;
      pauseNote?: string | null;
    }) => setClientStatusApi(slug, input.status, { resumeAt: input.resumeAt, pauseNote: input.pauseNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

export function useClientTouchpoints(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["client-touchpoints", slug],
    queryFn: () => listClientTouchpoints(slug),
    enabled: enabled && Boolean(slug),
  });
}

export function useAddClientTouchpoint(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: TouchpointType; note?: string; occurredAt?: string }) =>
      createClientTouchpoint(slug, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-touchpoints", slug] });
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
  slackInternalChannelId?: string;
  slackExternalChannelId?: string;
  retainerDays?: number | null;
  retainerDaysUsed?: number | null;
} & LeadInput;

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

/** Delete several clients in one action (sequential, best-effort) for the Portal bulk bar. */
export function useBulkDeleteClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slugs: string[]) => {
      for (const slug of slugs) await deleteClient(slug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

/** Set the status of several clients at once (e.g. bulk "move to workflow" → ACTIVE). */
export function useBulkSetClientStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slugs, status }: { slugs: string[]; status: WorkspaceClientStatus }) => {
      for (const slug of slugs) await setClientStatusApi(slug, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

type PlatformInput = {
  name: string;
  platformType?: string;
  url?: string;
  stagingUrl?: string;
  repoUrl?: string;
  username?: string;
  password?: string;
  notes?: string;
  previewImageUrl?: string;
  featuredInWiki?: boolean;
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

export function useRevealClientPlatform(slug: string) {
  return useMutation({
    mutationFn: (platformId: string) => revealClientPlatformApi(slug, platformId),
  });
}

/** Workspace members — for the product-team picker. */
export function useTeamMembers() {
  return useQuery({
    queryKey: ["team", "members"],
    queryFn: () => listTeamMembers(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateClientProductTeam(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => updateClientProductTeam(slug, userIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
    },
  });
}

/** Bundled create/update/delete/reveal mutations for a platform's logins. Mutations that change
 *  the set invalidate the client query so the platform's logins summary refreshes. */
export function usePlatformLoginActions(slug: string, platformId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["client", slug] });
  const create = useMutation({
    mutationFn: (body: { label?: string; username?: string; password?: string }) =>
      createPlatformLogin(slug, platformId, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ loginId, body }: { loginId: string; body: { label?: string | null; username?: string; password?: string } }) =>
      updatePlatformLogin(slug, platformId, loginId, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (loginId: string) => deletePlatformLogin(slug, platformId, loginId),
    onSuccess: invalidate,
  });
  const reveal = useMutation({
    mutationFn: (loginId: string) => revealPlatformLogin(slug, platformId, loginId),
  });
  return { create, update, remove, reveal };
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

/**
 * Toggle a document's workspace favourite. Optimistic — flips the flag across every cached
 * ["proposals", …] list immediately, then reconciles on settle. The star never blocks the UI.
 */
export function useToggleProposalFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      setProposalFavorite(id, isFavorite),
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ["proposals"] });
      const snapshots = queryClient.getQueriesData<{ proposals: Array<{ id: string }> }>({
        queryKey: ["proposals"],
      });
      for (const [key, value] of snapshots) {
        if (!value?.proposals) continue;
        queryClient.setQueryData(key, {
          ...value,
          proposals: value.proposals.map((p) =>
            p.id === id ? { ...p, isFavorite } : p,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
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

export function useClientMeetings(slug: string, enabled = true, q = "", all = false) {
  return useQuery({
    queryKey: ["client-meetings", slug, q, all],
    queryFn: () => getClientMeetings(slug, q, all),
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

export function useLinkMeetingActionItemTask(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ meetingId, actionItemId, taskId }: { meetingId: string; actionItemId: string; taskId: string | null }) =>
      linkMeetingActionItemTask(slug, meetingId, { actionItemId, taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-meetings", slug] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateMeetingDecision(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      meetingId,
      decisionText,
      removeDecisionIndex,
    }: {
      meetingId: string;
      decisionText?: string;
      removeDecisionIndex?: number;
    }) =>
      decisionText !== undefined
        ? addMeetingDecisionApi(slug, meetingId, decisionText)
        : removeMeetingDecisionApi(slug, meetingId, removeDecisionIndex ?? -1),
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
