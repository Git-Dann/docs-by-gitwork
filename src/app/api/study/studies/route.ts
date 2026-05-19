import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listStudies, createStudy } from "@/server/study";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const studies = await listStudies();
    return apiOk({ studies });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const study = await createStudy({
      title: String(body.title ?? "").trim() || "Untitled Study",
      problemStatement: String(body.problemStatement ?? "").trim(),
      researchGoals: Array.isArray(body.researchGoals) ? body.researchGoals.map(String) : [],
      sessionMode: body.sessionMode === "GROUP" ? "GROUP" : "ONE_ON_ONE",
      selectedPersonaIds: Array.isArray(body.selectedPersonaIds) ? body.selectedPersonaIds : [],
    });
    return apiOk({ study }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
