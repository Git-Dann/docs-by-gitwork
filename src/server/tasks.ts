// Tasks — Portal task tracker (CRUD + board + notes).
//
// All functions take an `EffectiveUser` and scope to that user's workspace and,
// for restricted developers (`seeAllClients` off), to the clients they're
// assigned to. Mirrors the Backstage server-module conventions.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  ForbiddenError,
  canSeeAllClients,
} from "@/server/auth/effective-user";
import { placementClientIds } from "@/server/client-assignments";
import { dispatchNotification } from "@/server/notifications";
import { extractMentionIds, stripMentionTokens } from "@/lib/mentions";
import type {
  TaskDTO,
  TaskDetailDTO,
  TaskCommentDTO,
  TaskAttachmentDTO,
  TaskStatus,
  TaskPriority,
  TaskLabel,
  TaskUserRef,
  TaskScribeSourceRef,
  ClientTaskSummary,
  TaskCounts,
  TaskAttentionDTO,
} from "@/types/tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/tasks";

// ─── Row shapes + mappers ──────────────────────────────────────────────────

const userSelect = { select: { id: true, name: true, email: true, avatarUrl: true } };

const taskInclude = {
  client: { select: { id: true, name: true, slug: true } },
  assignee: userSelect, // legacy single assignee (fallback for pre-v3 rows)
  assignees: userSelect,
  createdBy: userSelect,
  featureBlock: { select: { id: true, name: true } },
  _count: { select: { comments: true, subtasks: true, attachments: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

type CommentRow = Prisma.TaskCommentGetPayload<{
  include: { author: { select: { id: true; name: true; email: true; avatarUrl: true } } };
}>;

type AttachmentRow = Prisma.TaskAttachmentGetPayload<{
  select: {
    id: true;
    taskId: true;
    mime: true;
    filename: true;
    createdAt: true;
    uploadedBy: { select: { id: true; name: true; email: true; avatarUrl: true } };
  };
}>;

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

function userRef(
  u: { id: string; name: string | null; email: string; avatarUrl: string | null } | null,
): TaskUserRef | null {
  return u ? { id: u.id, name: displayName(u), avatarUrl: u.avatarUrl } : null;
}

function taskRowToDTO(row: TaskRow): TaskDTO {
  // Prefer the m-n assignees; fall back to the legacy single assignee for old rows.
  const assignees =
    row.assignees.length > 0
      ? row.assignees.map((a) => userRef(a)).filter((x): x is TaskUserRef => x !== null)
      : row.assignee
        ? [userRef(row.assignee)].filter((x): x is TaskUserRef => x !== null)
        : [];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    client: { id: row.client.id, name: row.client.name, slug: row.client.slug },
    assignees,
    createdBy: userRef(row.createdBy),
    featureBlock: row.featureBlock ? { id: row.featureBlock.id, name: row.featureBlock.name } : null,
    parentId: row.parentId,
    title: row.title,
    description: row.description,
    acceptanceCriteria: row.acceptanceCriteria,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    label: row.label as TaskLabel | null,
    orderKey: row.orderKey,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    blockedReason: row.blockedReason,
    blockedAt: row.blockedAt ? row.blockedAt.toISOString() : null,
    blockedResponse: row.blockedResponse,
    blockedResponseAt: row.blockedResponseAt ? row.blockedResponseAt.toISOString() : null,
    commentCount: row._count.comments,
    subtaskCount: row._count.subtasks,
    subtaskDoneCount: 0,
    attachmentCount: row._count.attachments,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    scribeSource: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Board/list consumers only need task card fields. Descriptions, acceptance
 * criteria, and imported ClickUp metadata can be arbitrarily large, so keep
 * them behind the detail endpoint instead of repeating them for every card.
 */
function taskListDTO(task: TaskDTO): TaskDTO {
  return {
    ...task,
    description: null,
    acceptanceCriteria: null,
    metadata: null,
  };
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scribeMetadata(task: Pick<TaskDTO, "metadata">): {
  meetingId: string;
  meetingTitle: string | null;
  meetingStartedAt: string | null;
  actionItemId: string | null;
  actionTitle: string | null;
  actionText: string | null;
} | null {
  if (metadataString(task.metadata, "source") !== "scribe_meeting") return null;
  const meetingId = metadataString(task.metadata, "sourceMeetingId");
  if (!meetingId) return null;
  return {
    meetingId,
    meetingTitle: metadataString(task.metadata, "sourceMeetingTitle"),
    meetingStartedAt: metadataString(task.metadata, "sourceMeetingStartedAt"),
    actionItemId: metadataString(task.metadata, "sourceActionItemId"),
    actionTitle: metadataString(task.metadata, "sourceActionTitle"),
    actionText: metadataString(task.metadata, "sourceActionText"),
  };
}

async function attachScribeSources<T extends TaskDTO>(
  workspaceId: string,
  tasks: T[],
): Promise<T[]> {
  const taskIds = tasks.map((task) => task.id);
  if (taskIds.length === 0) return tasks;
  const metadataByTaskId = new Map<string, NonNullable<ReturnType<typeof scribeMetadata>>>();
  const metadataMeetingIds = new Set<string>();
  for (const task of tasks) {
    const meta = scribeMetadata(task);
    if (!meta) continue;
    metadataByTaskId.set(task.id, meta);
    metadataMeetingIds.add(meta.meetingId);
  }
  const actionItems = await prisma.meetingActionItem.findMany({
    where: { taskId: { in: taskIds }, meeting: { workspaceId } },
    select: {
      id: true,
      taskId: true,
      title: true,
      text: true,
      meeting: {
        select: {
          id: true,
          title: true,
          startedAt: true,
          createdAt: true,
        },
      },
    },
  });
  const byTaskId = new Map<string, TaskScribeSourceRef>();
  for (const item of actionItems) {
    if (!item.taskId) continue;
    byTaskId.set(item.taskId, {
      kind: "ACTION_ITEM",
      meetingId: item.meeting.id,
      meetingTitle: item.meeting.title,
      meetingStartedAt: (item.meeting.startedAt ?? item.meeting.createdAt).toISOString(),
      actionItemId: item.id,
      actionTitle: item.title,
      actionText: item.text,
    });
  }
  const meetingIds = [...metadataMeetingIds];
  const meetingRows = meetingIds.length
    ? await prisma.meeting.findMany({
        where: { id: { in: meetingIds }, workspaceId },
        select: { id: true, title: true, startedAt: true, createdAt: true },
      })
    : [];
  const meetingsById = new Map(meetingRows.map((meeting) => [meeting.id, meeting]));
  for (const task of tasks) {
    if (byTaskId.has(task.id)) continue;
    const meta = metadataByTaskId.get(task.id);
    if (!meta) continue;
    const meeting = meetingsById.get(meta.meetingId);
    byTaskId.set(task.id, {
      kind: meta.actionItemId ? "ACTION_ITEM" : "MANUAL",
      meetingId: meta.meetingId,
      meetingTitle: meeting?.title ?? meta.meetingTitle ?? "Meeting notes",
      meetingStartedAt:
        (meeting?.startedAt ?? meeting?.createdAt)?.toISOString() ?? meta.meetingStartedAt,
      actionItemId: meta.actionItemId,
      actionTitle: meta.actionTitle,
      actionText: meta.actionText,
    });
  }
  // Strip the raw `metadata` blob from the wire. It's only ever read server-side
  // (to derive scribeSource, just above); the client never touches it. ClickUp-
  // imported tasks carry large metadata payloads, which bloated /api/tasks to
  // tens of MB and made the tasks screen crawl. scribeSource is already resolved
  // by this point, so nulling metadata here is lossless for the client.
  return tasks.map((task) => ({
    ...task,
    metadata: null,
    scribeSource: byTaskId.get(task.id) ?? task.scribeSource,
  }));
}

function commentRowToDTO(row: CommentRow): TaskCommentDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    author: userRef(row.author),
    body: row.body,
    mentions: Array.isArray(row.mentions) ? (row.mentions as string[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

function attachmentRowToDTO(row: AttachmentRow): TaskAttachmentDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    uploadedBy: userRef(row.uploadedBy),
    mime: row.mime,
    filename: row.filename,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Scoping ───────────────────────────────────────────────────────────────

/**
 * The client IDs a restricted user may see (empty array = none). Union of two sources:
 *  1. Explicit ClientAssignment rows (Settings → Team).
 *  2. Open Code placements on a Candidate matching their email (placementClientIds) —
 *     so a dev placed on a client in Code sees it in Portal/tasks without a manual assign.
 */
export async function assignedClientIds(user: EffectiveUser): Promise<string[]> {
  const [rows, placementIds] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { workspaceId: user.workspaceId, userId: user.id },
      select: { clientId: true },
    }),
    placementClientIds(user),
  ]);
  return [...new Set([...rows.map((r) => r.clientId), ...placementIds])];
}

/**
 * Prisma `where` fragment that limits a query to the clients this user may see.
 * Admins / `seeAllClients` holders get the whole workspace; everyone else is
 * limited to their ClientAssignment rows (and an impossible filter when they
 * have none, so they see nothing rather than everything).
 */
async function clientScopeWhere(user: EffectiveUser): Promise<Prisma.TaskWhereInput> {
  if (canSeeAllClients(user)) return { workspaceId: user.workspaceId };
  const ids = await assignedClientIds(user);
  return { workspaceId: user.workspaceId, clientId: { in: ids.length ? ids : ["__none__"] } };
}

/** Throw unless the user may act on this client. */
export async function assertClientInScope(user: EffectiveUser, clientId: string): Promise<void> {
  if (canSeeAllClients(user)) {
    const client = await prisma.workspaceClient.findFirst({
      where: { id: clientId, workspaceId: user.workspaceId },
      select: { id: true },
    });
    if (!client) throw new ForbiddenError("Client not found");
    return;
  }
  const ids = await assignedClientIds(user);
  if (!ids.includes(clientId)) {
    throw new ForbiddenError("You are not assigned to this client");
  }
}

/** Stamp startedAt/completedAt based on a status transition. */
function statusTimestamps(
  prevStatus: TaskStatus | null,
  nextStatus: TaskStatus,
  row: { startedAt: Date | null },
): { startedAt?: Date | null; completedAt?: Date | null } {
  const out: { startedAt?: Date | null; completedAt?: Date | null } = {};
  const startedStates: TaskStatus[] = ["DOING", "IN_REVIEW", "UI_DONE", "DONE"];
  if (startedStates.includes(nextStatus) && !row.startedAt) {
    out.startedAt = new Date();
  }
  if (nextStatus === "DONE" && prevStatus !== "DONE") {
    out.completedAt = new Date();
  }
  if (nextStatus !== "DONE" && prevStatus === "DONE") {
    out.completedAt = null;
  }
  return out;
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function listTasks(
  user: EffectiveUser,
  opts: { clientId?: string; status?: TaskStatus; assigneeId?: string; sourceMeetingId?: string; archived?: boolean; includeSubtasks?: boolean; limit?: number; doneWithinDays?: number; blocked?: boolean } = {},
): Promise<TaskDTO[]> {
  await ensureBaseRecords();
  const where = await clientScopeWhere(user);
  // Active views exclude archived; the Archived tab passes archived:true for only-archived.
  where.archivedAt = opts.archived ? { not: null } : null;
  // Blocked-only (the wiki "Action needed" surface): tasks flagged blocked, any status.
  if (opts.blocked) where.blockedReason = { not: null };
  if (opts.clientId) {
    // Intersect the requested client with the scope — a restricted user asking
    // for a client they aren't assigned to gets nothing.
    await assertClientInScope(user, opts.clientId);
    where.clientId = opts.clientId;
  }
  if (opts.status) where.status = opts.status;
  // Board / list show top-level tasks only; subtasks live in the detail drawer. The standup
  // opts into subtasks so a parent's updated subtasks each appear in the Slack update.
  if (!opts.includeSubtasks) where.parentId = null;
  // Cap DONE to those completed within the window — a long-lived board accretes
  // hundreds of done tasks, and shipping them all is a big payload to parse/render.
  // Non-DONE is never capped; DONE rows with no completedAt (legacy) are kept.
  if (opts.doneWithinDays && opts.doneWithinDays > 0) {
    const cutoff = new Date(Date.now() - opts.doneWithinDays * 86_400_000);
    const doneWindow: Prisma.TaskWhereInput = {
      OR: [
        { status: { not: "DONE" } },
        { AND: [{ status: "DONE" }, { OR: [{ completedAt: { gte: cutoff } }, { completedAt: null }] }] },
      ],
    };
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existingAnd, doneWindow];
  }
  if (opts.assigneeId) {
    const id = opts.assigneeId === "me" ? user.id : opts.assigneeId;
    where.OR = [{ assignees: { some: { id } } }, { assigneeId: id }];
  }
  if (opts.sourceMeetingId) {
    const linkedItems = await prisma.meetingActionItem.findMany({
      where: {
        meetingId: opts.sourceMeetingId,
        meeting: { workspaceId: user.workspaceId },
        taskId: { not: null },
      },
      select: { taskId: true },
    });
    const linkedTaskIds = linkedItems
      .map((item) => item.taskId)
      .filter((id): id is string => Boolean(id));
    const sourceFilters: Prisma.TaskWhereInput[] = [
      ...(linkedTaskIds.length > 0 ? [{ id: { in: linkedTaskIds } }] : []),
      { metadata: { path: ["sourceMeetingId"], equals: opts.sourceMeetingId } },
    ];
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existingAnd, { OR: sourceFilters }];
  }

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
    include: taskInclude,
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  const tasks = await attachScribeSources(user.workspaceId, rows.map(taskRowToDTO));
  return tasks.map(taskListDTO);
}

export async function getTask(user: EffectiveUser, id: string): Promise<TaskDetailDTO> {
  const row = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: taskInclude,
  });
  if (!row) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, row.clientId);

  const [comments, subtaskRows, attachmentRows] = await Promise.all([
    prisma.taskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
      include: { author: userSelect },
    }),
    prisma.task.findMany({
      where: { parentId: id },
      orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
      include: taskInclude,
    }),
    prisma.taskAttachment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        taskId: true,
        mime: true,
        filename: true,
        createdAt: true,
        uploadedBy: userSelect,
      },
    }),
  ]);
  const subtasks = subtaskRows.map(taskRowToDTO);
  const [dtoWithSource] = await attachScribeSources(user.workspaceId, [taskRowToDTO(row)]);
  const dto = dtoWithSource ?? taskRowToDTO(row);
  dto.subtaskCount = subtasks.length;
  dto.subtaskDoneCount = subtasks.filter((s) => s.status === "DONE").length;
  return {
    ...dto,
    comments: comments.map(commentRowToDTO),
    subtasks,
    attachments: attachmentRows.map(attachmentRowToDTO),
  };
}

