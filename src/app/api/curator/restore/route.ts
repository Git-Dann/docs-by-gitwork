import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { restoreCuratorRun } from "@/server/curator/restore";
import { curatorRestoreSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/** Reverse a run's deterministic transitions. Body: { runId }. */
export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "restore a curator run");
    const body = await request.json();
    const { runId } = curatorRestoreSchema.parse(body);
    const outcome = await restoreCuratorRun(runId);
    if (!outcome.ok) return apiError(outcome.reason ?? "Could not restore run", 400);
    return apiOk({ reversed: outcome.reversed });
  } catch (error) {
    return fromError(error);
  }
}
