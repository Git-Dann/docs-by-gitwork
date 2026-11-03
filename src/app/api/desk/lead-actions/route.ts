import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listMyLeadActions } from "@/server/crm/service";

export const dynamic = "force-dynamic";

/** GET /api/desk/lead-actions — the caller's open sales actions across every lead. */
export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk({ actions: await listMyLeadActions(user) });
  } catch (error) {
    return fromError(error);
  }
}
