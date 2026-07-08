"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  batchUpdateTasks,
  batchDeleteTasks,
  batchCreateTasks,
  importTasks,
  addTaskComment,
  getClientTaskSummary,
  getTaskAttention,
  getMyDay,
  pushDailyUpdate,
  deleteStandupUpdate,
  getRollupRoster,
  publishRollup,
  pushPmUpdates,
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
  getSlackPushPrefs,
  saveSlackPushPrefs,
  pushProjectUpdate,
  broadcastUpdate,
  listRecentSlackUpdates,
} from "@/lib/api";
import type { TaskStatus, TaskDTO } from "@/types/tasks";
import { useToast } from "@/components/ui/toast";

type TaskFilter = { clientId?: string; status?: TaskStatus; assigneeId?: string; sourceMeetingId?: string; archived?: boolean };

const QK = {
  tasks: (f: TaskFilter) =>
    ["tasks", "list", f.clientId ?? null, f.status ?? null, f.assigneeId ?? null, f.sourceMeetingId ?? null, f.archived ?? false] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  summary: (clientId: string) => ["tasks", "summary", clientId] as const,
  myDay: (date?: string) => ["tasks", "myday", date ?? "today"] as const,
  roster: ["tasks", "rollup"] as const,
  memberClients: (memberId: string) => ["tasks", "member-clients", memberId] as const,
  blocks: (clientId: string) => ["tasks", "blocks", clientId] as const,
  milestones: (clientId: string) => ["tasks", "milestones", clientId] as const,
  share: (slug: string) => ["tasks", "share", slug] as const,
  pushPrefs: ["tasks", "pushPrefs"] as const,
  recentUpdates: ["tasks", "recentUpdates"] as const,
};

