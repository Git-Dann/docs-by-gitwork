import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getCalendarMonth } from "@/server/backstage";

export const dynamic = "force-dynamic";

// GET /api/backstage/calendar?year=2026&month=6
// Returns a 6×7 month grid with approved-leave + holidays per cell. If year
// or month are omitted, defaults to the current calendar month (UTC).
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const now = new Date();
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const year = yearParam ? Number(yearParam) : now.getUTCFullYear();
    const month = monthParam ? Number(monthParam) : now.getUTCMonth() + 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return apiError("year and month must be numbers", 400);
    }
    const calendar = await getCalendarMonth(user, year, month);
    return apiOk(calendar);
  } catch (e) {
    return fromError(e);
  }
}
