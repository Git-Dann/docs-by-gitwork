"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { StudyListItem, StudyRecord } from "@/server/study";

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useStudyList() {
  return useQuery({
    queryKey: ["study", "list"],
    queryFn: () => apiFetch<{ studies: StudyListItem[] }>("/api/study/studies").then((r) => r.studies),
    staleTime: 1000 * 10,
    refetchInterval: (query) => {
      const studies = query.state.data;
      const hasRunning = studies?.some((s) => s.status === "RUNNING" || s.status === "PLAN_GENERATING");
      return hasRunning ? 3000 : false;
    },
  });
}

export function useStudy(studyId: string | null) {
  return useQuery({
    queryKey: ["study", studyId],
    queryFn: () => apiFetch<{ study: StudyRecord }>(`/api/study/studies/${studyId}`).then((r) => r.study),
    enabled: Boolean(studyId),
    staleTime: 1000 * 5,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "RUNNING" || status === "PLAN_GENERATING" ? 3000 : false;
    },
  });
}

export function useStudyPersonas() {
  return useQuery({
    queryKey: ["study", "personas"],
    queryFn: () => apiFetch<{ personas: Array<{ id: string; name: string; shortName: string; description: string; color: string; initials: string; techComfort: string; communicationStyle: string }> }>("/api/study/personas").then((r) => r.personas),
    staleTime: Infinity,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; problemStatement: string; researchGoals: string[]; sessionMode: string; selectedPersonaIds: string[] }) =>
      apiFetch<{ study: StudyRecord }>("/api/study/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.study),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study", "list"] }),
  });
}

export function useUpdateStudy(studyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StudyRecord>) =>
      apiFetch<{ study: StudyRecord }>(`/api/study/studies/${studyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.study),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", studyId] });
      qc.invalidateQueries({ queryKey: ["study", "list"] });
    },
  });
}

export function useDeleteStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studyId: string) =>
      apiFetch(`/api/study/studies/${studyId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study", "list"] }),
  });
}

export function useGeneratePlan(studyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/study/studies/${studyId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study", studyId] }),
  });
}

export function useSavePlan(studyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { questions: Array<{ id?: string; text: string; personaIds: string[]; turnType: string; orderIndex: number; rationale?: string }>; notes?: string; status: "DRAFT" | "LOCKED" }) =>
      apiFetch(`/api/study/studies/${studyId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study", studyId] }),
  });
}

export function useRunStudy(studyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/study/studies/${studyId}/run`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study", studyId] }),
  });
}

// ── SSE stream hook ───────────────────────────────────────────────────────────

export function useStudyStream(studyId: string | null, onUpdate: (study: StudyRecord) => void) {
  const qc = useQueryClient();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!studyId) return;
    const es = new EventSource(`/api/study/studies/${studyId}/stream`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; study?: StudyRecord };
        if (event.type === "state" && event.study) {
          onUpdateRef.current(event.study);
          qc.setQueryData(["study", studyId], event.study);
        }
        if (event.type === "complete") es.close();
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => es.close();
    return () => es.close();
  }, [studyId, qc]);
}
