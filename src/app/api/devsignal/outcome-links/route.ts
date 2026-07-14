import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { createOutcomeLink } from "@/server/devsignal/assessment";
import { devSignalOutcomeLinkSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * Link an assessment to a real delivery placement — the future training label
 * for recalibration. We capture the linkage now; the model is NOT built yet.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "link a DevSignal outcome");
    const { workspace } = await ensureBaseRecords();
    const body = devSignalOutcomeLinkSchema.parse(await request.json());
    const link = await createOutcomeLink(workspace.id, {
      assessmentId: body.assessmentId,
      placementId: body.placementId,
      deliveryMetrics: body.deliveryMetrics,
      source: body.source,
      notes: body.notes,
      retained: body.retained,
      tenureDays: body.tenureDays,
      clientRating: body.clientRating,
      churned: body.churned,
      actorId: user?.id ?? null,
    });
    if (!link) return apiError("Assessment not found", 404);
    return apiOk({ link }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
