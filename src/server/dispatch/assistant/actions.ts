/**
 * Carrying out what Dispatch proposed, when the asker confirms it.
 *
 * Everything is checked again here, against the database as it is NOW: the person's access to
 * the client, who owns the task, that the Slack channel is still internal. A proposal made an
 * hour ago is not a licence: if the task has since been taken by someone else, it is refused.
 * Only the person the proposal was made for can confirm it.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mayAnnotateTask, mayChangeTask, isDispatchActionKind } from "@/lib/dispatch/actions";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { openScope } from "./scope";

export type ActionDecision = "confirm" | "cancel";

export interface ActionResult {
  status: "done" | "cancelled" | "failed";
  message: string;
  /** Tasks created or changed, for links in the panel. */
  taskIds?: string[];
}

interface NewTask {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  assigneeIds?: string[];
  dueDate?: string;
  status?: string;
}

export class ActionNotFoundError extends Error {
  readonly status = 404;
}

export async function decideAction(
  user: EffectiveUser,
  actionId: string,
  decision: ActionDecision,
): Promise<ActionResult> {
  // Claim it: only a pending action of THIS person moves, and only once.
  const action = await prisma.dispatchAction.findFirst({
    where: { id: actionId, userId: user.id, workspaceId: user.workspaceId },
  });
  if (!action) throw new ActionNotFoundError("That proposal isn't yours, or doesn't exist.");
  if (action.status !== "pending") {
    return { status: action.status === "done" ? "done" : action.status === "failed" ? "failed" : "cancelled", message: "Already decided." };
  }
  const claimed = await prisma.dispatchAction.updateMany({
    where: { id: action.id, status: "pending" },
    data: { status: decision === "cancel" ? "cancelled" : "running" },
  });
  if (claimed.count === 0) return { status: "cancelled", message: "Already decided." };
  if (decision === "cancel") return { status: "cancelled", message: "Cancelled. Nothing was changed." };

  let result: ActionResult;
  try {
    result = await execute(user, action.clientId, action.kind, action.payload as Record<string, unknown>);
  } catch (err) {
    result = { status: "failed", message: err instanceof Error ? err.message : "That didn't work." };
  }
  await prisma.dispatchAction.update({
    where: { id: action.id },
    data: { status: result.status, result: result as unknown as Prisma.InputJsonValue, executedAt: new Date() },
  });
  return result;
}

