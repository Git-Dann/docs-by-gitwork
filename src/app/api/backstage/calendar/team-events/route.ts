import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getTeamCalendarEvents } from "@/server/backstage-gcal";

export const dynamic = "force-dynamic";

// GET /api/backstage/calendar/team-events?year=2026&month=6&userIds=a,b,c
// Google Calendar events for the requested connected members over the month grid.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
    const month = Number(url.searchParams.get("month") ?? now.getUTCMonth() + 1);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return apiError("year and month must be numbers", 400);
    }
    const userIds = (url.searchParams.get("userIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const events = await getTeamCalendarEvents(user, userIds, year, month);
    return apiOk({ events });
  } catch (e) {
    return fromError(e);
  }
}
