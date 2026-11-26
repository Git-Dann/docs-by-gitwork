import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { listMemories } from "@/server/dispatch/assistant/memory";

export const dynamic = "force-dynamic";

/** GET /api/dispatch/memories — what the caller asked Dispatch to remember (§173). Only their own. */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    return apiOk({ memories: await listMemories(user) });
  } catch (err) {
    return fromError(err);
  }
}
