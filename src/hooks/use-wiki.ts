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
    mutationFn: ({ itemId, body }: { itemId: string; body: string }) => addWikiIntakeComment(slug, itemId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

export function useAddPublicWikiIntakeComment(token: string) {
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: string }) =>
      addPublicWikiIntakeComment(token, itemId, body),
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
