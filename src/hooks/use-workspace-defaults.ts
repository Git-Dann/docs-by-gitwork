/**
 * Workspace proposal defaults hook — fetches and updates `/api/workspace/defaults`.
 *
 * Use everywhere we previously read `settings.workspace.{preparedBy,team,contactDetails}` or
 * `settings.proposalDefaults.objectiveSnippets` from localStorage.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ObjectiveSnippet {
  title: string;
  description: string;
}

export interface WorkspaceProposalDefaults {
  preparedBy: string;
  team: string;
  contactDetails: string;
  objectiveSnippets: ObjectiveSnippet[];
}

const DEFAULTS_KEY = ["workspace", "defaults"] as const;

export function useWorkspaceDefaults() {
  return useQuery({
    queryKey: DEFAULTS_KEY,
    queryFn: async (): Promise<WorkspaceProposalDefaults> => {
      const res = await apiFetch<{ defaults: WorkspaceProposalDefaults }>(
        "/api/workspace/defaults",
      );
      return res.defaults;
    },
    staleTime: 30_000,
  });
}

export function useUpdateWorkspaceDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<WorkspaceProposalDefaults>,
    ): Promise<WorkspaceProposalDefaults> => {
      const res = await apiFetch<{ defaults: WorkspaceProposalDefaults }>(
        "/api/workspace/defaults",
        {
          method: "PATCH",
          body: JSON.stringify(patch),
          headers: { "Content-Type": "application/json" },
        },
      );
      return res.defaults;
    },
    onSuccess: (defaults) => {
      queryClient.setQueryData(DEFAULTS_KEY, defaults);
    },
  });
}
