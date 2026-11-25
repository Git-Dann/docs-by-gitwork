/**
 * The client's feedback on a task, from the team's side (the task drawer):
 *   GET  → the thread the client sees on their Board
 *   POST → { kind?, body } a reply, or the team approving / asking for changes (recorded as
 *          Gitwork's, with the person's name). `kind` defaults to a comment.
 * Same access as viewing the task: the workspace, and this client in the person's scope.
 */
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listTaskFeedbackForTeam, replyToTaskFeedback } from "@/server/wiki-board";
import { teamFeedbackSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    return apiOk({ feedback: await listTaskFeedbackForTeam(user, id) });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const { kind, body } = teamFeedbackSchema.parse(await req.json());
    return apiOk({ entry: await replyToTaskFeedback(user, id, body, kind) }, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
