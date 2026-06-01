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
import type {
  TaskDTO,
  TaskDetailDTO,
  TaskCommentDTO,
  TaskStatus,
  TaskPriority,
  ClientTaskSummary,
} from "@/types/tasks";
import { TASK_STATUSES } from "@/types/tasks";

// ─── Row shapes + mappers ──────────────────────────────────────────────────

const taskInclude = {
  client: { select: { id: true, name: true, slug: true } },
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

type CommentRow = Prisma.TaskCommentGetPayload<{
  include: { author: { select: { id: true; name: true; email: true; avatarUrl: true } } };
}>;

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

function userRef(u: { id: string; name: string | null; email: string; avatarUrl: string | null } | null) {
  return u ? { id: u.id, name: displayName(u), avatarUrl: u.avatarUrl } : null;
}

function taskRowToDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    client: { id: row.client.id, name: row.client.name, slug: row.client.slug },
    assignee: userRef(row.assignee),
    createdBy: userRef(row.createdBy),
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    orderKey: row.orderKey,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    commentCount: row._count.comments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function commentRowToDTO(row: CommentRow): TaskCommentDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    author: userRef(row.author),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Scoping ───────────────────────────────────────────────────────────────

/** The client IDs a restricted user is assigned to (empty array = none). */
export async function assignedClientIds(user: EffectiveUser): Promise<string[]> {
  const rows = await prisma.clientAssignment.findMany({
    where: { workspaceId: user.workspaceId, userId: user.id },
    select: { clientId: true },
  });
  return rows.map((r) => r.clientId);
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
async function assertClientInScope(user: EffectiveUser, clientId: string): Promise<void> {
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
  const startedStates: TaskStatus[] = ["DOING", "IN_REVIEW", "DONE"];
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
  opts: { clientId?: string; status?: TaskStatus; assigneeId?: string } = {},
): Promise<TaskDTO[]> {
  await ensureBaseRecords();
  const where = await clientScopeWhere(user);
  if (opts.clientId) {
    // Intersect the requested client with the scope — a restricted user asking
    // for a client they aren't assigned to gets nothing.
    await assertClientInScope(user, opts.clientId);
    where.clientId = opts.clientId;
  }
  if (opts.status) where.status = opts.status;
  if (opts.assigneeId) where.assigneeId = opts.assigneeId === "me" ? user.id : opts.assigneeId;

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
    include: taskInclude,
  });
  return rows.map(taskRowToDTO);
}

export async function getTask(user: EffectiveUser, id: string): Promise<TaskDetailDTO> {
  const row = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: taskInclude,
  });
  if (!row) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, row.clientId);

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
  return { ...taskRowToDTO(row), comments: comments.map(commentRowToDTO) };
}

/** Status counts for a single client — powers the compact card on client detail. */
export async function getClientTaskSummary(
  user: EffectiveUser,
  clientId: string,
): Promise<ClientTaskSummary> {
  await assertClientInScope(user, clientId);
  const grouped = await prisma.task.groupBy({
    by: ["status"],
    where: { workspaceId: user.workspaceId, clientId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const g of grouped) counts[g.status as TaskStatus] = g._count._all;
  const total = TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return { clientId, counts, total, openTotal: total - counts.DONE };
}

// ─── Write ─────────────────────────────────────────────────────────────────

async function nextOrderKey(workspaceId: string, clientId: string, status: TaskStatus): Promise<number> {
  const top = await prisma.task.findFirst({
    where: { workspaceId, clientId, status },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  return (top?.orderKey ?? 0) + 1;
}

export async function createTask(
  user: EffectiveUser,
  input: {
    clientId: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<TaskDTO> {
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);
  const status = input.status ?? "BACKLOG";
  const ts = statusTimestamps(null, status, { startedAt: null });

  const row = await prisma.task.create({
    data: {
      workspaceId: user.workspaceId,
      clientId: input.clientId,
      createdById: user.id,
      assigneeId: input.assigneeId ?? null,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? "MEDIUM",
      orderKey: await nextOrderKey(user.workspaceId, input.clientId, status),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      startedAt: ts.startedAt ?? null,
      completedAt: ts.completedAt ?? null,
    },
    include: taskInclude,
  });
  return taskRowToDTO(row);
}

export async function updateTask(
  user: EffectiveUser,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<TaskDTO> {
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true, status: true, startedAt: true },
  });
  if (!existing) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, existing.clientId);

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assigneeId !== undefined) {
    data.assignee = input.assigneeId
      ? { connect: { id: input.assigneeId } }
      : { disconnect: true };
  }
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;
    Object.assign(data, statusTimestamps(existing.status as TaskStatus, input.status, existing));
  }

  const row = await prisma.task.update({ where: { id }, data, include: taskInclude });
  return taskRowToDTO(row);
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

// ─── Notes ─────────────────────────────────────────────────────────────────

export async function listTaskComments(user: EffectiveUser, taskId: string): Promise<TaskCommentDTO[]> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);
  const rows = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
  return rows.map(commentRowToDTO);
}

export async function addTaskComment(
  user: EffectiveUser,
  taskId: string,
  body: string,
): Promise<TaskCommentDTO> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new ForbiddenError("Task not found");
  await assertClientInScope(user, task.clientId);
  const row = await prisma.taskComment.create({
    data: { taskId, authorId: user.id, body },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
  return commentRowToDTO(row);
}
