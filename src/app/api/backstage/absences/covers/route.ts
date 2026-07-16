import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listActiveCoversForClient } from "@/server/absences";

export const dynamic = "force-dynamic";

// GET /api/backstage/absences/covers?clientId=… — active covers on a client
// (who's standing in for an absent dev), for the client's DEVELOPERS card.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return apiError("clientId is required", 400);
    return apiOk(await listActiveCoversForClient(user, clientId));
  } catch (e) {
    return fromError(e);
  }
}
