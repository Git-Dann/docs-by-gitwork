import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertAtLeastAdmin } from "@/server/auth/effective-user";
import { getCalendarTimeline } from "@/server/backstage-timeline";

export const dynamic = "force-dynamic";

// GET /api/backstage/calendar/timeline?year=2026&month=6
// Portal Gantt overlay for the team calendar: dated feature blocks + milestones
// across every client, scoped to the month grid window. Admin / super-admin only.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertAtLeastAdmin(user);
    const url = new URL(req.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
    const month = Number(url.searchParams.get("month") ?? now.getUTCMonth() + 1);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return apiError("year and month must be numbers", 400);
    }
    const timeline = await getCalendarTimeline(user, year, month);
    return apiOk(timeline);
  } catch (e) {
    return fromError(e);
  }
}
