import { apiOk, fromError } from "@/lib/api-response";
import { ForbiddenError, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { loadProjectBudgets } from "@/server/projects";

export const dynamic = "force-dynamic";

/**
 * GET — Money's per-project budget against spend (CLAUDE.md §150). Same gate as /api/money:
 * Super Admins and people granted `clients.viewFinancials`; everyone else gets a 403.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewClientFinancials(user)) throw new ForbiddenError("You don't have access to Money.");
    return apiOk({ projects: await loadProjectBudgets(user.workspaceId) });
  } catch (err) {
    return fromError(err);
  }
}
