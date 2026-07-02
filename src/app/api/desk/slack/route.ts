// GET /api/desk/slack — recent Slack activity across the caller's client channels.
// Powers the Slack column of the INBOX tab in On Your Desk. Scoped like the task
// board; no AI (pure aggregator).

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getMyDeskSlack } from "@/server/desk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await getMyDeskSlack(user));
  } catch (e) {
    return fromError(e);
  }
}
