import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getLeaveAllowance } from "@/server/backstage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId") ?? undefined;
    const data = await getLeaveAllowance(user, targetUserId);
    return apiOk(data);
  } catch (e) {
    return fromError(e);
  }
}
