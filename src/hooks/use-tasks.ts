"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  batchUpdateTasks,
  batchDeleteTasks,
  addTaskComment,
  getClientTaskSummary,
  getMyDay,
  pushDailyUpdate,
  getRollupRoster,
  publishRollup,
  listMemberClients,
  setMemberClients,
  listFeatureBlocks,
  createFeatureBlock,
  updateFeatureBlock,
  deleteFeatureBlock,
  getTimelineShare,
  setTimelineShare,
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "@/lib/api";
import type { TaskStatus } from "@/types/tasks";

type TaskFilter = { clientId?: string; status?: TaskStatus; assigneeId?: string };

const QK = {
  tasks: (f: TaskFilter) =>
    ["tasks", "list", f.clientId ?? null, f.status ?? null, f.assigneeId ?? null] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  summary: (clientId: string) => ["tasks", "summary", clientId] as const,
  myDay: (date?: string) => ["tasks", "myday", date ?? "today"] as const,
  roster: ["tasks", "rollup"] as const,
  memberClients: (memberId: string) => ["tasks", "member-clients", memberId] as const,
  blocks: (clientId: string) => ["tasks", "blocks", clientId] as const,
  milestones: (clientId: string) => ["tasks", "milestones", clientId] as const,
  share: (slug: string) => ["tasks", "share", slug] as const,
};

/** Invalidate every task-derived query after a write. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["tasks"] });
}

// ─── Board / list ────────────────────────────────────────────────────────────

export function useTasks(filter: TaskFilter = {}) {
  return useQuery({
    queryKey: QK.tasks(filter),
    queryFn: () => listTasks(filter),
    staleTime: 15_000,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: QK.task(id ?? ""),
    queryFn: () => getTask(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useClientTaskSummary(clientId: string | null) {
  return useQuery({
    queryKey: QK.summary(clientId ?? ""),
    queryFn: () => getClientTaskSummary(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTask>[0]) => createTask(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateTask>[1] }) =>
      updateTask(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, orderKey }: { id: string; status: TaskStatus; orderKey: number }) =>
      moveTask(id, { status, orderKey }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBatchUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Parameters<typeof batchUpdateTasks>[1] }) =>
      batchUpdateTasks(ids, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBatchDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => batchDeleteTasks(ids),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => addTaskComment(id, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: QK.task(vars.id) });
      void qc.invalidateQueries({ queryKey: ["tasks", "list"] });
    },
  });
}

// ─── Standup ─────────────────────────────────────────────────────────────────

export function useMyDay(date?: string) {
  return useQuery({
    queryKey: QK.myDay(date),
    queryFn: () => getMyDay(date),
    staleTime: 15_000,
  });
}

export function usePushDailyUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof pushDailyUpdate>[0]) => pushDailyUpdate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks", "myday"] });
      void qc.invalidateQueries({ queryKey: QK.roster });
    },
  });
}

// ─── DevOps roll-up ──────────────────────────────────────────────────────────

export function useRollupRoster(enabled = true) {
  return useQuery({
    queryKey: QK.roster,
    queryFn: () => getRollupRoster(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePublishRollup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (override: boolean = false) => publishRollup(override),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.roster }),
  });
}

// ─── Team client assignments ─────────────────────────────────────────────────

export function useMemberClients(memberId: string | null) {
  return useQuery({
    queryKey: QK.memberClients(memberId ?? ""),
    queryFn: () => listMemberClients(memberId as string),
    enabled: Boolean(memberId),
    staleTime: 30_000,
  });
}

export function useSetMemberClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, clientIds }: { memberId: string; clientIds: string[] }) =>
      setMemberClients(memberId, clientIds),
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: QK.memberClients(vars.memberId) }),
  });
}

// ─── Feature blocks ("lists") ────────────────────────────────────────────────

export function useFeatureBlocks(clientId: string | null) {
  return useQuery({
    queryKey: QK.blocks(clientId ?? ""),
    queryFn: () => listFeatureBlocks(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 15_000,
  });
}

export function useCreateFeatureBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createFeatureBlock>[0]) => createFeatureBlock(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateFeatureBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateFeatureBlock>[1] }) =>
      updateFeatureBlock(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteFeatureBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFeatureBlock(id),
    onSuccess: () => invalidateAll(qc),
  });
}

// ─── Public timeline share ───────────────────────────────────────────────────

export function useTimelineShare(slug: string | null) {
  return useQuery({
    queryKey: QK.share(slug ?? ""),
    queryFn: () => getTimelineShare(slug as string),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });
}

export function useSetTimelineShare(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setTimelineShare(slug, enabled),
    onSuccess: (data) => qc.setQueryData(QK.share(slug), data),
  });
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export function useMilestones(clientId: string | null) {
  return useQuery({
    queryKey: QK.milestones(clientId ?? ""),
    queryFn: () => listMilestones(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 15_000,
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createMilestone>[0]) => createMilestone(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateMilestone>[1] }) =>
      updateMilestone(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMilestone(id),
    onSuccess: () => invalidateAll(qc),
  });
}
