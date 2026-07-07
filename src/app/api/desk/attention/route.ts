// GET /api/desk/attention — platform "needs attention" signals for the On Your Desk drawer.
// Currently: retention purge-review count (admins/super-admins only; empty for everyone else).

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getPurgeAttention } from "@/server/retention/purge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const purgeReview = await getPurgeAttention(user);
    return apiOk({ purgeReview });
  } catch (e) {
    return fromError(e);
  }
}
