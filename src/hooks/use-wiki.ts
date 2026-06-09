"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClientWiki,
  upsertWikiPage,
  setWikiShareApi,
  addWikiChangelogEntry,
  deleteWikiChangelogEntry,
  updateWikiPlatformsApi,
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

export function useUpdateWikiPlatforms(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platforms: string[]) => updateWikiPlatformsApi(slug, platforms),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
}
