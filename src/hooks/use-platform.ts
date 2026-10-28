"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PlatformAuditItem, PlatformWorkspace, PlatformWorkspaceUpdate } from "@/lib/platform-types";

const WORKSPACES_KEY = ["platform", "workspaces"] as const;
const AUDIT_KEY = ["platform", "audit"] as const;

export function usePlatformWorkspaces() {
  return useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: async () => (await apiFetch<{ workspaces: PlatformWorkspace[] }>("/api/platform/workspaces")).workspaces,
  });
}

export function usePlatformAudit() {
  return useQuery({
    queryKey: AUDIT_KEY,
    queryFn: async () => (await apiFetch<{ entries: PlatformAuditItem[] }>("/api/platform/audit")).entries,
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
      void qc.invalidateQueries({ queryKey: WORKSPACES_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
      // The sidebar reads the module list from /api/account, so a change to one's own
      // workspace shows there straight away.
      void qc.invalidateQueries({ queryKey: ["account", "me"] });
    },
  });
}
