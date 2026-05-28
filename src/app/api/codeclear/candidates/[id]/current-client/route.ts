import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { currentClientUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * PATCH /api/codeclear/candidates/{id}/current-client
 *
 * Sets the candidate's "current client" — used by the Code roster's per-dev
 * dropdown. Implementation: closes any currently-open placement (endDate null)
 * and, if a clientId is provided, opens a new open-ended placement against
 * that WorkspaceClient.
 *
 * Body: { clientId: string | null }
 *   - non-null clientId → assign to that client
 *   - null / omitted    → unassign (close any open placement, create none)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id: candidateId } = await context.params;

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, workspaceId: workspace.id },
      select: { id: true },
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    const body = currentClientUpdateSchema.parse(await request.json());
    const now = new Date();

    let client: { id: string; name: string } | null = null;
    if (body.clientId) {
      const found = await prisma.workspaceClient.findFirst({
        where: { id: body.clientId, workspaceId: workspace.id },
        select: { id: true, name: true },
      });
      if (!found) {
        return apiError("Client not found in this workspace.", 404);
      }
      client = found;
    }

    // Close out any currently-open placement (endDate is null) to "now"
    await prisma.placement.updateMany({
      where: { candidateId: candidate.id, endDate: null },
      data: { endDate: now },
    });

    // If a client was provided, open a new open-ended placement
    let placement = null;
    if (client) {
      placement = await prisma.placement.create({
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

    return apiOk({ placement, clientId: client?.id ?? null });
  } catch (error) {
    return fromError(error);
  }
}
