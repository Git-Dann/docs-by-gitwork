import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getStudy, updateStudy, deleteStudy } from "@/server/study";
import { assertCan, canManageStudy, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Study is an admin-only tool (gated by the `study` feature perm) — view == manage, so all
// verbs assert the same gate.
export async function GET(request: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStudy, "view studies");
    const { studyId } = await params;
    const study = await getStudy(studyId);
    if (!study) return apiError("Study not found", 404);
    return apiOk({ study });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStudy, "update studies");
    const { studyId } = await params;
    const body = await request.json();
    const study = await updateStudy(studyId, body);
    return apiOk({ study });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStudy, "delete studies");
    const { studyId } = await params;
    await deleteStudy(studyId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
