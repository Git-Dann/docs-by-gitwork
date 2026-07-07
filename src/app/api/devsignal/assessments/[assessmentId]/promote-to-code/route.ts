import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageCode, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { promoteToCode } from "@/server/devsignal/assessment";
import { devSignalPromoteSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * THE human gate. Promoting a vetted candidate into the Code roster is an
 * explicit human action — nothing automated ever calls this. Sets
 * decision = APPROVED_FOR_CODE and flips the candidate's `published` flag.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageCode, "promote a candidate into Code");
    const { workspace } = await ensureBaseRecords();
    const { assessmentId } = await params;
    const body = devSignalPromoteSchema.parse(await request.json().catch(() => ({})));
    const result = await promoteToCode(workspace.id, assessmentId, {
      actorId: user?.id ?? null,
      reason: body.reason,
    });
    if (!result.ok) return apiError(result.error, 409);
    return apiOk({ assessment: result.assessment });
  } catch (error) {
    return fromError(error);
  }
}
