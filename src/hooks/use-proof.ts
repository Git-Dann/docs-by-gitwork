"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProofDocument, getProofHealth, listProofDocuments, updateProofDocument } from "@/lib/api";

export function useProofHealth() {
  return useQuery({
    queryKey: ["proof", "health"],
    queryFn: getProofHealth,
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 30,
    retry: 1,
  });
}

export function useProofDocuments(filters?: { proposalId?: string | null }) {
  return useQuery({
    queryKey: ["proof", "documents", filters?.proposalId ?? "all"],
    queryFn: () => listProofDocuments(filters),
    staleTime: 1000 * 10,
  });
}

export function useCreateProofDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProofDocument,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proof", "documents"] });
      if (result.document.proposalId) {
        queryClient.invalidateQueries({
          queryKey: ["proof", "documents", result.document.proposalId],
        });
      }
    },
  });
}

export function useUpdateProofDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateProofDocument>[1] }) =>
      updateProofDocument(id, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proof", "documents"] });
      if (result.document.proposalId) {
        queryClient.invalidateQueries({
          queryKey: ["proof", "documents", result.document.proposalId],
        });
      }
    },
  });
}
