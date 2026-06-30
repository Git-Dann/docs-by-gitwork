import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { broadcastUpdate, listRecentSlackUpdates } from "@/server/slack-updates";
import { broadcastSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/** Recent ad-hoc pushes by the caller — powers the broadcast card's history line. */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const recent = await listRecentSlackUpdates(user);
    return apiOk(recent);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = broadcastSchema.parse(await req.json());
    const result = await broadcastUpdate(user, body);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
