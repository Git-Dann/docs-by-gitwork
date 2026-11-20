import { apiOk, fromError } from "@/lib/api-response";
import { ForbiddenError, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { loadMoney } from "@/server/money";

export const dynamic = "force-dynamic";

/**
 * GET — the Money page: revenue under contract, still to bill, won and pipeline.
 * Super Admins and people granted `clients.viewFinancials` only; everyone else gets a 403.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewClientFinancials(user)) throw new ForbiddenError("You don't have access to Money.");
    return apiOk(await loadMoney(user.workspaceId));
  } catch (err) {
    return fromError(err);
  }
}
