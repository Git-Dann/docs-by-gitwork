// GET /api/tasks/attention — scoped "needs attention" aggregate for the dashboard
// (overdue list + due-soon / in-progress counts). Scoped to the caller's clients.

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getTaskAttention } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const mine = new URL(req.url).searchParams.get("mine") === "1";
    return apiOk(await getTaskAttention(user, { mine }));
  } catch (e) {
    return fromError(e);
  }
}
