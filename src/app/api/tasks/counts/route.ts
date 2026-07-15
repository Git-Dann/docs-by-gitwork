import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getWorkspaceTaskCounts } from "@/server/tasks";

export const dynamic = "force-dynamic";

// GET /api/tasks/counts → workspace-wide status counts, scoped to the caller's
// visible clients. Lets the HQ tasks widget show open/per-status counts without
// downloading every task row. Static segment — takes routing precedence over
// /api/tasks/[id] (same as /batch, /summary, etc.).
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await getWorkspaceTaskCounts(user));
  } catch (e) {
    return fromError(e);
  }
}
