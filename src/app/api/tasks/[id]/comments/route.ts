import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listTaskComments, addTaskComment } from "@/server/tasks";
import { taskCommentSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const comments = await listTaskComments(user, id);
    return apiOk(comments);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = taskCommentSchema.parse(await req.json());
    const comment = await addTaskComment(user, id, body.body);
    return apiOk(comment, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
