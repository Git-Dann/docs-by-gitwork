import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageCode, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { recordDecision } from "@/server/devsignal/assessment";
import { devSignalDecisionSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageCode, "record a DevSignal decision");
    const { workspace } = await ensureBaseRecords();
    const { assessmentId } = await params;
    const body = devSignalDecisionSchema.parse(await request.json());
    // APPROVED_FOR_CODE is deliberately not settable here — that is the
    // promote-to-code human gate, not a plain decision.
    const assessment = await recordDecision(workspace.id, assessmentId, {
      decision: body.decision,
      reason: body.reason,
      actorId: user?.id ?? null,
    });
    if (!assessment) return apiError("Assessment not found", 404);
    return apiOk({ assessment });
  } catch (error) {
    return fromError(error);
  }
}
