import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { currentClientsUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * PATCH /api/codeclear/candidates/{id}/current-clients
 *
 * Multi-client version of the per-dev current-client picker. Body:
 *   { clientIds: string[] }
 *
 * Diff semantics — the candidate ends up with exactly one open placement
 * per workspaceClientId in the list:
 *   - Any open placement whose clientId is NOT in the new list is closed
 *     (endDate = now).
 *   - For any clientId in the new list that doesn't already have an open
 *     placement, a new open placement is created.
 *
 * Empty array → all open placements close, dev becomes unassigned.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id: candidateId } = await context.params;

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!candidate) return apiError("Candidate not found.", 404);

    const body = currentClientsUpdateSchema.parse(await request.json());
    const desiredIds = [...new Set(body.clientIds)];

    // Validate all referenced clients exist in this workspace.
    const validClients = desiredIds.length
      ? await prisma.workspaceClient.findMany({
          where: { id: { in: desiredIds }, workspaceId: workspace.id },
          select: { id: true, name: true },
        })
      : [];
    if (validClients.length !== desiredIds.length) {
      return apiError("One or more clients not found in this workspace.", 404);
    }
    const validById = new Map(validClients.map((c) => [c.id, c]));

    const openPlacements = await prisma.placement.findMany({
      where: { candidateId: candidate.id, endDate: null },
      select: { id: true, clientId: true, clientName: true },
    });

    const now = new Date();

    // Close any open placement whose clientId is not in the desired list.
    const toClose = openPlacements
      .filter((p) => !p.clientId || !desiredIds.includes(p.clientId))
      .map((p) => p.id);

    // Open new placements for any desired id that doesn't already have one open.
    const openClientIds = new Set(
      openPlacements
        .map((p) => p.clientId)
        .filter((id): id is string => Boolean(id)),
    );
    const toOpen = desiredIds.filter((id) => !openClientIds.has(id));

    await prisma.$transaction(async (tx) => {
      if (toClose.length > 0) {
        await tx.placement.updateMany({
          where: { id: { in: toClose } },
          data: { endDate: now },
        });
      }
      for (const clientId of toOpen) {
        const client = validById.get(clientId);
        if (!client) continue;
        await tx.placement.create({
          data: {
            candidateId: candidate.id,
            clientId: client.id,
            clientName: client.name,
            projectName: "Active engagement",
            startDate: now,
            endDate: null,
          },
        });
      }
    });

    return apiOk({ clientIds: desiredIds });
  } catch (error) {
    return fromError(error);
  }
}
