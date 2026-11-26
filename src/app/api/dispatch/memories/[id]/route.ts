import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { deleteMemory } from "@/server/dispatch/assistant/memory";

export const dynamic = "force-dynamic";

/** DELETE — forget one of the caller's own notes. Anyone else's id simply isn't found. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    const { id } = await params;
    if (!(await deleteMemory(user, id))) return apiError("Not found.", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
