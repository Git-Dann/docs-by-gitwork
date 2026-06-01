import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { moveTask } from "@/server/tasks";
import { taskMoveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = taskMoveSchema.parse(await req.json());
    const moved = await moveTask(user, id, body);
    return apiOk(moved);
  } catch (e) {
    return fromError(e);
  }
}
