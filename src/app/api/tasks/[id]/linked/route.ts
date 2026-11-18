/** A product card's dev tasks (archived included) and the tasks that could be linked to it. */
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listCardLinks } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    return apiOk(await listCardLinks(user, id));
  } catch (e) {
    return fromError(e);
  }
}