/** Status counts for a single client — powers the compact card on client detail. */
export async function getClientTaskSummary(
  user: EffectiveUser,
  clientId: string,
): Promise<ClientTaskSummary> {
  await assertClientInScope(user, clientId);
  const grouped = await prisma.task.groupBy({
    by: ["status"],
    where: { workspaceId: user.workspaceId, clientId, parentId: null, archivedAt: null },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const g of grouped) counts[g.status as TaskStatus] = g._count._all;
  const total = TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return { clientId, counts, total, openTotal: total - counts.DONE };
}

/** Workspace-wide status counts, scoped to the caller's visible clients. Powers
 *  the HQ tasks widget with one cheap groupBy — no need to download every task. */
export async function getWorkspaceTaskCounts(user: EffectiveUser): Promise<TaskCounts> {
  await ensureBaseRecords();
  const where = await clientScopeWhere(user);
  where.parentId = null; // top-level only, matching the board
  where.archivedAt = null; // active tasks only
  const grouped = await prisma.task.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const g of grouped) counts[g.status as TaskStatus] = g._count._all;
  const total = TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return { counts, total, open: total - counts.DONE };
}

/**
 * Dashboard "needs attention" — scoped (overdue list capped at 8) + due-soon and
 * in-progress counts. One cheap pass; works for managers (whole scope), not just "me".
 */
