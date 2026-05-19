import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { triggerPlanGeneration, savePlan, getStudy } from "@/server/study";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    const { studyId } = await params;
    const study = await getStudy(studyId);
    return apiOk({ plan: study?.plan ?? null });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  try {
    const { studyId } = await params;
    const body = await request.json();

    if (body.generate === true) {
      // Fire off async plan generation
      after(() => triggerPlanGeneration(studyId).catch(console.error));
      return apiOk({ generating: true });
    }

    // Save plan
    await savePlan(
      studyId,
      body.questions ?? [],
      body.notes ?? null,
      body.status === "LOCKED" ? "LOCKED" : "DRAFT",
    );
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
