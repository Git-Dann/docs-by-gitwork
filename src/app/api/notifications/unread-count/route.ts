/** GET /api/notifications/unread-count → { unread }. Cheap COUNT for the bell's quiet poll. */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { unreadCount } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ unread: await unreadCount(user) });
  } catch (e) {
    return fromError(e);
  }
}
