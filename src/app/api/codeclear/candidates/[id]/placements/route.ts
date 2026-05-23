import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { placementCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = placementCreateSchema.parse(await request.json());

    const placement = await prisma.placement.create({
      data: {
        candidateId: candidate.id,
        clientId: body.clientId ?? null,
        clientName: body.clientName,
        projectName: body.projectName,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
      },
    });

    return apiOk({ placement }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
