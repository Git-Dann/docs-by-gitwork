import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { placementUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; placementId: string }>;
};

/**
 * PATCH /api/codeclear/candidates/{id}/placements/{placementId}
 *
 * Sets or clears a placement's end date — used by the Portal mobile app to
 * "schedule a dev off" on a future date (and drive the within-7-days "ending
 * soon" indicator). Workspace-scoped via the parent candidate.
 *
 * Body: { endDate: string | null }  (null → open-ended again)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id: candidateId, placementId } = await context.params;

    // Confirm the placement belongs to a candidate in this workspace.
    const placement = await prisma.placement.findFirst({
      where: {
        id: placementId,
        candidateId,
        candidate: { workspaceId: workspace.id },
      },
      select: { id: true },
    });

    if (!placement) {
      return apiError("Placement not found.", 404);
    }

    const body = placementUpdateSchema.parse(await request.json());

    const updated = await prisma.placement.update({
      where: { id: placement.id },
      data: { endDate: body.endDate },
    });

    return apiOk({ placement: updated });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * DELETE /api/codeclear/candidates/{id}/placements/{placementId}
 *
 * Removes a placement entirely (e.g. an erroneous schedule). Workspace-scoped.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id: candidateId, placementId } = await context.params;

    const placement = await prisma.placement.findFirst({
      where: {
        id: placementId,
        candidateId,
        candidate: { workspaceId: workspace.id },
      },
      select: { id: true },
    });

    if (!placement) {
      return apiError("Placement not found.", 404);
    }

    await prisma.placement.delete({ where: { id: placement.id } });

    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
