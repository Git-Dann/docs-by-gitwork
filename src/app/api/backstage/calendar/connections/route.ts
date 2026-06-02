import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listCalendarConnections } from "@/server/backstage-gcal";

export const dynamic = "force-dynamic";

// GET /api/backstage/calendar/connections
// Workspace members who've connected Google (their calendar can be overlaid),
// plus whether the current user is connected.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const data = await listCalendarConnections(user);
    return apiOk(data);
  } catch (e) {
    return fromError(e);
  }
}
