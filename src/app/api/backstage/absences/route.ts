import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listTodayAbsences, listAbsencesForMonth, markAbsence } from "@/server/absences";
import { absenceInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// GET /api/backstage/absences            → today's absences (card + modal)
// GET /api/backstage/absences?year&month → absences over the month grid (calendar overlay)
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    if (yearParam && monthParam) {
      const year = Number(yearParam);
      const month = Number(monthParam);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return apiError("year and month must be numbers", 400);
      }
      return apiOk(await listAbsencesForMonth(user, year, month));
    }
    return apiOk(await listTodayAbsences(user));
  } catch (e) {
    return fromError(e);
  }
}

// POST /api/backstage/absences — mark someone out today (+ optional Slack post).
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = absenceInputSchema.parse(await req.json());
    const created = await markAbsence(user, body);
    return apiOk(created, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
