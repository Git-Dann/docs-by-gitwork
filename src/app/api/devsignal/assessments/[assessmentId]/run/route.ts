import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { runAssessment } from "@/server/devsignal/assessment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "run a DevSignal assessment");
    const { workspace } = await ensureBaseRecords();
    const { assessmentId } = await params;
    const assessment = await runAssessment(workspace.id, assessmentId, { actorId: user?.id ?? null });
    if (!assessment) return apiError("Assessment not found", 404);
    return apiOk({ assessment });
  } catch (error) {
    return fromError(error);
  }
}