export async function getTaskAttention(
  user: EffectiveUser,
  opts: { mine?: boolean } = {},
): Promise<TaskAttentionDTO> {
  await ensureBaseRecords();
  const scope = await clientScopeWhere(user);
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in7 = new Date(startToday);
  in7.setUTCDate(in7.getUTCDate() + 7);

  // Mirror listTasks's "assignee" filter: assignees join wins, legacy assigneeId
  // is the fallback for tasks that haven't been migrated to the many-to-many.
  const mineFilter: Prisma.TaskWhereInput | null = opts.mine
    ? { OR: [{ assignees: { some: { id: user.id } } }, { assigneeId: user.id }] }
    : null;

  const open: Prisma.TaskWhereInput = {
    ...scope,
    parentId: null,
    archivedAt: null,
    status: { not: "DONE" },
    ...(mineFilter ?? {}),
  };
  const doingWhere: Prisma.TaskWhereInput = {
    ...scope,
    parentId: null,
    archivedAt: null,
    status: { in: ["DOING", "IN_REVIEW", "UI_DONE"] },
    ...(mineFilter ?? {}),
  };
  const [overdueRows, overdueCount, dueSoonCount, doingRows, doingCount] = await Promise.all([
    prisma.task.findMany({
      where: { ...open, dueDate: { lt: startToday } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: taskInclude,
    }),
    prisma.task.count({ where: { ...open, dueDate: { lt: startToday } } }),
    prisma.task.count({ where: { ...open, dueDate: { gte: startToday, lt: in7 } } }),
    prisma.task.findMany({
      where: doingWhere,
      // Soonest-due first; tasks without a due date sink to the bottom.
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 8,
      include: taskInclude,
    }),
    prisma.task.count({ where: doingWhere }),
  ]);

  return {
    overdue: await attachScribeSources(user.workspaceId, overdueRows.map(taskRowToDTO)),
    overdueCount,
    doing: await attachScribeSources(user.workspaceId, doingRows.map(taskRowToDTO)),
    dueSoonCount,
    doingCount,
  };
}

// ─── Write ─────────────────────────────────────────────────────────────────

/** Ensure a feature block exists under the given client + workspace. */
async function assertBlockInClient(
  workspaceId: string,
  clientId: string,
  blockId: string,
): Promise<void> {
  const block = await prisma.featureBlock.findFirst({
    where: { id: blockId, workspaceId, clientId },
    select: { id: true },
  });
  if (!block) throw new ForbiddenError("Feature block not found for this client");
}

async function nextOrderKey(workspaceId: string, clientId: string, status: TaskStatus): Promise<number> {
  const top = await prisma.task.findFirst({
    where: { workspaceId, clientId, status },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  return (top?.orderKey ?? 0) + 1;
}

// ─── Notification helpers (in-app bell/Desk) ────────────────────────────────
const clientTasksUrl = (slug: string) => `/app/portal/${slug}/tasks`;
const assignedTitle = (n: number) =>
  n === 1 ? "You were assigned a task" : `You were assigned ${n} tasks`;

export async function createTask(
  user: EffectiveUser,
  input: {
    clientId: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    label?: TaskLabel | null;
    assigneeIds?: string[];
    featureBlockId?: string | null;
    parentId?: string | null;
    dueDate?: string | null;
    metadata?: Record<string, unknown> | null;
    clickupId?: string | null;
  },
): Promise<TaskDTO> {
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);
  if (input.featureBlockId) {
    await assertBlockInClient(user.workspaceId, input.clientId, input.featureBlockId);
  }
  // A subtask with no explicit assignees inherits the parent's current assignees
  // (falling back to the legacy single-assignee column) so "assign the parent,
  // subtasks follow" holds at creation time without extra clicks.
  let parentAssigneeIds: string[] = [];
  if (input.parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: input.parentId, workspaceId: user.workspaceId, clientId: input.clientId },
      select: { id: true, assigneeId: true, assignees: { select: { id: true } } },
    });
    if (!parent) throw new ForbiddenError("Parent task not found for this client");
    parentAssigneeIds =
      parent.assignees.length > 0
        ? parent.assignees.map((a) => a.id)
        : parent.assigneeId
          ? [parent.assigneeId]
          : [];
  }
  const effectiveAssigneeIds =
    input.assigneeIds && input.assigneeIds.length > 0 ? input.assigneeIds : parentAssigneeIds;
  const status = input.status ?? "BACKLOG";
  const ts = statusTimestamps(null, status, { startedAt: null });

  const row = await prisma.task.create({
    data: {
      workspaceId: user.workspaceId,
      clientId: input.clientId,
      createdById: user.id,
      featureBlockId: input.featureBlockId ?? null,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      status,
      priority: input.priority ?? "MEDIUM",
      label: input.label ?? null,
      orderKey: await nextOrderKey(user.workspaceId, input.clientId, status),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      startedAt: ts.startedAt ?? null,
      completedAt: ts.completedAt ?? null,
      clickupId: input.clickupId ?? null,
      ...(input.metadata !== undefined && input.metadata !== null
        ? { metadata: input.metadata as Prisma.InputJsonValue }
        : {}),
      ...(effectiveAssigneeIds.length > 0
        ? { assignees: { connect: effectiveAssigneeIds.map((id) => ({ id })) } }
        : {}),
    },
    include: taskInclude,
  });
  // Notify anyone assigned at creation (excluding the creator).
  const createdAssignees = effectiveAssigneeIds.filter((aid) => aid !== user.id);
  if (createdAssignees.length > 0) {
    dispatchNotification({
      event: "tasks.assigned",
      workspaceId: user.workspaceId,
      actorId: user.id,
      target: { kind: "users", userIds: createdAssignees },
      clientId: input.clientId,
      title: assignedTitle(1),
      titleForCount: assignedTitle,
      body: row.title,
      actionUrl: clientTasksUrl(row.client.slug),
      groupKey: "tasks.assigned",
      metadata: { taskIds: [row.id] },
    });
  }

  const [task] = await attachScribeSources(user.workspaceId, [taskRowToDTO(row)]);
  return task;
}

