import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { createAssessment, listAssessments } from "@/server/devsignal/assessment";
import { devSignalAssessmentCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view DevSignal");
    const { workspace } = await ensureBaseRecords();
    const params = request.nextUrl.searchParams;
    const items = await listAssessments(workspace.id, {
      status: params.get("status") ?? undefined,
      decision: params.get("decision") ?? undefined,
      candidateId: params.get("candidateId") ?? undefined,
    });
    return apiOk({ items });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "create a DevSignal assessment");
    const { workspace } = await ensureBaseRecords();
    const body = devSignalAssessmentCreateSchema.parse(await request.json());
    const assessment = await createAssessment({
      workspaceId: workspace.id,
      actorId: user?.id ?? null,
      clientId: body.clientId,
      candidateId: body.candidateId,
      candidate: body.candidate,
    });
    return apiOk({ assessment }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
