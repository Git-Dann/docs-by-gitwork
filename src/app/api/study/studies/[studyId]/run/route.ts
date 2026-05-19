import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getStudy, runStudy } from "@/server/study";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    const { studyId } = await params;
    const study = await getStudy(studyId);
    if (!study) return apiError("Study not found", 404);
    if (!study.plan || study.plan.questions.length === 0) {
      return apiError("Study has no plan questions. Generate and lock a plan first.", 400);
    }
    if (study.selectedPersonaIds.length === 0) {
      return apiError("No personas selected.", 400);
    }
    after(() => runStudy(studyId).catch(console.error));
    return apiOk({ started: true });
  } catch (error) {
    return fromError(error);
  }
}
