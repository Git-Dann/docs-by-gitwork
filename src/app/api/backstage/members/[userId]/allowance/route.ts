import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { setLeaveAllowanceDays } from "@/server/backstage";
import { memberAnnualLeaveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// PATCH /api/backstage/members/[userId]/allowance { annualLeaveDays: number | null }
// Days per holiday year for one person; null = the workspace default. Whoever handles
// their leave may set it (setLeaveAllowanceDays checks).
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { userId } = await params;
    const body = memberAnnualLeaveSchema.parse(await req.json());
    return apiOk(await setLeaveAllowanceDays(user, userId, body.annualLeaveDays));
  } catch (e) {
    return fromError(e);
  }
}
