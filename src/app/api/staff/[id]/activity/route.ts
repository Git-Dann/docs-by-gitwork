/**
 * GET /api/staff/[id]/activity — the profile's live side: tasks completed per day (26 weeks),
 * placements, leave in the next 90 days (type shown to the person and HR only), this year's
 * allowance (the person, HR, approvers) and developer details. Staff module or the person.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getStaffActivity } from "@/server/hr/activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await getStaffActivity(user, id));
  } catch (error) {
    return fromError(error);
  }
}
