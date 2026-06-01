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
 * Edit one placement. Superset of fields — iOS "schedule off" sends just
 * { endDate }, the web schedule form can send the full set (project,
 * dates, allocation %, notes, switch client). Workspace-scoped via the
 * parent candidate.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    if (!placement) return apiError("Placement not found.", 404);

    const body = placementUpdateSchema.parse(await request.json());

    // If the client is being switched, validate it exists in this workspace
    // and grab its name so clientName stays in sync (when not also sent).
    let clientName: string | undefined;
    if (body.clientId !== undefined && body.clientId !== null) {
      const client = await prisma.workspaceClient.findFirst({
        where: { id: body.clientId, workspaceId: workspace.id },
        select: { name: true },
      });
      if (!client) return apiError("Client not found in this workspace.", 404);
      clientName = client.name;
    }

    const updated = await prisma.placement.update({
      where: { id: placement.id },
      data: {
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
        ...(clientName !== undefined ? { clientName } : {}),
        ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
        ...(body.projectName !== undefined ? { projectName: body.projectName } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
        ...(body.allocationPercent !== undefined
          ? { allocationPercent: body.allocationPercent }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.clientPlatformId !== undefined
          ? { clientPlatformId: body.clientPlatformId }
          : {}),
        ...(body.repoPaths !== undefined ? { repoPaths: body.repoPaths } : {}),
        ...(body.repoBranch !== undefined ? { repoBranch: body.repoBranch ?? null } : {}),
      },
    });

    return apiOk({
      placement: {
        id: updated.id,
        candidateId: updated.candidateId,
        clientId: updated.clientId,
        clientName: updated.clientName,
        projectName: updated.projectName,
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate ? updated.endDate.toISOString() : null,
        allocationPercent: updated.allocationPercent,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * DELETE /api/codeclear/candidates/{id}/placements/{placementId}
 *
 * Removes a placement entirely (erroneous block, cancelled engagement).
 * Workspace-scoped.
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
    if (!placement) return apiError("Placement not found.", 404);

    await prisma.placement.delete({ where: { id: placement.id } });
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
