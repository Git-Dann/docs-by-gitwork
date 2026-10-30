"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClientWiki,
  upsertWikiPage,
  deleteWikiPage,
  setWikiShareApi,
  setWikiSectionShareApi,
  createWikiUserApi,
  updateWikiUserApi,
  deleteWikiUserApi,
  addWikiChangelogEntry,
  deleteWikiChangelogEntry,
  updateWikiPlatformsApi,
  updateWikiEntryStatusApi,
  updateWikiChangelogEntryApi,
  getGolfDataConsole,
  getGolfCourseBackend,
  getGolfIntegrations,
  getLinkableWikiDocumentsApi,
  getIntakeWebhookApi,
  setIntakeWebhookApi,
  listIntakeKeysApi,
  mintIntakeKeyApi,
  revokeIntakeKeyApi,
  getGolfClubsList,
  getGolfUserData,
  runGolfJob,
  addWikiCourseRequest,
  updateWikiCourseRequestApi,
  deleteWikiCourseRequest,
  listWikiCourseFeedback,
  importWikiCourseFeedback,
  getWikiCourseIngest,
  setWikiCourseIngest,
  syncBigWedgeStatusApi,
  createWikiMonitorApi,
  updateWikiMonitorApi,
  deleteWikiMonitorApi,
  runWikiMonitorApi,
  getWikiMonitorSuggestionsApi,
  getWikiMonitorBoardApi,
  setWikiMonitorsEnabledApi,
  setWikiIntakeEnabledApi,
  setWikiCodeEnabledApi,
  createWikiCodeModuleApi,
  updateWikiCodeModuleApi,
  deleteWikiCodeModuleApi,
  createWikiCodeVersionApi,
  updateWikiCodeVersionApi,
  deleteWikiCodeVersionApi,
  type CodeFileInput,
  createWikiLinkDocApi,
  uploadWikiFileDocApi,
  updateWikiDocApi,
  deleteWikiDocApi,
  setWikiDocumentsEnabledApi,
  addDocToWikiApi,
  removeDocFromWikiApi,
  createWikiIntakeItem,
  importWikiIntakeItemsApi,
  type WikiIntakeImportRow,
  createWikiInsightBoardApi,
  deleteWikiInsightBoardApi,
  setWikiDeliveryEnabledApi,
  setWikiRoundupEnabledApi,
  setWikiInsightsEnabledApi,
  setWikiCostsEnabledApi,
  setWikiEstimatesEnabledApi,
  setWikiComparisonsEnabledApi,
  createWikiComparisonApi,
  updateWikiComparisonApi,
  deleteWikiComparisonApi,
  reorderWikiComparisonsApi,
  type ComparisonInput,
  createWikiEstimateApi,
  updateWikiEstimateApi,
  deleteWikiEstimateApi,
  type EstimateInput,
  updateWikiCostSettingsApi,
  createWikiCostItemApi,
  updateWikiCostItemApi,
  deleteWikiCostItemApi,
  type WikiCostItemInput,
  type WikiCostSettingsInput,
  setWikiSupportEnabledApi,
  updateWikiMetricsApi,
  getWikiMetricEndpointsApi,
  refreshWikiMetricsApi,
  type WikiMetricsPatch,
  getWikiShareableMeetingsApi,
  setWikiMeetingsEnabledApi,
  setWikiMeetingSharedApi,
  setWikiPlatformsEnabledApi,
  setWikiDriveEnabled as setWikiDriveEnabledApi,
  updateWikiInsightBoardApi,
  type WikiInsightBoardInput,
  setWikiIntakeCategoriesApi,
  createPublicWikiIntakeItem,
  updatePublicWikiIntakeItem,
  deletePublicWikiIntakeItem,
  updateWikiIntakeItemApi,
  deleteWikiIntakeItemApi,
  promoteWikiIntakeItemApi,
  uploadWikiIntakeItemImage,
  uploadPublicWikiIntakeItemImage,
  addWikiIntakeComment,
  addPublicWikiIntakeComment,
  editWikiIntakeComment,
  deleteWikiIntakeComment,
  uploadWikiIntakeCommentImage,
  type WikiCommentScope,
  getWikiMentionables,
  getPublicWikiMentionables,
} from "@/lib/api";
import type { CourseImportInput, BigWedgeSyncResult, MonitorInput, WikiIntakeItemPayload } from "@/lib/api";

