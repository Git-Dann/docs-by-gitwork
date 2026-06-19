import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listTasks, createTask } from "@/server/tasks";
import { taskInputSchema, taskListQuerySchema } from "@/server/validators";
import type { TaskStatus } from "@/types/tasks";

export const dynamic = "force-dynamic";

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
    });
    const tasks = await listTasks(user, {
      clientId: q.clientId,
      status: q.status as TaskStatus | undefined,
      assigneeId: q.assigneeId,
      sourceMeetingId: q.sourceMeetingId,
      archived: q.archived === "true",
    });
    return apiOk(tasks);
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