/**
 * Bulk-create tasks from a CSV import. The client resolves names → ids (assignees,
 * category/feature-block) against the loaded lists before sending; here we
 * re-validate those ids belong to this client/workspace (dropping any that don't),
 * skip rows without a title, and assign a distinct orderKey per status.
 */
export async function importTasks(
  user: EffectiveUser,
  clientId: string,
  rows: Array<{
    title: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeIds?: string[];
    featureBlockId?: string | null;
    dueDate?: string | null;
  }>,
): Promise<{ created: number; skipped: number }> {
  await ensureBaseRecords();
  await assertClientInScope(user, clientId);

  // Validate referenced blocks + assignees once (drop anything out of scope).
  const blockIds = [...new Set(rows.map((r) => r.featureBlockId).filter((x): x is string => !!x))];
  const validBlocks = new Set(
    blockIds.length
      ? (
          await prisma.featureBlock.findMany({
            where: { id: { in: blockIds }, workspaceId: user.workspaceId, clientId },
            select: { id: true },
          })
        ).map((b) => b.id)
      : [],
  );
  const assigneeIds = [...new Set(rows.flatMap((r) => r.assigneeIds ?? []))];
  const validAssignees = new Set(
    assigneeIds.length
      ? (
          await prisma.workspaceMember.findMany({
            where: { workspaceId: user.workspaceId, userId: { in: assigneeIds } },
            select: { userId: true },
          })
        ).map((m) => m.userId)
      : [],
  );

  // One starting orderKey per status, then increment locally (avoids a query per row).
  const seq: Partial<Record<TaskStatus, number>> = {};
  let created = 0;
  for (const r of rows) {
    const title = r.title?.trim();
    if (!title) continue;
    const status = r.status ?? "BACKLOG";
    if (seq[status] === undefined) seq[status] = await nextOrderKey(user.workspaceId, clientId, status);
    const orderKey = seq[status]!;
    seq[status] = orderKey + 1;
    const ts = statusTimestamps(null, status, { startedAt: null });
    const fbId = r.featureBlockId && validBlocks.has(r.featureBlockId) ? r.featureBlockId : null;
    const aIds = (r.assigneeIds ?? []).filter((id) => validAssignees.has(id));
    await prisma.task.create({
      data: {
        workspaceId: user.workspaceId,
        clientId,
        createdById: user.id,
        featureBlockId: fbId,
        title: title.slice(0, 200),
        description: r.description ? r.description.slice(0, 10000) : null,
        status,
        priority: r.priority ?? "MEDIUM",
        orderKey,
        dueDate: r.dueDate ? new Date(r.dueDate) : null,
        startedAt: ts.startedAt ?? null,
        completedAt: ts.completedAt ?? null,
        ...(aIds.length ? { assignees: { connect: aIds.map((id) => ({ id })) } } : {}),
      },
    });
    created++;
  }
  return { created, skipped: rows.length - created };
}

