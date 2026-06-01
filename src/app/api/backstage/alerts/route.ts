import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getStaffingAlerts } from "@/server/backstage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const window = url.searchParams.get("window");
    const windowDays = window ? Math.max(1, Math.min(90, Number(window))) : 30;
    const alerts = await getStaffingAlerts(user, { windowDays });
    return apiOk(alerts);
  } catch (e) {
    return fromError(e);
  }
}
