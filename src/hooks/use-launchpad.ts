"use client";

/**
 * Launchpad hooks.
 *
 * Kept in their own file rather than folded into `use-wiki.ts` (already 684 lines),
 * but they invalidate the SAME `["client-wiki", slug]` key, because the Launchpad
 * arrives inside the wiki DTO — so an internal write refreshes the page it came
 * from, exactly as the intake and monitors mutations do.
 *
 * The slug/token split mirrors the rest of the wiki: `slug` = the internal team
 * (session + canManageClients), `token` = the client on their own share link. Each
 * write returns the whole DTO, so nothing here patches a cache by hand — the one
 * pattern that has repeatedly gone stale in this codebase (§42.6).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveLaunchpadDocApi,
  approvePublicLaunchpadDocApi,
  assignLaunchpadApi,
  createLaunchpadTemplateApi,
  deleteLaunchpadTemplateApi,
  duplicateLaunchpadTemplateApi,
  getClientLaunchpadApi,
  getLaunchpadTemplateApi,
  listLaunchpadTemplatesApi,
  saveLaunchpadAnswersApi,
  savePublicLaunchpadAnswersApi,
  setLaunchpadEnabledApi,
  setLaunchpadModulesApi,
  updateLaunchpadDocApi,
  updateLaunchpadItemApi,
  updateLaunchpadTemplateApi,
  updatePublicLaunchpadDocApi,
  updatePublicLaunchpadItemApi,
  type LaunchpadDocPatch,
  type LaunchpadItemPatch,
} from "@/lib/api";
import type { LaunchpadStructure } from "@/types/launchpad";

const TEMPLATES_KEY = ["launchpad-templates"] as const;

// ─── Internal (by client slug) ───────────────────────────────────────────────

/** Refresh the wiki DTO the Launchpad renders inside. */
function useWikiRefresh(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] });
    // The Portal client list carries the completeness signal, so it goes stale too.
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
  };
}

export function useClientLaunchpad(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["client-launchpad", slug],
    queryFn: () => getClientLaunchpadApi(slug),
    enabled: enabled && Boolean(slug),
  });
}

export function useSetLaunchpadEnabled(slug: string) {
  const refresh = useWikiRefresh(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setLaunchpadEnabledApi(slug, enabled),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["client-launchpad", slug] });
    },
  });
}

export function useAssignLaunchpad(slug: string) {
  const refresh = useWikiRefresh(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { templateId?: string; enabledModules?: string[] }) =>
      assignLaunchpadApi(slug, input),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["client-launchpad", slug] });
    },
  });
}

export function useSetLaunchpadModules(slug: string) {
  const refresh = useWikiRefresh(slug);
  return useMutation({
    mutationFn: (enabledModules: string[]) => setLaunchpadModulesApi(slug, enabledModules),
    onSuccess: refresh,
  });
}

export function useUpdateLaunchpadItem(slug: string) {
  const refresh = useWikiRefresh(slug);
  return useMutation({
    mutationFn: (input: { itemId: string; patch: LaunchpadItemPatch }) =>
      updateLaunchpadItemApi(slug, input.itemId, input.patch),
    onSuccess: refresh,
  });
}

export function useSaveLaunchpadAnswers(slug: string) {
  const refresh = useWikiRefresh(slug);
  return useMutation({
    mutationFn: (answers: Record<string, unknown>) => saveLaunchpadAnswersApi(slug, answers),
    onSuccess: refresh,
  });
}

export function useUpdateLaunchpadDoc(slug: string) {
  const refresh = useWikiRefresh(slug);
  return useMutation({
    mutationFn: (input: { docKey: string; patch: LaunchpadDocPatch }) =>
      updateLaunchpadDocApi(slug, input.docKey, input.patch),
    onSuccess: refresh,
  });
}

export function useApproveLaunchpadDoc(slug: string) {
  const refresh = useWikiRefresh(slug);
  return useMutation({
    mutationFn: (input: { docKey: string; approved: boolean }) =>
      approveLaunchpadDocApi(slug, input.docKey, input.approved),
    onSuccess: refresh,
  });
}

// ─── Client-facing (by wiki share token) ─────────────────────────────────────
//
// No cache invalidation: the public wiki is server-rendered from the token, so the
// section holds the returned DTO in local state and re-renders from it. Same shape
// as `WikiIntakeSection`'s public mode.

export function useUpdatePublicLaunchpadItem(token: string) {
  return useMutation({
    mutationFn: (input: { itemId: string; patch: LaunchpadItemPatch }) =>
      updatePublicLaunchpadItemApi(token, input.itemId, input.patch),
  });
}

export function useSavePublicLaunchpadAnswers(token: string) {
  return useMutation({
    mutationFn: (answers: Record<string, unknown>) =>
      savePublicLaunchpadAnswersApi(token, answers),
  });
}

export function useUpdatePublicLaunchpadDoc(token: string) {
  return useMutation({
    mutationFn: (input: { docKey: string; patch: LaunchpadDocPatch }) =>
      updatePublicLaunchpadDocApi(token, input.docKey, input.patch),
  });
}

export function useApprovePublicLaunchpadDoc(token: string) {
  return useMutation({
    mutationFn: (input: { docKey: string; approved: boolean }) =>
      approvePublicLaunchpadDocApi(token, input.docKey, input.approved),
  });
}

// ─── Templates (Settings → Launchpad) ────────────────────────────────────────

export function useLaunchpadTemplates(includeArchived = false) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, { includeArchived }],
    queryFn: () => listLaunchpadTemplatesApi(includeArchived),
  });
}

export function useLaunchpadTemplate(id: string | null) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, id],
    queryFn: () => getLaunchpadTemplateApi(id as string),
    enabled: Boolean(id),
  });
}

function useTemplatesRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
}

export function useCreateLaunchpadTemplate() {
  const refresh = useTemplatesRefresh();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; cloneFromId?: string }) =>
      createLaunchpadTemplateApi(input),
    onSuccess: () => void refresh(),
  });
}

export function useUpdateLaunchpadTemplate() {
  const refresh = useTemplatesRefresh();
  return useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      description?: string | null;
      structure?: LaunchpadStructure;
      isDefault?: boolean;
      isArchived?: boolean;
    }) => {
      const { id, ...rest } = input;
      return updateLaunchpadTemplateApi(id, rest);
    },
    onSuccess: () => void refresh(),
  });
}

export function useDuplicateLaunchpadTemplate() {
  const refresh = useTemplatesRefresh();
  return useMutation({
    mutationFn: (id: string) => duplicateLaunchpadTemplateApi(id),
    onSuccess: () => void refresh(),
  });
}

export function useDeleteLaunchpadTemplate() {
  const refresh = useTemplatesRefresh();
  return useMutation({
    mutationFn: (id: string) => deleteLaunchpadTemplateApi(id),
    onSuccess: () => void refresh(),
  });
}