export async function updateTask(
  user: EffectiveUser,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    acceptanceCriteria?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    label?: TaskLabel | null;
    assigneeIds?: string[];
    featureBlockId?: string | null;
    dueDate?: string | null;
    metadata?: Record<string, unknown> | null;
    archived?: boolean;
    /** Set/clear the blocked flag. Empty/null clears the block (and its client response). */
    blockedReason?: string | null;
  },
): Promise<TaskDTO> {
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: {
      clientId: true,
      status: true,
      startedAt: true,
      assigneeId: true,
      assignees: { select: { id: true } },
    },
  });
  if (!existing) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, existing.clientId);

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.acceptanceCriteria !== undefined) data.acceptanceCriteria = input.acceptanceCriteria;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.label !== undefined) data.label = input.label;
  if (input.metadata !== undefined && input.metadata !== null) {
    data.metadata = input.metadata as Prisma.InputJsonValue;
  }
  if (input.assigneeIds !== undefined) {
    // `set` replaces the full assignee list. Also clear the legacy single column
    // so it can't shadow an intentional "no assignees".
    data.assignees = { set: input.assigneeIds.map((id) => ({ id })) };
    data.assignee = { disconnect: true };
  }
  if (input.featureBlockId !== undefined) {
    if (input.featureBlockId) {
      await assertBlockInClient(user.workspaceId, existing.clientId, input.featureBlockId);
      data.featureBlock = { connect: { id: input.featureBlockId } };
    } else {
      data.featureBlock = { disconnect: true };
    }
  }
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.blockedReason !== undefined) {
    const reason = input.blockedReason?.trim() || null;
    data.blockedReason = reason;
    // Stamp blockedAt when newly blocking; clearing the block wipes the timestamp AND the
    // client's response (fresh slate — no stale reply lingering on an unblocked task).
    if (reason) {
      data.blockedAt = new Date();
    } else {
      data.blockedAt = null;
      data.blockedResponse = null;
      data.blockedResponseAt = null;
    }
  }
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;
    Object.assign(data, statusTimestamps(existing.status as TaskStatus, input.status, existing));
  }

  const row = await prisma.task.update({ where: { id }, data, include: taskInclude });

  // Reassigning the parent task also reassigns its direct subtasks — "the main
  // task is assigned to a user, all of its subtasks should be assigned too".
  if (input.assigneeIds !== undefined) {
    const subtasks = await prisma.task.findMany({ where: { parentId: id }, select: { id: true } });
    if (subtasks.length > 0) {
      await Promise.all(
        subtasks.map((s) =>
          prisma.task.update({
            where: { id: s.id },
            data: {
              assignees: { set: input.assigneeIds!.map((aid) => ({ id: aid })) },
              assignee: { disconnect: true },
            },
          }),
        ),
      );
    }
  }

  // Notify newly-added assignees (excluding the actor and anyone already assigned).
  if (input.assigneeIds !== undefined) {
    const prior = new Set(
      existing.assignees.length > 0
        ? existing.assignees.map((a) => a.id)
        : existing.assigneeId
          ? [existing.assigneeId]
          : [],
    );
    const added = input.assigneeIds.filter((aid) => !prior.has(aid) && aid !== user.id);
    if (added.length > 0) {
      dispatchNotification({
        event: "tasks.assigned",
        workspaceId: user.workspaceId,
        actorId: user.id,
        target: { kind: "users", userIds: added },
        clientId: existing.clientId,
        title: assignedTitle(1),
        titleForCount: assignedTitle,
        body: row.title,
        actionUrl: clientTasksUrl(row.client.slug),
        groupKey: "tasks.assigned",
        metadata: { taskIds: [row.id] },
      });
    }
  }

  // Notify the task's assignees when its status changes (excluding the actor).
  if (input.status !== undefined && input.status !== existing.status) {
    const recipients = row.assignees.map((a) => a.id).filter((aid) => aid !== user.id);
    if (recipients.length > 0) {
      dispatchNotification({
        event: "tasks.status_changed",
        workspaceId: user.workspaceId,
        actorId: user.id,
        target: { kind: "users", userIds: recipients },
        clientId: row.clientId,
        title: `"${row.title}" → ${TASK_STATUS_LABELS[input.status]}`,
        actionUrl: clientTasksUrl(row.client.slug),
        groupKey: `tasks.status_changed:${row.id}`,
        metadata: { taskId: row.id, status: input.status },
      });
    }
  }

  const [task] = await attachScribeSources(user.workspaceId, [taskRowToDTO(row)]);
  return task;
}

