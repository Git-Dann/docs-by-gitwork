"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClientWiki,
  upsertWikiPage,
  setWikiShareApi,
  setWikiSectionShareApi,
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
} from "@/lib/api";

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

export function useSetWikiShare(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiShareApi(slug, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
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
    mutationFn: (conversationIds: string[]) => importWikiCourseFeedback(slug, conversationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
      queryClient.invalidateQueries({ queryKey: ["course-feedback", slug] });
    },
  });
}
