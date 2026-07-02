// GET /api/desk/holidays — next UK + Pakistan public holiday for On Your Desk.
// Bundled date-holidays (no external API, no AI). Auth-gated (internal only).

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getNextHolidays } from "@/server/desk";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuthedUser(req);
    return apiOk(getNextHolidays());
  } catch (e) {
    return fromError(e);
  }
}
