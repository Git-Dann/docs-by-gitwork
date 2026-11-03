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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWikiSheetPeopleApi, setWikiSheetsEnabledApi, type SheetsTarget } from "@/lib/api";
import type { SheetPerson } from "@/types/wiki-sheets";

const NO_PEOPLE: SheetPerson[] = [];

/**
 * Who can be picked into a person column (§73.1). The client's list needs the wiki login
 * (it's for editing), so a read-only visitor gets an empty list — and a 401 is not retried.
 */
export function useSheetPeople(target: SheetsTarget, enabled = true): SheetPerson[] {
  const key = target.mode === "internal" ? target.slug : target.token;
  const q = useQuery({
    queryKey: ["wiki-sheet-people", target.mode, key],
    queryFn: () => getWikiSheetPeopleApi(target),
    enabled: enabled && Boolean(key),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return q.data?.people ?? NO_PEOPLE;
}

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
