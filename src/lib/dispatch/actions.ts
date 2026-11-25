/**
 * What Dispatch may change, decided in one place (pure, tested). Dispatch only PROPOSES; the
 * asker confirms with a click, and these rules are checked again at that moment.
 *
 * Dan's rules (Nov 2026): never post where the client can see, never delete anything, never
 * act on another client, never change other people's work. New tasks may be created for the
 * asker or unassigned only; Dispatch suggests an owner in words, it doesn't set one.
 */

export const DISPATCH_ACTION_KINDS = [
  "create_tasks",
  "create_subtasks",
  "update_task",
  "comment",
  "flag",
  "slack_post",
] as const;
export type DispatchActionKind = (typeof DISPATCH_ACTION_KINDS)[number];

export function isDispatchActionKind(value: string): value is DispatchActionKind {
  return (DISPATCH_ACTION_KINDS as readonly string[]).includes(value);
}

/** The facts about a task these rules need. */
export interface TaskFacts {
  clientId: string;
  assigneeIds: readonly string[];
}

/** May this person change this task's work? Their own, or nobody's, and only on this client. */
export function mayChangeTask(task: TaskFacts, userId: string, clientId: string): string | null {
  if (task.clientId !== clientId) return "That task isn't on this client.";
  if (task.assigneeIds.length > 0 && !task.assigneeIds.includes(userId)) {
    return "That task belongs to someone else, so I can't change it. I can add a comment instead.";
  }
  return null;
}

/** Annotating (a comment, a flag) changes nobody's work: any task on this client will do. */
export function mayAnnotateTask(task: Pick<TaskFacts, "clientId">, clientId: string): string | null {
  return task.clientId === clientId ? null : "That task isn't on this client.";
}

/** A new task may be the asker's or nobody's. Never someone else's. */
export function assigneesForNewTask(assignToMe: boolean, userId: string): string[] {
  return assignToMe ? [userId] : [];
}

/** The fields an update may touch. Assignees are deliberately absent (no reassigning), except
 *  taking an unassigned task for yourself. */
export const UPDATABLE_TASK_FIELDS = ["status", "dueDate", "title", "description", "acceptanceCriteria"] as const;