/** Drag move: set status + fractional order key, stamping timestamps. */
export async function moveTask(
  user: EffectiveUser,
  id: string,
  input: { status: TaskStatus; orderKey: number },
): Promise<TaskDTO> {
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true, status: true, startedAt: true },
  });
  if (!existing) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, existing.clientId);

  const row = await prisma.task.update({
    where: { id },
    data: {
      status: input.status,
      orderKey: input.orderKey,
      ...statusTimestamps(existing.status as TaskStatus, input.status, existing),
    },
    include: taskInclude,
  });

  if (input.status !== existing.status) {
    const recipients = row.assignees.map((a) => a.id).filter((aid) => aid !== user.id);
    if (recipients.length > 0) {
      dispatchNotification({
        event: "tasks.status_changed",
        workspaceId: user.workspaceId,
        actorId: user.id,
        target: { kind: "users", userIds: recipients },
        clientId: row.clientId,
        title: `"${row.title}" → ${TASK_STATUS_LABELS[input.status]}`,
        actionUrl: clientTasksUrl(row.client.slug),
        groupKey: `tasks.status_changed:${row.id}`,
        metadata: { taskId: row.id, status: input.status },
      });
    }
  }

  return taskRowToDTO(row);
}

export async function deleteTask(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, existing.clientId);
  await prisma.task.delete({ where: { id } });
}

// ─── Batch (select-all + bulk edit/delete) ───────────────────────────────────

export interface TaskBatchPatch {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  dueDate?: string | null;
  archived?: boolean;
}

/** Load the requested tasks that exist in this workspace; throw if any is out of scope. */
async function loadTasksInScope(
  user: EffectiveUser,
  ids: string[],
): Promise<{ id: string; clientId: string; status: string; startedAt: Date | null }[]> {
  const rows = await prisma.task.findMany({
    where: { id: { in: ids }, workspaceId: user.workspaceId },
    select: { id: true, clientId: true, status: true, startedAt: true },
  });
  if (!canSeeAllClients(user)) {
    const allowed = new Set(await assignedClientIds(user));
    for (const r of rows) {
      if (!allowed.has(r.clientId)) throw new ForbiddenError("A selected task is outside your clients");
    }
  }
  return rows;
}

