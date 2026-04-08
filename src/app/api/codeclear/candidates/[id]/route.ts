import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { serializeCandidateDetails } from "@/server/codeclear";
import { candidateUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: {
        score: true,
        scoreDraft: true,
        placements: {
          orderBy: {
            startDate: "desc",
          },
        },
        notes: {
          orderBy: {
            createdAt: "desc",
          },
        },
        activityLog: {
          orderBy: {
            createdAt: "desc",
          },
        },
        githubAnalysisRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 8,
        },
      },
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    return apiOk({ candidate: serializeCandidateDetails(candidate) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id } = await context.params;
    const body = candidateUpdateSchema.parse(await request.json());
    const existing = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
    });

    if (!existing) {
      return apiError("Candidate not found.", 404);
    }

    const candidate = await prisma.candidate.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(body.name !== undefined ? { name: body.name ?? existing.name } : {}),
        ...(body.githubHandle !== undefined ? { githubHandle: body.githubHandle } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.primaryStack !== undefined
          ? { primaryStack: body.primaryStack ?? existing.primaryStack }
          : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.rateCardPersonId !== undefined
          ? { rateCardPersonId: body.rateCardPersonId }
          : {}),
        ...(body.recheckDueAt !== undefined ? { recheckDueAt: body.recheckDueAt } : {}),
        ...(body.status && body.status !== existing.status
          ? {
              activityLog: {
                create: {
                  eventType: "STATUS_CHANGE",
                  metadata: {
                    from: existing.status,
                    to: body.status,
                    by: user.name ?? user.email,
                  } as Prisma.InputJsonValue,
                },
              },
            }
          : {}),
      },
      include: {
        score: true,
        scoreDraft: true,
        placements: {
          orderBy: {
            startDate: "desc",
          },
        },
        notes: {
          orderBy: {
            createdAt: "desc",
          },
        },
        activityLog: {
          orderBy: {
            createdAt: "desc",
          },
        },
        githubAnalysisRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 8,
        },
      },
    });

    return apiOk({ candidate: serializeCandidateDetails(candidate) });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const existing = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return apiError("Candidate not found.", 404);
    }

    await prisma.candidate.delete({
      where: {
        id: existing.id,
      },
    });

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
