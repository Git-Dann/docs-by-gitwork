import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { recordInterview } from "@/server/devsignal/assessment";
import { devSignalInterviewSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "record a DevSignal interview");
    const { workspace } = await ensureBaseRecords();
    const { assessmentId } = await params;
    const body = devSignalInterviewSchema.parse(await request.json());
    const assessment = await recordInterview(workspace.id, assessmentId, {
      dimensions: body.dimensions,
      verdict: body.verdict,
      notes: body.notes,
      interviewerId: user?.id ?? null,
    });
    if (!assessment) return apiError("Assessment not found", 404);
    return apiOk({ assessment });
  } catch (error) {
    return fromError(error);
  }
}
