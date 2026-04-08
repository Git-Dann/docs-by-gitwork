"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCodeClearCandidateNote,
  applyCodeClearGitHubRun,
  bulkUpdateCodeClearCandidates,
  createCodeClearCandidate,
  deleteCodeClearCandidate,
  finalizeCodeClearCandidateScore,
  getCodeClearCandidate,
  getCodeClearStats,
  listCodeClearCandidates,
  listCodeClearGitHubRuns,
  runCodeClearGitHubAnalysis,
  updateCodeClearCandidate,
  type CodeClearRunsResponse,
} from "@/lib/api";
import type { CandidateListParams } from "@/types/codeclear";

export function useCodeClearStats() {
  return useQuery({
    queryKey: ["codeclear", "stats"],
    queryFn: getCodeClearStats,
    staleTime: 1000 * 15,
  });
}

export function useCodeClearCandidates(filters: Partial<CandidateListParams> = {}) {
  return useQuery({
    queryKey: ["codeclear", "candidates", filters],
    queryFn: () => listCodeClearCandidates(filters),
    staleTime: 1000 * 10,
  });
}

export function useCodeClearCandidate(id: string | null) {
  return useQuery({
    queryKey: ["codeclear", "candidate", id],
    queryFn: () => getCodeClearCandidate(id as string),
    enabled: Boolean(id),
    staleTime: 1000 * 5,
    refetchInterval: (query) => {
      const candidate = query.state.data?.candidate;
      return candidate?.latestGitHubAnalysis?.status === "RUNNING" ? 4000 : false;
    },
  });
}

export function useCodeClearGitHubRuns(id: string | null) {
  return useQuery<CodeClearRunsResponse>({
    queryKey: ["codeclear", "runs", id],
    queryFn: () => listCodeClearGitHubRuns(id as string),
    enabled: Boolean(id),
    staleTime: 1000 * 5,
  });
}

export function useCreateCodeClearCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCodeClearCandidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
    },
  });
}

export function useBulkUpdateCodeClearCandidates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkUpdateCodeClearCandidates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate"] });
    },
  });
}

export function useUpdateCodeClearCandidate(id: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof updateCodeClearCandidate>[1]) =>
      updateCodeClearCandidate(id as string, input),
    onSuccess: (result) => {
      queryClient.setQueryData(["codeclear", "candidate", id], result);
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
    },
  });
}

export function useDeleteCodeClearCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCodeClearCandidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate"] });
    },
  });
}

export function useAddCodeClearCandidateNote(id: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { body: string }) => addCodeClearCandidateNote(id as string, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
    },
  });
}

export function useFinalizeCodeClearCandidateScore(id: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof finalizeCodeClearCandidateScore>[1]) =>
      finalizeCodeClearCandidateScore(id as string, input),
    onSuccess: (result) => {
      queryClient.setQueryData(["codeclear", "candidate", id], result);
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
    },
  });
}

export function useRunCodeClearGitHubAnalysis(id: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => runCodeClearGitHubAnalysis(id as string),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["codeclear", "runs", id] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
      if (result.candidate) {
        queryClient.setQueryData(["codeclear", "candidate", id], {
          candidate: result.candidate,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate", id] });
      }
    },
  });
}

export function useApplyCodeClearGitHubRun(id: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => applyCodeClearGitHubRun(id as string, runId),
    onSuccess: (result) => {
      queryClient.setQueryData(["codeclear", "candidate", id], {
        candidate: result.candidate,
      });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "runs", id] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "stats"] });
    },
  });
}
