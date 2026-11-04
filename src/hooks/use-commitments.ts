"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCommitment,
  deleteCommitment,
  getCommitments,
  syncCommitments,
  updateCommitment,
  updateCommitmentSettings,
} from "@/lib/api";
import type { CommitmentDTO, CommitmentsResponse } from "@/types/commitments";

export const COMMITMENTS_KEY = ["commitments"] as const;

export function useCommitments() {
  return useQuery({
    queryKey: COMMITMENTS_KEY,
    queryFn: getCommitments,
    staleTime: 30_000,
    // While a read is running elsewhere (the job worker, another window), look again soon.
    refetchInterval: (q) => (q.state.data?.settings.syncing ? 5_000 : false),
  });
}

/** Patch one row in the cache straight away, so ticking a box feels instant. */
function patchCache(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<CommitmentDTO>) {
  qc.setQueryData<CommitmentsResponse>(COMMITMENTS_KEY, (old) =>
    old ? { ...old, commitments: old.commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : old,
  );
}

export function useCreateCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCommitment,
    onSuccess: ({ commitment }) =>
      qc.setQueryData<CommitmentsResponse>(COMMITMENTS_KEY, (old) =>
        old ? { ...old, commitments: [commitment, ...old.commitments] } : old,
      ),
  });
}

export function useUpdateCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateCommitment>[1] }) =>
      updateCommitment(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: COMMITMENTS_KEY });
      const previous = qc.getQueryData<CommitmentsResponse>(COMMITMENTS_KEY);
      patchCache(qc, id, input as Partial<CommitmentDTO>);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(COMMITMENTS_KEY, ctx.previous);
    },
    onSuccess: ({ commitment }) => patchCache(qc, commitment.id, commitment),
  });
}

export function useDeleteCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCommitment,
    onSuccess: (_res, id) =>
      qc.setQueryData<CommitmentsResponse>(COMMITMENTS_KEY, (old) =>
        old ? { ...old, commitments: old.commitments.filter((c) => c.id !== id) } : old,
      ),
  });
}

export function useSyncCommitments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncCommitments,
    onSettled: () => qc.invalidateQueries({ queryKey: COMMITMENTS_KEY }),
  });
}

export function useUpdateCommitmentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCommitmentSettings,
    onSuccess: ({ settings }) =>
      qc.setQueryData<CommitmentsResponse>(COMMITMENTS_KEY, (old) => (old ? { ...old, settings } : old)),
  });
}
