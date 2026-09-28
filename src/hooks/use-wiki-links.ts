"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addWikiLink, listWikiLinks, removeWikiLink } from "@/lib/api";

const QK = (slug: string) => ["clients", slug, "wiki", "links"] as const;

export function useWikiLinks(slug: string) {
  return useQuery({ queryKey: QK(slug), queryFn: () => listWikiLinks(slug) });
}

/**
 * ⚠️ Both mutations invalidate the WIKI as well as the link list. Linking changes
 * what the timeline holds, so a list that updated on its own would leave the page
 * behind it showing the old plan until something else happened to refetch.
 */
export function useAddWikiLink(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { linkedClientId: string; label?: string | null }) =>
      addWikiLink(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK(slug) });
      void qc.invalidateQueries({ queryKey: ["clients", slug, "wiki"] });
    },
  });
}

export function useRemoveWikiLink(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeWikiLink(slug, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK(slug) });
      void qc.invalidateQueries({ queryKey: ["clients", slug, "wiki"] });
    },
  });
}
