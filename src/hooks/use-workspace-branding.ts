/**
 * Workspace branding hook — fetches and updates `/api/workspace/branding`.
 *
 * Branding lives at the workspace level so it travels with team members rather than being trapped
 * in one browser's localStorage. The shape is documented in
 * `src/server/documents.ts::WorkspaceBranding`.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface WorkspaceBranding {
  brandLogoUrl?: string;
  coverTopAccentUrl?: string;
  coverBottomAccentUrl?: string;
  defaultConfidentialityInternal?: string;
  defaultConfidentialityExternal?: string;
  defaultBrandLockup?: "GITWORK" | "CLIENT_X_GITWORK";
  /**
   * Letterhead identity for the document render. Defaults to Gitwork (below) when unset, so the
   * live product is unchanged; a white-label workspace (or the demo) can override it. `companyName`
   * is the running-header agency label; `companyFooter` is the cover's bottom letterhead strip.
   * An explicit empty string / empty arrays de-brand the render (header shows the client only,
   * cover renders no footer strip).
   */
  companyName?: string;
  companyFooter?: { left?: string[]; right?: string[] };
}

const BRANDING_KEY = ["workspace", "branding"] as const;

export function useWorkspaceBranding() {
  return useQuery({
    queryKey: BRANDING_KEY,
    queryFn: async (): Promise<WorkspaceBranding> => {
      const res = await apiFetch<{ branding: WorkspaceBranding }>("/api/workspace/branding");
      return res.branding;
    },
    staleTime: 30_000,
  });
}

export function useUpdateWorkspaceBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<WorkspaceBranding>): Promise<WorkspaceBranding> => {
      const res = await apiFetch<{ branding: WorkspaceBranding }>("/api/workspace/branding", {
        method: "PATCH",
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
      });
      return res.branding;
    },
    onSuccess: (branding) => {
      queryClient.setQueryData(BRANDING_KEY, branding);
    },
  });
}