/** Apply one patch to many tasks. Loops (relation `set` + per-row status stamps can't updateMany). */
export async function batchUpdateTasks(
  user: EffectiveUser,
  ids: string[],
  patch: TaskBatchPatch,
): Promise<{ updated: number }> {
  if (!ids.length) return { updated: 0 };
  const rows = await loadTasksInScope(user, ids);
  if (!rows.length) return { updated: 0 };

  // A feature block belongs to ONE client — only valid when every selected task shares it.
  if (patch.featureBlockId) {
    const clientsInSelection = new Set(rows.map((r) => r.clientId));
    if (clientsInSelection.size > 1) {
      throw new ForbiddenError("Selected tasks span multiple clients — can't move them into one block");
    }
    await assertBlockInClient(user.workspaceId, rows[0].clientId, patch.featureBlockId);
  }

  let updated = 0;
  for (const r of rows) {
    const data: Prisma.TaskUpdateInput = {};
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
    if (patch.archived !== undefined) data.archivedAt = patch.archived ? new Date() : null;
    if (patch.assigneeIds !== undefined) {
      data.assignees = { set: patch.assigneeIds.map((id) => ({ id })) };
      data.assignee = { disconnect: true };
    }
    if (patch.featureBlockId !== undefined) {
      data.featureBlock = patch.featureBlockId
        ? { connect: { id: patch.featureBlockId } }
        : { disconnect: true };
    }
    if (patch.status !== undefined && patch.status !== r.status) {
      data.status = patch.status;
      Object.assign(data, statusTimestamps(r.status as TaskStatus, patch.status, r));
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.task.update({ where: { id: r.id }, data });
    updated++;
  }
  return { updated };
}

export async function batchDeleteTasks(user: EffectiveUser, ids: string[]): Promise<{ deleted: number }> {
  if (!ids.length) return { deleted: 0 };
  const rows = await loadTasksInScope(user, ids);
  if (!rows.length) return { deleted: 0 };
  const res = await prisma.task.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return { deleted: res.count };
}

/**
 * Auto-archive tasks that have been DONE for longer than `olderThanDays` (default 30) and aren't
 * already archived. Keeps the active board self-cleaning. Workspace-wide (the cron runs system-side);
 * never deletes. Returns the count archived.
 */
export async function autoArchiveDoneTasks(olderThanDays = 30): Promise<{ archived: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const res = await prisma.task.updateMany({
    where: {
      status: "DONE",
      archivedAt: null,
      // Completed >N days ago — OR, for imported/legacy done tasks that never got
      // a completedAt (bulk-imported as DONE), untouched for >N days. Without the
      // second clause those dateless done tasks never archive and pile up on the
      // board forever (exactly what happened after the ClickUp import).
      OR: [
        { completedAt: { not: null, lt: cutoff } },
        { completedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    data: { archivedAt: new Date() },
  });
  return { archived: res.count };
}

/**
 * Client responds to a blocker from the public wiki. Records the reply on the task and pings
 * the assignees (in-app). No-op if the task isn't (or is no longer) blocked. Caller (the public
 * wiki route) has already verified the task belongs to the token's wiki + the access cookie.
 */
export async function respondToWikiBlocker(taskId: string, response: string | null): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      clientId: true,
      blockedReason: true,
      assigneeId: true,
      assignees: { select: { id: true } },
      client: { select: { slug: true } },
    },
  });
  if (!task || !task.blockedReason) return; // unblocked or gone — nothing to record
  await prisma.task.update({
    where: { id: taskId },
    data: { blockedResponse: response?.trim() || null, blockedResponseAt: new Date() },
  });
  const assigneeIds =
    task.assignees.length > 0
      ? task.assignees.map((a) => a.id)
      : task.assigneeId
        ? [task.assigneeId]
        : [];
  if (assigneeIds.length > 0) {
    dispatchNotification({
      event: "tasks.blocker_response",
      workspaceId: task.workspaceId,
      target: { kind: "users", userIds: assigneeIds },
      clientId: task.clientId,
      title: "Client responded to a blocker",
      body: task.title,
      actionUrl: clientTasksUrl(task.client.slug),
      groupKey: "tasks.blocker_response",
      metadata: { taskIds: [task.id] },
    });
  }
}

/**
 * Bulk-create tasks for one client from a single source (Pulse scan, etc.).
 * Title-deduped against existing tasks that share the same `metadata.source` so
 * re-pushing a scan's action plan never double-creates. Returns created + skipped counts.
 */
export async function batchCreateTasks(
  user: EffectiveUser,
  clientId: string,
  tasks: Array<{
    title: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    metadata?: Record<string, unknown> | null;
  }>,
): Promise<{ created: number; skipped: number; tasks: TaskDTO[] }> {
  await ensureBaseRecords();
  await assertClientInScope(user, clientId);
  if (!tasks.length) return { created: 0, skipped: 0, tasks: [] };

  // The source key these tasks come from (all in one batch share it). Used for
  // dedup so re-pushing the same scan plan is idempotent.
  const source = (tasks[0]?.metadata?.["source"] as string | undefined) ?? null;

  // Existing task titles for this client from the same source — for idempotent re-push.
  const existing = await prisma.task.findMany({
    where: { workspaceId: user.workspaceId, clientId },
    select: { title: true, metadata: true },
  });
  const existingTitles = new Set(
    existing
      .filter((t) => !source || metadataString(t.metadata as Record<string, unknown> | null, "source") === source)
      .map((t) => t.title.trim().toLowerCase()),
  );

  const created: TaskDTO[] = [];
  let skipped = 0;
  for (const input of tasks) {
    const titleKey = input.title.trim().toLowerCase();
    if (existingTitles.has(titleKey)) {
      skipped++;
      continue;
    }
    existingTitles.add(titleKey);
    const status = input.status ?? "BACKLOG";
    const ts = statusTimestamps(null, status, { startedAt: null });
    const row = await prisma.task.create({
      data: {
        workspaceId: user.workspaceId,
        clientId,
        createdById: user.id,
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? "MEDIUM",
        orderKey: await nextOrderKey(user.workspaceId, clientId, status),
        startedAt: ts.startedAt ?? null,
        completedAt: ts.completedAt ?? null,
        ...(input.metadata != null ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
      include: taskInclude,
    });
    created.push(taskRowToDTO(row));
  }
  return { created: created.length, skipped, tasks: created };
}

/**
 * After a Pulse re-scan: any non-DONE task created from a failing check whose
 * check now PASSes is auto-closed. Matched by `metadata.pulseCheckKey` within the
 * client (scan-id-agnostic, so a later scan closes tasks from an earlier one).
 * System-level (no EffectiveUser) — runs in the background scan pipeline.
 */
export async function reconcilePulseTasksAfterScan(
  workspaceId: string,
  clientId: string,
  passingCheckKeys: string[],
): Promise<{ closed: number }> {
  if (!passingCheckKeys.length) return { closed: 0 };
  const passing = new Set(passingCheckKeys);
  const open = await prisma.task.findMany({
    where: { workspaceId, clientId, status: { not: "DONE" } },
    select: { id: true, metadata: true },
  });
  const toClose = open
    .filter((t) => {
      const meta = t.metadata as Record<string, unknown> | null;
      if (metadataString(meta, "source") !== "pulse_scan") return false;
      const key = metadataString(meta, "pulseCheckKey");
      return key != null && passing.has(key);
    })
    .map((t) => t.id);
  if (!toClose.length) return { closed: 0 };
  const res = await prisma.task.updateMany({
    where: { id: { in: toClose } },
    data: { status: "DONE", completedAt: new Date() },
  });
  return { closed: res.count };
}

// ─── Notes ─────────────────────────────────────────────────────────────────

export async function listTaskComments(user: EffectiveUser, taskId: string): Promise<TaskCommentDTO[]> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);
  // Bound the fetch: take the most recent 500 (desc) then restore chronological order. A
  // task realistically never reaches this, so it's a safety cap, not visible pagination.
  const rows = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
  return rows.reverse().map(commentRowToDTO);
}

