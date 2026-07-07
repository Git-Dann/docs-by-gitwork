// GET /api/retention/purge-candidates — cold archives past their retention window, awaiting an
// admin's purge decision. Admin/super-admin only.

import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { canReviewPurges, listPurgeCandidates } from "@/server/retention/purge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canReviewPurges(user)) return apiError("Forbidden", 403);
    return apiOk({ candidates: await listPurgeCandidates() });
  } catch (e) {
    return fromError(e);
  }
}
