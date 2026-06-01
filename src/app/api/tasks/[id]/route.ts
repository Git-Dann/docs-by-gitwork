import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getTask, updateTask, deleteTask } from "@/server/tasks";
import { taskUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const task = await getTask(user, id);
    return apiOk(task);
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = taskUpdateSchema.parse(await req.json());
    const updated = await updateTask(user, id, body);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteTask(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
