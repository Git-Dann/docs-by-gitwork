import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getAssessmentAnalytics } from "@/server/devsignal/assessment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view DevSignal analytics");
    const { workspace } = await ensureBaseRecords();
    return apiOk({ analytics: await getAssessmentAnalytics(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}
