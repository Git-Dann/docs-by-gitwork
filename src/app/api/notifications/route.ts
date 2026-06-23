/** GET /api/notifications → the signed-in user's notification feed (newest/group-bumped first). */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listNotifications } from "@/server/notifications";
import { notificationListQuerySchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const q = notificationListQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      unreadOnly: url.searchParams.get("unreadOnly") ?? undefined,
    });
    const items = await listNotifications(user, {
      limit: q.limit,
      unreadOnly: q.unreadOnly === "true",
    });
    return apiOk(items);
  } catch (e) {
    return fromError(e);
  }
}
