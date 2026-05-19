import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getStudy, updateStudy, deleteStudy } from "@/server/study";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
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
    const { studyId } = await params;
    const body = await request.json();
    const study = await updateStudy(studyId, body);
    return apiOk({ study });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    const { studyId } = await params;
    await deleteStudy(studyId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
