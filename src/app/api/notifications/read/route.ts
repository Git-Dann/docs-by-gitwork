/** POST /api/notifications/read → mark a set ({ ids }) or all ({ all: true }) read.
 *  Returns { updated, unread } so the client can sync the badge race-free. */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { markAllRead, markRead } from "@/server/notifications";
import { notificationReadSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = notificationReadSchema.parse(await req.json());
    const result = body.all ? await markAllRead(user) : await markRead(user, body.ids ?? []);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
