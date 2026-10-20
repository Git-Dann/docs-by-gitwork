"use client";

/**
 * Sheets hooks. The grid keeps its own optimistic copy of the rows (so a refetch landing
 * mid-edit never overwrites what someone is typing) and calls the fetchers in
 * `src/lib/api.ts` directly; these hooks only answer "how do I get fresh data afterwards?".
 *
 *   - Internal (team): invalidate the wiki query — the dashboard card and the section both
 *     read the same sheets.
 *   - Public (client): the share page is server-rendered from the token, so there is no
 *     query to invalidate; `router.refresh()` re-renders it with fresh props.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setWikiSheetsEnabledApi, type SheetsTarget } from "@/lib/api";

export function useSheetsRefresh(target: SheetsTarget): () => void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = target.mode === "internal" ? target.slug : target.token;
  const mode = target.mode;
  return useCallback(() => {
    if (mode === "internal") void queryClient.invalidateQueries({ queryKey: ["client-wiki", key] });
    else router.refresh();
  }, [mode, key, queryClient, router]);
}

export function useSetWikiSheetsEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiSheetsEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}