async function execute(
  user: EffectiveUser,
  clientId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  if (!isDispatchActionKind(kind)) return { status: "failed", message: "Unknown kind of change." };
  // Fresh scope: refuses if the person has lost access to the client since it was proposed.
  const scope = await openScope(user, { id: clientId }, "web");
  const tasks = await import("@/server/tasks");

  const facts = async (taskId: string) => {
    const row = await prisma.task.findFirst({
      where: { id: taskId, workspaceId: user.workspaceId },
      select: { clientId: true, assigneeId: true, assignees: { select: { id: true } } },
    });
    if (!row) return null;
    return {
      clientId: row.clientId,
      assigneeIds: row.assignees.length ? row.assignees.map((a) => a.id) : row.assigneeId ? [row.assigneeId] : [],
    };
  };
  /** A new task may be the asker's or nobody's, whatever the stored payload says. */
  const safeAssignees = (ids: unknown) =>
    Array.isArray(ids) && ids.length === 1 && ids[0] === user.id ? [user.id] : [];
  const newTaskInput = (t: NewTask, parentId?: string) => ({
    clientId: scope.client.id,
    title: String(t.title).slice(0, 200),
    description: t.description?.slice(0, 5000),
    acceptanceCriteria: t.acceptanceCriteria?.slice(0, 5000) ?? null,
    status: (t.status as Parameters<typeof tasks.createTask>[1]["status"]) ?? "TODO",
    assigneeIds: safeAssignees(t.assigneeIds),
    dueDate: t.dueDate ?? null,
    parentId: parentId ?? null,
    metadata: { createdByDispatch: true },
  });

  switch (kind) {
    case "create_tasks": {
      const list = (payload.tasks as NewTask[] | undefined) ?? [];
      const ids: string[] = [];
      for (const t of list) ids.push((await tasks.createTask(user, newTaskInput(t))).id);
      return { status: "done", message: `Created ${ids.length} task${ids.length === 1 ? "" : "s"}.`, taskIds: ids };
    }
    case "create_subtasks": {
      const parentId = String(payload.parentId ?? "");
      const f = await facts(parentId);
      const refusal = f ? mayChangeTask(f, user.id, scope.client.id) : "That task no longer exists.";
      if (refusal) return { status: "failed", message: refusal };
      const ids: string[] = [];
      for (const t of (payload.tasks as NewTask[] | undefined) ?? []) ids.push((await tasks.createTask(user, newTaskInput(t, parentId))).id);
      return { status: "done", message: `Added ${ids.length} subtask${ids.length === 1 ? "" : "s"}.`, taskIds: [parentId, ...ids] };
    }
    case "update_task": {
      const taskId = String(payload.taskId ?? "");
      const f = await facts(taskId);
      const refusal = f ? mayChangeTask(f, user.id, scope.client.id) : "That task no longer exists.";
      if (refusal) return { status: "failed", message: refusal };
      const patch: Parameters<typeof tasks.updateTask>[2] = {};
      if (typeof payload.status === "string") patch.status = payload.status as typeof patch.status;
      if (typeof payload.dueDate === "string") patch.dueDate = payload.dueDate;
      if (typeof payload.title === "string") patch.title = payload.title.slice(0, 200);
      if (typeof payload.description === "string") patch.description = payload.description.slice(0, 5000);
      if (typeof payload.acceptanceCriteria === "string") patch.acceptanceCriteria = payload.acceptanceCriteria.slice(0, 5000);
      // Taking a task: only one nobody owns, and only for yourself.
      if (payload.takeIt === true && f!.assigneeIds.length === 0) patch.assigneeIds = [user.id];
      await tasks.updateTask(user, taskId, patch);
      return { status: "done", message: "Task updated.", taskIds: [taskId] };
    }
    case "comment": {
      const taskId = String(payload.taskId ?? "");
      const f = await facts(taskId);
      const refusal = f ? mayAnnotateTask(f, scope.client.id) : "That task no longer exists.";
      if (refusal) return { status: "failed", message: refusal };
      await tasks.addTaskComment(user, taskId, String(payload.body ?? "").slice(0, 4000));
      return { status: "done", message: "Comment added.", taskIds: [taskId] };
    }
    case "flag": {
      const taskId = String(payload.taskId ?? "");
      const f = await facts(taskId);
      const refusal = f ? mayAnnotateTask(f, scope.client.id) : "That task no longer exists.";
      if (refusal) return { status: "failed", message: refusal };
      await tasks.updateTask(user, taskId, {
        flag: payload.flagged === true ? { note: typeof payload.note === "string" ? payload.note : null } : null,
      });
      return { status: "done", message: payload.flagged === true ? "Flagged." : "Flag cleared.", taskIds: [taskId] };
    }
    case "slack_post":
      return postToInternalChannel(user, scope.client.id, String(payload.text ?? ""));
  }
}

/**
 * Post to the client's INTERNAL channel only. The channel is read from the client now (not the
 * stored payload) and must not be shared outside Gitwork; any failure to check that refuses.
 */
async function postToInternalChannel(user: EffectiveUser, clientId: string, text: string): Promise<ActionResult> {
  const [ws, client] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: user.workspaceId }, select: { slackBotToken: true, slackBotTokenEncrypted: true } }),
    prisma.workspaceClient.findFirst({
      where: { id: clientId, workspaceId: user.workspaceId },
      select: { slackInternalChannelId: true, slackChannelId: true, slackExternalChannelId: true },
    }),
  ]);
  const { getSlackBotToken, conversationsInfo, postMessage } = await import("@/server/slack/client");
  const token = getSlackBotToken(ws);
  const channel = client?.slackInternalChannelId ?? client?.slackChannelId;
  if (!token || !channel) return { status: "failed", message: "Slack or this client's internal channel isn't set up." };
  if (channel === client?.slackExternalChannelId) return { status: "failed", message: "That channel is shared with the client, so I won't post there." };
  const info = await conversationsInfo(token, channel).catch(() => null);
  if (!info?.ok || info.data.channel?.is_ext_shared !== false) {
    return { status: "failed", message: "I couldn't confirm that channel is internal, so I didn't post." };
  }
  const posted = await postMessage(token, { channel, text: `${text.slice(0, 3000)}\n_via Dispatch for ${user.name ?? "a teammate"}_` });
  return posted.ok ? { status: "done", message: "Posted in the team channel." } : { status: "failed", message: "Slack didn't accept the post." };
}
