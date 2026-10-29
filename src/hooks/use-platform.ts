"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { platformQueryString, type PlatformWorkspaceQuery } from "@/lib/platform-rules";
import type {
  PlatformAuditPage,
  PlatformWorkspace,
  PlatformWorkspacePage,
  PlatformWorkspaceUpdate,
} from "@/lib/platform-types";

const ROOT = ["platform"] as const;

/** One page of businesses. The previous page stays on screen while the next loads. */
export function usePlatformWorkspaces(query: PlatformWorkspaceQuery) {
  const qs = platformQueryString(query);
  return useQuery({
    queryKey: [...ROOT, "workspaces", qs],
    queryFn: () => apiFetch<PlatformWorkspacePage>(`/api/platform/workspaces${qs ? `?${qs}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

/** One business, for its popup. Reads it directly, so a link opens it whatever page the list is on. */
export function usePlatformWorkspace(id: string | null) {
  return useQuery({
    queryKey: [...ROOT, "workspace", id],
    enabled: Boolean(id),
    queryFn: async () =>
      (await apiFetch<{ workspace: PlatformWorkspace }>(`/api/platform/workspaces/${encodeURIComponent(id!)}`)).workspace,
  });
}

/** Platform activity, newest first. With a workspaceId, just that business. */
export function usePlatformAudit(page: number, workspaceId: string | null = null) {
  const qs = new URLSearchParams();
  if (page) qs.set("page", String(page));
  if (workspaceId) qs.set("workspaceId", workspaceId);
  const s = qs.toString();
  return useQuery({
    queryKey: [...ROOT, "audit", s],
    queryFn: () => apiFetch<PlatformAuditPage>(`/api/platform/audit${s ? `?${s}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

export function useUpdatePlatformWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: PlatformWorkspaceUpdate }) =>
      (
        await apiFetch<{ workspace: PlatformWorkspace }>(`/api/platform/workspaces/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        })
      ).workspace,
    onSuccess: () => {
      // Every list page, the open business and the activity feed all read what changed.
      void qc.invalidateQueries({ queryKey: ROOT });
      // The sidebar reads the module list from /api/account, so a change to one's own
      // workspace shows there straight away.
      void qc.invalidateQueries({ queryKey: ["account", "me"] });
    },
  });
}