export function useClientWiki(slug: string) {
  return useQuery({
    queryKey: ["client-wiki", slug],
    queryFn: () => getClientWiki(slug),
    enabled: Boolean(slug),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Named per-integrator intake keys (docs/client-intake-api.md). */
export function useIntakeKeys(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "intake-keys"],
    queryFn: () => listIntakeKeysApi(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 30_000,
  });
}

export function useMintIntakeKey(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => mintIntakeKeyApi(slug, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug, "intake-keys"] }),
  });
}

export function useRevokeIntakeKey(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeIntakeKeyApi(slug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug, "intake-keys"] }),
  });
}

/** The outbound webhook for intake status changes (docs/client-intake-api.md). */
export function useIntakeWebhook(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "intake-webhook"],
    queryFn: () => getIntakeWebhookApi(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 60_000,
  });
}

export function useSetIntakeWebhook(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string | null) => setIntakeWebhookApi(slug, url),
    onSuccess: (data) => {
      // Keep the freshly-minted secret in cache so the panel can show it once.
      queryClient.setQueryData(["client-wiki", slug, "intake-webhook"], data);
    },
  });
}

/** The Foundry docs addable to this client's wiki. Lazy — pass `enabled` so it only
 *  fetches when the picker is actually open. */
export function useLinkableWikiDocuments(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "linkable-docs"],
    queryFn: () => getLinkableWikiDocumentsApi(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 30_000,
  });
}

/** Portal "Add to wiki" — mirrors a Foundry doc into the client's wiki. Refreshes the client
 *  detail (so the doc's inWiki flag flips) and the wiki itself. */
export function useAddDocToWiki(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => addDocToWikiApi(slug, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useRemoveDocFromWiki(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => removeDocFromWikiApi(slug, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", slug] });
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpsertWikiPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: string; title: string; content?: unknown }) =>
      upsertWikiPage(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useDeleteWikiPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: string }) => deleteWikiPage(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useSetWikiShare(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiShareApi(slug, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
      // Disabling the wiki share also takes the design-system's /brand/ share
      // private server-side — refresh that query so its menu reflects it.
      queryClient.invalidateQueries({ queryKey: ["design-system", slug] });
    },
  });
}

export function useSetWikiSectionShare(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ section, enabled }: { section: string; enabled: boolean }) =>
      setWikiSectionShareApi(slug, section, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useCreateWikiUser(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; name?: string }) =>
      createWikiUserApi(slug, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpdateWikiUser(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { email?: string; password?: string; name?: string };
    }) => updateWikiUserApi(slug, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useDeleteWikiUser(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiUserApi(slug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useAddChangelogEntry(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      platform: string;
      version: string;
      title: string;
      body?: string;
      releasedAt?: string;
    }) => addWikiChangelogEntry(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useDeleteChangelogEntry(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiChangelogEntry(slug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpdateEntryStatus(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateWikiEntryStatusApi(slug, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpdateChangelogEntry(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        version?: string;
        title?: string;
        body?: string | null;
        releasedAt?: string | null;
        status?: string;
      };
    }) => updateWikiChangelogEntryApi(slug, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpdateWikiPlatforms(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platforms: string[]) => updateWikiPlatformsApi(slug, platforms),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

// ─── Course requests (Wedge wiki) ───────────────────────────────────────────

export function useAddCourseRequest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      courseName: string;
      country?: string | null;
      notes?: string | null;
      status?: string;
    }) => addWikiCourseRequest(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useUpdateCourseRequest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { courseName?: string; country?: string | null; notes?: string | null; status?: string };
    }) => updateWikiCourseRequestApi(slug, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

export function useDeleteCourseRequest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiCourseRequest(slug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}


export function useCreateWikiIntakeItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WikiIntakeItemPayload) => createWikiIntakeItem(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/**
 * Staff-only: import requests from a pasted or uploaded sheet.
 *
 * Invalidates the whole wiki rather than patching the list: an import can create
 * dozens of rows AND skip dozens more as duplicates, so there is no local edit that
 * would leave the page telling the truth.
 */
export function useImportWikiIntakeItems(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { items: WikiIntakeImportRow[]; dryRun?: boolean }) =>
      importWikiIntakeItemsApi(slug, input.items, { dryRun: input.dryRun }),
    onSuccess: (_result, input) => {
      // A dry run wrote nothing — refetching would only make the preview flicker.
      if (!input.dryRun) queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}

// ─── Insights (charts & diagrams) ─────────────────────────────────────────────
// Every write invalidates the whole wiki rather than patching a board into the cache:
// a board write replaces its entire content, so there is no local edit that would leave
// the page telling the truth about ordering or derived colours.

export function useSetWikiInsightsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiInsightsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiRoundupEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiRoundupEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiDeliveryEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiDeliveryEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiSupportEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiSupportEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiMetrics(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: WikiMetricsPatch) => updateWikiMetricsApi(slug, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/** The API Docs page's GET endpoints — only fetched while the source picker is open. */
export function useWikiMetricEndpoints(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "metric-endpoints"],
    queryFn: () => getWikiMetricEndpointsApi(slug),
    enabled,
  });
}

export function useRefreshWikiMetrics(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshWikiMetricsApi(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiMeetingsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiMeetingsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useWikiShareableMeetings(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "shareable-meetings"],
    queryFn: () => getWikiShareableMeetingsApi(slug),
    enabled,
  });
}

export function useSetWikiMeetingShared(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { meetingId: string; shared: boolean }) =>
      setWikiMeetingSharedApi(slug, v.meetingId, v.shared),
    // The wiki key is a prefix of the shareable-meetings key, so one invalidation
    // refreshes both the picker and the section above it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiPlatformsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiPlatformsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/**
 * Switch the Drive section on (making YOU the Google account the client's copy reads with) or
 * off. Switching on is refused unless your Drive can open the client's folder — the error says why.
 */
export function useSetWikiDriveEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiDriveEnabledApi(slug, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
      void queryClient.invalidateQueries({ queryKey: ["client-drive"] });
    },
  });
}

