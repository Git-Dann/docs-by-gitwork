// GET /api/tasks/attention — scoped "needs attention" aggregate for the dashboard
// (overdue list + due-soon / in-progress counts). Scoped to the caller's clients.

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getTaskAttention } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await getTaskAttention(user));
  } catch (e) {
    return fromError(e);
  }
}
