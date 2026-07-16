import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listTasks, createTask } from "@/server/tasks";
import { taskInputSchema, taskListQuerySchema } from "@/server/validators";
import type { TaskDTO, TaskStatus } from "@/types/tasks";

export const dynamic = "force-dynamic";
const MAX_TASK_LIST_ROWS = 500;

/** Keep the public list contract small even if TaskDTO gains new fields. */
function taskListResponse(task: TaskDTO): TaskDTO {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    client: task.client,
    assignees: task.assignees,
    createdBy: task.createdBy,
    featureBlock: task.featureBlock,
    parentId: task.parentId,
    title: task.title,
    description: null,
    acceptanceCriteria: null,
    status: task.status,
    priority: task.priority,
    label: task.label,
    orderKey: task.orderKey,
    dueDate: task.dueDate,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    blockedReason: null,
    blockedAt: null,
    blockedResponse: null,
    blockedResponseAt: null,
    commentCount: task.commentCount,
    subtaskCount: task.subtaskCount,
    subtaskDoneCount: task.subtaskDoneCount,
    attachmentCount: task.attachmentCount,
    metadata: null,
    scribeSource: task.scribeSource,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const q = taskListQuerySchema.parse({
      clientId: url.searchParams.get("clientId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      assigneeId: url.searchParams.get("assigneeId") ?? undefined,
      sourceMeetingId: url.searchParams.get("sourceMeetingId") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      doneWithinDays: url.searchParams.get("doneWithinDays") ?? undefined,
    });
    // Default the active board/list to the last 90 days of DONE (older ones load
    // on demand via doneWithinDays=all). The Archived tab and status-filtered /
    // meeting-sourced fetches are never capped — they're already bounded.
    const doneWithinDays =
      q.archived === "true" || q.status || q.sourceMeetingId
        ? undefined
        : q.doneWithinDays === "all"
          ? undefined
          : (q.doneWithinDays ?? 90);
    const tasks = await listTasks(user, {
      clientId: q.clientId,
      status: q.status as TaskStatus | undefined,
      assigneeId: q.assigneeId,
      sourceMeetingId: q.sourceMeetingId,
      archived: q.archived === "true",
      // Prevent an unbounded board request from becoming another multi-MB
      // response when a workspace has a large backlog.
      limit: Math.min(q.limit ?? MAX_TASK_LIST_ROWS, MAX_TASK_LIST_ROWS),
      doneWithinDays,
    });
    return apiOk(tasks.map(taskListResponse));
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = taskInputSchema.parse(await req.json());
    const created = await createTask(user, body);
    return apiOk(created, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
