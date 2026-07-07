import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getAssessment } from "@/server/devsignal/assessment";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view a DevSignal assessment");
    const { workspace } = await ensureBaseRecords();
    const { assessmentId } = await params;
    // Admin detail view includes the invite token so it can be copied.
    const assessment = await getAssessment(workspace.id, assessmentId, { includeToken: true });
    if (!assessment) return apiError("Assessment not found", 404);
    return apiOk({ assessment });
  } catch (error) {
    return fromError(error);
  }
}
