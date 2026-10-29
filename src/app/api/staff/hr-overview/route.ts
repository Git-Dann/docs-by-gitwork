/**
 * GET /api/staff/hr-overview — HR's reminders: what's coming up in the next 60 days
 * (contracts, probations, supplier renewals, right to work) and records missing details.
 * Needs `hr.manage`; right-to-work dates also need `hr.viewSensitive`.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getHrOverview } from "@/server/hr/activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await getHrOverview(user));
  } catch (error) {
    return fromError(error);
  }
}