export async function addTaskComment(
  user: EffectiveUser,
  taskId: string,
  body: string,
): Promise<TaskCommentDTO> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: {
      clientId: true,
      title: true,
      client: { select: { slug: true } },
      assigneeId: true,
      assignees: { select: { id: true } },
    },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);

  // Resolve @mentions to real workspace members before persisting/notifying — a bad or
  // stale id in the token is silently dropped rather than trusted.
  const rawIds = extractMentionIds(body);
  let mentionIds: string[] = [];
  if (rawIds.length > 0) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: user.workspaceId, userId: { in: rawIds } },
      select: { userId: true },
    });
    const valid = new Set(members.map((m) => m.userId));
    mentionIds = rawIds.filter((id) => valid.has(id));
  }

  const row = await prisma.taskComment.create({
    data: { taskId, authorId: user.id, body, mentions: mentionIds },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  // Being @mentioned lands the note on that person's Desk (+ bell). Fire-and-forget:
  // the dispatcher excludes the author and respects each recipient's preferences.
  if (mentionIds.length > 0) {
    const actor = user.name?.trim() ? user.name : user.email;
    const preview = stripMentionTokens(body).trim().slice(0, 140);
    dispatchNotification({
      event: "tasks.mentioned",
      workspaceId: user.workspaceId,
      actorId: user.id,
      target: { kind: "users", userIds: mentionIds },
      title: `${actor} mentioned you on “${task.title}”`,
      body: preview || null,
      actionUrl: `/app/portal/${task.client.slug}/tasks?task=${taskId}`,
      clientId: task.clientId,
      groupKey: `task-mention:${taskId}`,
      metadata: { taskId, commentId: row.id, actorId: user.id },
    });
  }

  // Notify the task's assignees of the new comment (excluding the author and
  // anyone already @mentioned — they got the mention notification above).
  const assigneeIds = task.assignees.length > 0
    ? task.assignees.map((a) => a.id)
    : task.assigneeId
      ? [task.assigneeId]
      : [];
  const commentRecipients = assigneeIds.filter(
    (aid) => aid !== user.id && !mentionIds.includes(aid),
  );
  if (commentRecipients.length > 0) {
    dispatchNotification({
      event: "tasks.commented",
      workspaceId: user.workspaceId,
      actorId: user.id,
      target: { kind: "users", userIds: commentRecipients },
      clientId: task.clientId,
      title: `New comment on "${task.title}"`,
      titleForCount: (n) =>
        n === 1 ? `New comment on "${task.title}"` : `${n} new comments on "${task.title}"`,
      body: body.slice(0, 140),
      actionUrl: `/app/portal/${task.client.slug}/tasks?task=${taskId}`,
      groupKey: `tasks.commented:${taskId}`,
      metadata: { taskId, commentId: row.id },
    });
  }

  return commentRowToDTO(row);
}

// ─── Attachments ───────────────────────────────────────────────────────────

const ATTACHMENT_THUMB_SIZE = 320;

/** Attach a screenshot/image to a task. Bytes arrive pre-compressed client-side;
 * a small thumbnail is generated here for the attachments grid. */
export async function addTaskAttachment(
  user: EffectiveUser,
  taskId: string,
  bytes: Buffer,
  mime: string,
  filename: string | null,
): Promise<TaskAttachmentDTO> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);

  const sharp = (await import("sharp")).default;
  let storedBytes = bytes;
  let storedMime = mime;
  // Transcode HEIC → JPEG (iOS screenshots/photos); browsers can't render HEIC.
  if (mime === "image/heic" || mime === "image/heif") {
    storedBytes = await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer();
    storedMime = "image/jpeg";
  }
  const thumb = await sharp(storedBytes)
    .rotate()
    .resize(ATTACHMENT_THUMB_SIZE, ATTACHMENT_THUMB_SIZE, { fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();

  const row = await prisma.taskAttachment.create({
    data: {
      taskId,
      uploadedById: user.id,
      image: storedBytes,
      thumb,
      mime: storedMime,
      filename,
    },
    select: {
      id: true,
      taskId: true,
      mime: true,
      filename: true,
      createdAt: true,
      uploadedBy: userSelect,
    },
  });
  return attachmentRowToDTO(row);
}

/** Serve attachment bytes — the full image, or its thumb when `variant === "thumb"`. */
export async function getTaskAttachmentBytes(
  user: EffectiveUser,
  taskId: string,
  attachmentId: string,
  variant: "full" | "thumb" = "full",
): Promise<{ bytes: Buffer; mime: string } | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);

  const row = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    select: { image: true, thumb: true, mime: true },
  });
  if (!row) return null;
  if (variant === "thumb") {
    return { bytes: Buffer.from(row.thumb ?? row.image), mime: "image/jpeg" };
  }
  return { bytes: Buffer.from(row.image), mime: row.mime };
}

export async function deleteTaskAttachment(
  user: EffectiveUser,
  taskId: string,
  attachmentId: string,
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);

  const existing = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    select: { id: true },
  });
  if (!existing) throw new ForbiddenError("Attachment not found");
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
}
