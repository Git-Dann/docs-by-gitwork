// GET /api/desk/action-items — open Scribe action items relevant to the current user.
// Powers the MEETINGS tab of The Desk drawer. Scoped to the caller (meetings they
// attended + items linked to their tasks).

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getMyActionItems } from "@/server/meetings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ items: await getMyActionItems(user) });
  } catch (e) {
    return fromError(e);
  }
}
