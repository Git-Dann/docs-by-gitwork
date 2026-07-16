"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDevSignalAssessment,
  createDevSignalChallenge,
  createDevSignalOutcomeLink,
  createDevSignalPipelineConfig,
  clearDevSignalDemo,
  getDevSignalAnalytics,
  getDevSignalCalibration,
  getDevSignalNotice,
  seedDevSignalDemo,
  updateDevSignalNotice,
  getDevSignalAssessment,
  listDevSignalAssessments,
  listDevSignalChallenges,
  listDevSignalConfigs,
  promoteDevSignalToCode,
  recordDevSignalDecision,
  recordDevSignalInterview,
  runDevSignalAssessment,
  updateDevSignalChallenge,
  updateDevSignalDataRequest,
  type DevSignalChallengeInput,
} from "@/lib/api";

const KEY = "devsignal";

export function useDevSignalAssessments(filters: { status?: string; decision?: string } = {}) {
  return useQuery({
    queryKey: [KEY, "assessments", filters],
    queryFn: () => listDevSignalAssessments(filters),
    staleTime: 1000 * 15,
  });
}

export function useDevSignalAssessment(id: string | null) {
  return useQuery({
    queryKey: [KEY, "assessment", id],
    queryFn: () => getDevSignalAssessment(id as string),
    enabled: Boolean(id),
  });
}

export function useDevSignalAnalytics() {
  return useQuery({ queryKey: [KEY, "analytics"], queryFn: getDevSignalAnalytics, staleTime: 1000 * 30 });
}

export function useDevSignalConfigs() {
  return useQuery({ queryKey: [KEY, "configs"], queryFn: listDevSignalConfigs, staleTime: 1000 * 60 });
}

export function useDevSignalCalibration(enabled = true) {
  return useQuery({
    queryKey: [KEY, "calibration"],
    queryFn: getDevSignalCalibration,
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useSeedDevSignalDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: seedDevSignalDemo,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useClearDevSignalDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearDevSignalDemo,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDevSignalNotice(enabled = true) {
  return useQuery({
    queryKey: [KEY, "notice"],
    queryFn: getDevSignalNotice,
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useUpdateDevSignalNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: Parameters<typeof updateDevSignalNotice>[0]) => updateDevSignalNotice(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "notice"] }),
  });
}

export function useCreateDevSignalPipelineConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDevSignalPipelineConfig>[0]) =>
      createDevSignalPipelineConfig(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "configs"] });
      qc.invalidateQueries({ queryKey: [KEY, "calibration"] });
    },
  });
}

export function useCreateDevSignalAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDevSignalAssessment,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "assessments"] }),
  });
}

/** Shared invalidation for actions that mutate a single assessment. */
function useAssessmentMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "assessment", id] });
      qc.invalidateQueries({ queryKey: [KEY, "assessments"] });
      qc.invalidateQueries({ queryKey: [KEY, "analytics"] });
    },
  });
}

export function useRunDevSignalAssessment(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runDevSignalAssessment(id as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "assessment", id] });
      qc.invalidateQueries({ queryKey: [KEY, "assessments"] });
      qc.invalidateQueries({ queryKey: [KEY, "analytics"] });
    },
  });
}

export function useRecordDevSignalDecision(id: string | null) {
  return useAssessmentMutation(
    (input: Parameters<typeof recordDevSignalDecision>[1]) => recordDevSignalDecision(id as string, input),
    id,
  );
}

export function useRecordDevSignalInterview(id: string | null) {
  return useAssessmentMutation(
    (input: Parameters<typeof recordDevSignalInterview>[1]) => recordDevSignalInterview(id as string, input),
    id,
  );
}

export function usePromoteDevSignalToCode(id: string | null) {
  return useAssessmentMutation(
    (input: { reason?: string } = {}) => promoteDevSignalToCode(id as string, input),
    id,
  );
}

export function useCreateDevSignalOutcomeLink(id: string | null) {
  return useAssessmentMutation(
    (input: Parameters<typeof createDevSignalOutcomeLink>[0]) => createDevSignalOutcomeLink(input),
    id,
  );
}

// ─── Challenge bank ──────────────────────────────────────────────────────────

export function useDevSignalChallenges() {
  return useQuery({
    queryKey: [KEY, "challenges"],
    queryFn: listDevSignalChallenges,
    staleTime: 1000 * 30,
  });
}

export function useCreateDevSignalChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DevSignalChallengeInput) => createDevSignalChallenge(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "challenges"] }),
  });
}

export function useUpdateDevSignalChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, input }: { slug: string; input: Partial<Omit<DevSignalChallengeInput, "slug">> }) =>
      updateDevSignalChallenge(slug, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "challenges"] }),
  });
}

export function useUpdateDevSignalDataRequest(assessmentId: string | null) {
  return useAssessmentMutation(
    ({ id, status }: { id: string; status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" }) =>
      updateDevSignalDataRequest(id, status),
    assessmentId,
  );
}
