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
      limit: q.limit,
      doneWithinDays,
    });
    // The board / list / Gantt never render description or acceptance criteria —
    // the detail drawer fetches the full task (GET /api/tasks/[id]) on open. Drop
    // these @db.Text fields from the LIST response: ClickUp-imported tasks can
    // carry very large descriptions (sometimes with embedded/base64 images), which
    // — even after the metadata strip — bloated this endpoint to 150MB+. listTasks
    // itself is unchanged, so the Slack "titles + descriptions" push still has them.
    const lite = tasks.map((t) => ({ ...t, description: null, acceptanceCriteria: null }));
    return apiOk(lite);
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
