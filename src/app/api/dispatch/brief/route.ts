import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { getDispatchBrief } from "@/server/dispatch/assistant/brief";

export const dynamic = "force-dynamic";

/**
 * GET /api/dispatch/brief?clientSlug=&taskId= — what the Dispatch panel opens on: the person's
 * own tasks that need them, what's coming, and suggestions with a reason. Worked out from
 * Foundry's data with no AI call, through Dispatch's scope (only the person's clients).
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    const url = new URL(req.url);
    const clientSlug = url.searchParams.get("clientSlug")?.trim();
    if (!clientSlug || clientSlug.length > 120) return apiError("Pick a client first.", 400);
    const taskId = url.searchParams.get("taskId")?.trim().slice(0, 40) || null;
    return apiOk(await getDispatchBrief(user, { clientSlug, taskId }));
  } catch (err) {
    return fromError(err);
  }
}
