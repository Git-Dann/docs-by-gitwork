import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getClientTaskSummary } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    const summary = await getClientTaskSummary(user, clientId);
    return apiOk(summary);
  } catch (e) {
    return fromError(e);
  }
}
