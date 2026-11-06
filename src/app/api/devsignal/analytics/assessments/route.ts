import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getAssessmentAnalytics } from "@/server/devsignal/assessment";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view DevSignal analytics");
    const workspace = { id: await workspaceIdForRequest(request) };
    return apiOk({ analytics: await getAssessmentAnalytics(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}
