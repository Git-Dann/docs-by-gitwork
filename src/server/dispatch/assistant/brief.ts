/**
 * Gathers what the Dispatch brief needs (src/lib/dispatch/brief.ts) for one person and client,
 * through the same scope as Dispatch's tools: only the person's clients, only what they can see.
 * No AI: opening the panel costs nothing.
 */

import { buildBrief, type Brief, type BriefTask } from "@/lib/dispatch/brief";
import type { EffectiveUser } from "@/server/auth/effective-user";
import type { TaskDTO } from "@/types/tasks";
import { openScope } from "./scope";

export interface DispatchBrief extends Brief {
  client: { slug: string; name: string };
}

function toBriefTask(t: TaskDTO, userId: string): BriefTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
    startedAt: t.startedAt,
    createdAt: t.createdAt,
    assignees: t.assignees.map((a) => a.name),
    mine: t.assignees.some((a) => a.id === userId),
    flagged: Boolean(t.flag),
    blocked: Boolean(t.blockedReason),
    subtaskCount: t.subtaskCount,
    subtaskDoneCount: t.subtaskDoneCount,
    release: t.release ? (t.release.displayVersion ?? t.release.version) : null,
  };
}

export async function getDispatchBrief(
  user: EffectiveUser,
  opts: { clientSlug: string; taskId?: string | null },
  now: Date = new Date(),
): Promise<DispatchBrief> {
  const scope = await openScope(user, { slug: opts.clientSlug }, "web");
  const { listTasks, getTask } = await import("@/server/tasks");
  const { listReleases } = await import("@/server/releases");
  const [open, done, releases] = await Promise.all([
    listTasks(user, { clientId: scope.client.id, openOnly: true, limit: 500 }),
    listTasks(user, { clientId: scope.client.id, status: "DONE", doneWithinDays: 7, limit: 200 }),
    listReleases(user, scope.client.id),
  ]);

  let focus: BriefTask | null = null;
  if (opts.taskId) {
    const found = [...open, ...done].find((t) => t.id === opts.taskId);
    // A task not in those lists (a subtask, or done a while ago): fetched on its own, and only
    // used when it's on this client (getTask checks the person can see it at all).
    const task = found ?? (await getTask(user, opts.taskId).catch(() => null));
    if (task && task.client.id === scope.client.id) focus = toBriefTask(task, user.id);
  }

  const brief = buildBrief({
    now,
    clientName: scope.client.name,
    isAdmin: scope.isAdmin,
    open: open.map((t) => toBriefTask(t, user.id)),
    doneThisWeek: done.map((t) => toBriefTask(t, user.id)),
    releases: releases.map((r) => ({
      version: r.displayVersion || r.version,
      startDate: r.startDate,
      endDate: r.endDate,
      done: r.doneCount,
      total: r.taskCount,
    })),
    focus,
  });
  return { ...brief, client: { slug: scope.client.slug, name: scope.client.name } };
}
