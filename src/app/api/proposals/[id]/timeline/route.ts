import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { proposalTimelineSchema } from "@/server/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = proposalTimelineSchema.parse(await request.json());

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Proposal not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.timelinePhase.deleteMany({ where: { documentId: id } });
      await tx.timelinePhase.createMany({
        data: payload.timelinePhases.map((phase, index) => ({
          documentId: id,
          name: phase.name,
          duration: phase.duration,
          summary: phase.summary,
          deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
          sortOrder: phase.sortOrder ?? index,
          viewMode: phase.viewMode,
        })),
      });

      if (payload.viewMode) {
        const timelineSection = await tx.documentSection.findFirst({
          where: {
            documentId: id,
            key: "timeline",
          },
          orderBy: {
            sortOrder: "asc",
          },
        });

        if (timelineSection) {
          const currentData = (timelineSection.data as Record<string, unknown>) ?? {};
          await tx.documentSection.update({
            where: {
              id: timelineSection.id,
            },
            data: {
              data: {
                ...currentData,
                viewMode: payload.viewMode,
              },
            },
          });
        }
      }
    });

    const updated = await prisma.document.findFirst({
      where: {
        id,
      },
      include: proposalInclude,
    });

    if (!updated) {
      return apiError("Proposal not found", 404);
    }

    return apiOk({ proposal: serializeProposal(updated) });
  } catch (error) {
    return fromError(error);
  }
}
