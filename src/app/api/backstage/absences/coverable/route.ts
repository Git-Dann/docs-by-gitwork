import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listCoverableClients } from "@/server/absences";

export const dynamic = "force-dynamic";

// GET /api/backstage/absences/coverable?userId=… — clients the person has active
// tasks on, so a cover dev can be pointed at one. (Static segment — takes routing
// precedence over the sibling [id] route.)
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) return apiError("userId is required", 400);
    return apiOk(await listCoverableClients(user, userId));
  } catch (e) {
    return fromError(e);
  }
}