export function useCreateInsightBoard(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WikiInsightBoardInput) => createWikiInsightBoardApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateInsightBoard(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { boardId: string; input: WikiInsightBoardInput }) =>
      updateWikiInsightBoardApi(slug, args.boardId, args.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteInsightBoard(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => deleteWikiInsightBoardApi(slug, boardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

// ─── Running costs ────────────────────────────────────────────────────────────
// Every write returns the whole model and invalidates the wiki: a line's totals are
// derived from every other line, so patching one row into the cache would leave the
// banner stating a cost-per-user that no longer matches the lines under it.

export function useSetWikiCostsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiCostsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiCostSettings(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WikiCostSettingsInput) => updateWikiCostSettingsApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useCreateWikiCostItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WikiCostItemInput) => createWikiCostItemApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiCostItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { itemId: string; input: WikiCostItemInput }) =>
      updateWikiCostItemApi(slug, args.itemId, args.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiCostItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteWikiCostItemApi(slug, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

// ─── Estimates ───────────────────────────────────────────────────────────────
// Writes invalidate the whole wiki: the dashboard card and the section both derive from
// the same estimate, and a patched cache entry would let them disagree.

export function useSetWikiEstimatesEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiEstimatesEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSaveWikiEstimate(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { estimateId: string | null; input: EstimateInput }) =>
      args.estimateId
        ? updateWikiEstimateApi(slug, args.estimateId, args.input)
        : createWikiEstimateApi(slug, args.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

// ─── Comparisons ─────────────────────────────────────────────────────────────
// Writes invalidate the whole wiki: the dashboard card and the section both read the same
// tables. The table editor keeps its own draft while editing, so a refetch landing mid-edit
// never overwrites what someone is typing.

export function useSetWikiComparisonsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiComparisonsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useCreateWikiComparison(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ComparisonInput) => createWikiComparisonApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiComparison(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { comparisonId: string; input: ComparisonInput }) =>
      updateWikiComparisonApi(slug, args.comparisonId, args.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiComparison(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comparisonId: string) => deleteWikiComparisonApi(slug, comparisonId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useReorderWikiComparisons(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) => reorderWikiComparisonsApi(slug, order),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiEstimate(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (estimateId: string) => deleteWikiEstimateApi(slug, estimateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/** Staff-only: replace this client's Requests categories (empty → defaults). */
export function useSetWikiIntakeCategories(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      categories: { id?: string; label: string; mapsTo: "BUG" | "FEEDBACK" | "TASK" | "DESIGN" }[],
    ) => setWikiIntakeCategoriesApi(slug, categories),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdatePublicWikiIntakeItem(token: string) {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updatePublicWikiIntakeItem>[2] }) =>
      updatePublicWikiIntakeItem(token, id, patch),
  });
}

export function useDeletePublicWikiIntakeItem(token: string) {
  return useMutation({
    mutationFn: (id: string) => deletePublicWikiIntakeItem(token, id),
  });
}

export function useCreatePublicWikiIntakeItem(token: string) {
  return useMutation({
    mutationFn: (input: WikiIntakeItemPayload) => createPublicWikiIntakeItem(token, input),
  });
}

export function useUpdateWikiIntakeItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WikiIntakeItemPayload> & { status?: "NEW" | "TRIAGED" | "PROMOTED" | "CLOSED" } }) =>
      updateWikiIntakeItemApi(slug, id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiIntakeItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiIntakeItemApi(slug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function usePromoteWikiIntakeItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeIds }: { id: string; assigneeIds?: string[] }) =>
      promoteWikiIntakeItemApi(slug, id, { assigneeIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUploadWikiIntakeItemImage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadWikiIntakeItemImage(slug, id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUploadPublicWikiIntakeItemImage(token: string) {
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPublicWikiIntakeItemImage(token, id, file),
  });
}

export function useAddWikiIntakeComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      body,
      mentionIds,
      image,
    }: {
      itemId: string;
      body: string;
      mentionIds?: string[];
      /** Sent in the same request, so a screenshot-only reply is allowed. */
      image?: File | null;
    }) =>
      addWikiIntakeComment(slug, itemId, body, mentionIds, image ?? null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useAddPublicWikiIntakeComment(token: string) {
  return useMutation({
    mutationFn: ({
      itemId,
      body,
      mentionIds,
      image,
    }: {
      itemId: string;
      body: string;
      mentionIds?: string[];
      /** Sent in the same request, so a screenshot-only reply is allowed. */
      image?: File | null;
    }) =>
      addPublicWikiIntakeComment(token, itemId, body, mentionIds, image ?? null),
  });
}

/** Internal scope refetches the wiki; the shared page has no query and patches its own
 *  local list from the returned record instead (see WikiIntakeSection). */
function useInvalidateCommentScope(scope: WikiCommentScope) {
  const queryClient = useQueryClient();
  return () =>
    "slug" in scope ? queryClient.invalidateQueries({ queryKey: ["client-wiki", scope.slug] }) : undefined;
}

export function useEditWikiIntakeComment(scope: WikiCommentScope) {
  const invalidate = useInvalidateCommentScope(scope);
  return useMutation({
    mutationFn: (v: { itemId: string; commentId: string; body: string; mentionIds?: string[] }) =>
      editWikiIntakeComment(scope, v.itemId, v.commentId, v.body, v.mentionIds),
    onSuccess: invalidate,
  });
}

export function useDeleteWikiIntakeComment(scope: WikiCommentScope) {
  const invalidate = useInvalidateCommentScope(scope);
  return useMutation({
    mutationFn: (v: { itemId: string; commentId: string }) => deleteWikiIntakeComment(scope, v.itemId, v.commentId),
    onSuccess: invalidate,
  });
}

export function useUploadWikiIntakeCommentImage(scope: WikiCommentScope) {
  const invalidate = useInvalidateCommentScope(scope);
  return useMutation({
    mutationFn: (v: { itemId: string; commentId: string; file: File }) =>
      uploadWikiIntakeCommentImage(scope, v.itemId, v.commentId, v.file),
    onSuccess: invalidate,
  });
}

/**
 * Who can be @mentioned on a client's requests. Fetched only once a reply box is
 * actually opened (`enabled`), and kept for five minutes — it is a roster, not a feed.
 */
export function useWikiMentionables(
  opts: { mode: "internal"; slug: string } | { mode: "public"; token: string },
  enabled: boolean,
) {
  const key = opts.mode === "internal" ? opts.slug : opts.token;
  return useQuery({
    queryKey: ["wiki-mentionables", opts.mode, key],
    queryFn: () =>
      opts.mode === "internal" ? getWikiMentionables(opts.slug) : getPublicWikiMentionables(opts.token),
    enabled: enabled && Boolean(key),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGolfDataConsole(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["golf-data-console", slug],
    queryFn: () => getGolfDataConsole(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGolfCourseBackend(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["golf-course-backend", slug],
    queryFn: () => getGolfCourseBackend(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGolfClubsList(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["golf-clubs-list", slug],
    queryFn: () => getGolfClubsList(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGolfUserData(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["golf-user-data", slug],
    queryFn: () => getGolfUserData(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGolfIntegrations(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["golf-integrations", slug],
    queryFn: () => getGolfIntegrations(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRunGolfJob(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ job, batch }: { job: string; batch?: number }) => runGolfJob(slug, job, batch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["golf-integrations", slug] });
      queryClient.invalidateQueries({ queryKey: ["golf-course-backend", slug] });
    },
  });
}

export function useCourseFeedbackCandidates(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["course-feedback", slug],
    queryFn: () => listWikiCourseFeedback(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useImportCourseFeedback(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CourseImportInput) => importWikiCourseFeedback(slug, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
      queryClient.invalidateQueries({ queryKey: ["course-feedback", slug] });
    },
  });
}

export function useSyncBigWedgeStatus(slug: string) {
  const queryClient = useQueryClient();
  return useMutation<BigWedgeSyncResult, Error, { dryRun: boolean }>({
    mutationFn: ({ dryRun }) => syncBigWedgeStatusApi(dryRun),
    onSuccess: (data) => {
      if (!data.dryRun) {
        queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
      }
    },
  });
}

export function useCourseIngest(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["course-ingest", slug],
    queryFn: () => getWikiCourseIngest(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useSetCourseIngest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled: boolean; rotate?: boolean }) => setWikiCourseIngest(slug, input),
    onSuccess: (data) => {
      queryClient.setQueryData(["course-ingest", slug], data);
    },
  });
}

// ─── Monitors (uptime) ────────────────────────────────────────────────────────

export function useCreateWikiMonitor(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MonitorInput) => createWikiMonitorApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiMonitor(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MonitorInput> }) =>
      updateWikiMonitorApi(slug, id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiMonitor(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiMonitorApi(slug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/** Platform URLs nothing monitors yet. Refetched when the wiki changes (a monitor was added). */
export function useWikiMonitorSuggestions(slug: string) {
  return useQuery({
    queryKey: ["client-wiki", slug, "monitor-suggestions"],
    queryFn: () => getWikiMonitorSuggestionsApi(slug),
  });
}

/**
 * The all-clients board on the Gitwork wiki. Re-read every minute — the checker runs every
 * minute while anything is failing, so the board is never more than a minute behind it.
 */
export function useWikiMonitorBoard(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-wiki", slug, "monitor-board"],
    queryFn: () => getWikiMonitorBoardApi(slug),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useRunWikiMonitor(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runWikiMonitorApi(slug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiMonitorsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiMonitorsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiIntakeEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiIntakeEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

// ─── Code handover ──────────────────────────────────────────────────────────
function useWikiInvalidate(slug: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
}

export function useSetWikiCodeEnabled(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({ mutationFn: (enabled: boolean) => setWikiCodeEnabledApi(slug, enabled), onSuccess: invalidate });
}

export function useCreateCodeModule(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null }) => createWikiCodeModuleApi(slug, input),
    onSuccess: invalidate,
  });
}

export function useUpdateCodeModule(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({
    mutationFn: ({ moduleId, ...input }: { moduleId: string; name?: string; description?: string | null }) =>
      updateWikiCodeModuleApi(slug, moduleId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCodeModule(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({ mutationFn: (moduleId: string) => deleteWikiCodeModuleApi(slug, moduleId), onSuccess: invalidate });
}

export function useCreateCodeVersion(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({
    mutationFn: ({ moduleId, ...input }: { moduleId: string; label: string; notes?: string | null; files: CodeFileInput[]; makeCurrent?: boolean }) =>
      createWikiCodeVersionApi(slug, moduleId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateCodeVersion(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({
    mutationFn: ({ versionId, ...input }: { versionId: string; label?: string; notes?: string | null; files?: CodeFileInput[]; makeCurrent?: boolean }) =>
      updateWikiCodeVersionApi(slug, versionId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCodeVersion(slug: string) {
  const invalidate = useWikiInvalidate(slug);
  return useMutation({ mutationFn: (versionId: string) => deleteWikiCodeVersionApi(slug, versionId), onSuccess: invalidate });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export function useCreateWikiLinkDoc(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; url: string }) => createWikiLinkDocApi(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUploadWikiFileDoc(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => uploadWikiFileDocApi(slug, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useUpdateWikiDoc(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { title?: string; url?: string } }) =>
      updateWikiDocApi(slug, id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useDeleteWikiDoc(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWikiDocApi(slug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useSetWikiDocumentsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiDocumentsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}