/** Invalidate every task-derived query after a write. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["tasks"] });
}

// ─── Optimistic helpers ────────────────────────────────────────────────────────
// The board/list read every "tasks/list" cache variant (one per filter). These
// patch them all in place so a move/delete/status-toggle paints instantly, then
// reconcile against server truth via invalidateAll in onSettled. A snapshot of the
// prior caches is returned so onError can restore exactly what was there.

const TASK_LIST_FILTER = { queryKey: ["tasks", "list"] as const };
type TaskListSnapshot = [QueryKey, TaskDTO[] | undefined][];

function patchTaskLists(qc: QueryClient, updater: (tasks: TaskDTO[]) => TaskDTO[]): TaskListSnapshot {
  const prev = qc.getQueriesData<TaskDTO[]>(TASK_LIST_FILTER);
  qc.setQueriesData<TaskDTO[]>(TASK_LIST_FILTER, (old) => (old ? updater(old) : old));
  return prev;
}

function restoreTaskLists(qc: QueryClient, snapshot: TaskListSnapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

// ─── Board / list ────────────────────────────────────────────────────────────

export function useTasks(filter: TaskFilter = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: QK.tasks(filter),
    queryFn: () => listTasks(filter),
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
    // Board/HQ status can change elsewhere (another tab, the drag board, Slack
    // actions). The global default disables focus refetch; opt this back in so a
    // stale status (e.g. a DOING task still showing as done) self-corrects on return.
    refetchOnWindowFocus: true,
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

export function useTaskAttention(opts: { mine?: boolean; enabled?: boolean } = {}) {
  const { mine = false, enabled = true } = opts;
  return useQuery({
    queryKey: ["tasks", "attention", { mine }] as const,
    queryFn: () => getTaskAttention({ mine }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTask>[0]) => createTask(input),
    onSuccess: () => {
      invalidateAll(qc);
      success("Task created");
    },
    onError: () => error("Couldn't create task", "Please try again."),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateTask>[1] }) =>
      updateTask(id, input),
    onMutate: async ({ id, input }) => {
      // Archive/unarchive moves the task between the active and archived list caches — drop it
      // from whichever it's in now; the destination list reconciles on settle.
      if (input.archived !== undefined) {
        await qc.cancelQueries(TASK_LIST_FILTER);
        return { prev: patchTaskLists(qc, (tasks) => tasks.filter((t) => t.id !== id)) };
      }
      // Only the fields that map 1:1 onto TaskDTO patch optimistically (covers the
      // list's instant "toggle done" + priority/title edits). Everything else
      // (assignees, block, dates…) reconciles on settle via invalidateAll.
      const patch: Partial<Pick<TaskDTO, "status" | "priority" | "title">> = {};
      if (input.status) patch.status = input.status;
      if (input.priority) patch.priority = input.priority;
      if (typeof input.title === "string") patch.title = input.title;
      if (Object.keys(patch).length === 0) return { prev: [] as TaskListSnapshot };
      await qc.cancelQueries(TASK_LIST_FILTER);
      const prev = patchTaskLists(qc, (tasks) => tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) restoreTaskLists(qc, ctx.prev);
      error("Couldn't update task", "Your change was reverted.");
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ id, status, orderKey }: { id: string; status: TaskStatus; orderKey: number }) =>
      moveTask(id, { status, orderKey }),
    onMutate: async ({ id, status, orderKey }) => {
      await qc.cancelQueries(TASK_LIST_FILTER);
      const prev = patchTaskLists(qc, (tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, status, orderKey } : t)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) restoreTaskLists(qc, ctx.prev);
      error("Couldn't move task", "Your change was reverted.");
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries(TASK_LIST_FILTER);
      const prev = patchTaskLists(qc, (tasks) => tasks.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) restoreTaskLists(qc, ctx.prev);
      error("Couldn't delete task", "Please try again.");
    },
    onSuccess: () => success("Task deleted"),
    onSettled: () => invalidateAll(qc),
  });
}

export function useBatchUpdateTasks() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Parameters<typeof batchUpdateTasks>[1] }) =>
      batchUpdateTasks(ids, patch),
    onSuccess: (_data, vars) => {
      invalidateAll(qc);
      const n = vars.ids.length;
      success(`Updated ${n} ${n === 1 ? "task" : "tasks"}`);
    },
    onError: () => error("Couldn't update tasks", "Please try again."),
  });
}

export function useBatchDeleteTasks() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return useMutation({
    mutationFn: (ids: string[]) => batchDeleteTasks(ids),
    onSuccess: (_data, ids) => {
      invalidateAll(qc);
      success(`Deleted ${ids.length} ${ids.length === 1 ? "task" : "tasks"}`);
    },
    onError: () => error("Couldn't delete tasks", "Please try again."),
  });
}

export function useBatchCreateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, tasks }: { clientId: string; tasks: Parameters<typeof batchCreateTasks>[1] }) =>
      batchCreateTasks(clientId, tasks),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useImportTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, tasks }: { slug: string; tasks: Parameters<typeof importTasks>[1] }) =>
      importTasks(slug, tasks),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => addTaskComment(id, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: QK.task(vars.id) });
      void qc.invalidateQueries({ queryKey: ["tasks", "list"] });
      success("Note added");
    },
    onError: () => error("Couldn't add note", "Please try again."),
  });
}

// ─── Standup ─────────────────────────────────────────────────────────────────

export function useMyDay(date?: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: QK.myDay(date),
    queryFn: () => getMyDay(date),
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
    // The Desk drawer is persistently mounted and the myday key is a static
    // "today", so without a focus refetch the AM/PM pills + done-today can show a
    // stale (even previous-day) snapshot. Refetch on focus so they stay accurate.
    refetchOnWindowFocus: true,
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

export function useDeleteStandupUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phase: "AM" | "PM") => deleteStandupUpdate(phase),
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

/** "Push to Slack" — compile every dev's PM update grouped by developer and post
 *  it to the dedicated #updates channel. */
export function usePushPmUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pushPmUpdates(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.roster }),
  });
}

// ─── Ad-hoc Slack pushes (Tasks-page composer + DevOps broadcast) ────────────

export function useSlackPushPrefs() {
  return useQuery({
    queryKey: QK.pushPrefs,
    queryFn: () => getSlackPushPrefs(),
    staleTime: 60_000,
  });
}

export function useSaveSlackPushPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Parameters<typeof saveSlackPushPrefs>[0]) => saveSlackPushPrefs(prefs),
    onSuccess: (prefs) => qc.setQueryData(QK.pushPrefs, prefs),
  });
}

export function usePushProjectUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof pushProjectUpdate>[0]) => pushProjectUpdate(input),
    onSuccess: () => {
      // saveAsDefaults may have changed prefs; markPhases may have moved the dot.
      void qc.invalidateQueries({ queryKey: QK.pushPrefs });
      void qc.invalidateQueries({ queryKey: ["tasks", "myday"] });
      void qc.invalidateQueries({ queryKey: QK.roster });
      void qc.invalidateQueries({ queryKey: QK.recentUpdates });
    },
  });
}

export function useBroadcastUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof broadcastUpdate>[0]) => broadcastUpdate(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.recentUpdates }),
  });
}

export function useRecentSlackUpdates(enabled = true) {
  return useQuery({
    queryKey: QK.recentUpdates,
    queryFn: () => listRecentSlackUpdates(),
    enabled,
    staleTime: 30_000,
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
