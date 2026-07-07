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
  createWikiLinkDocApi,
  uploadWikiFileDocApi,
  updateWikiDocApi,
  deleteWikiDocApi,
  setWikiDocumentsEnabledApi,
  createWikiIntakeItem,
  createPublicWikiIntakeItem,
  updateWikiIntakeItemApi,
  deleteWikiIntakeItemApi,
  promoteWikiIntakeItemApi,
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
