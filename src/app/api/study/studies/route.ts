import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listStudies, createStudy } from "@/server/study";
import { assertCan, canManageStudy, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Study is an admin-only tool (gated by the `study` feature perm) — view == manage.
    assertCan(await getEffectiveUserOrNull(request), canManageStudy, "view studies");
    const studies = await listStudies();
    return apiOk({ studies });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStudy, "create studies");
    const body = await request.json();
    const rawClientId = typeof body.workspaceClientId === "string" ? body.workspaceClientId.trim() : null;
    const rawScanId = typeof body.linkedScanId === "string" ? body.linkedScanId.trim() : null;
    const study = await createStudy({
      title: String(body.title ?? "").trim() || "Untitled Study",
      problemStatement: String(body.problemStatement ?? "").trim(),
      researchGoals: Array.isArray(body.researchGoals) ? body.researchGoals.map(String) : [],
      sessionMode: body.sessionMode === "GROUP" ? "GROUP" : "ONE_ON_ONE",
      selectedPersonaIds: Array.isArray(body.selectedPersonaIds) ? body.selectedPersonaIds : [],
      workspaceClientId: rawClientId || null,
      linkedScanId: rawScanId || null,
    });
    return apiOk({ study }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
