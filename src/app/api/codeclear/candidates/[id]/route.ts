import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { codeClearDetailInclude, serializeCandidateDetails } from "@/server/codeclear";
import { canViewRates, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { candidateUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: codeClearDetailInclude,
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    // Field gate: blank rates for users without `code.viewRates` (API_KEY-only → full).
    const user = await getEffectiveUserOrNull(request);
    const showRates = user ? canViewRates(user) : true;
    return apiOk({ candidate: serializeCandidateDetails(candidate, { canViewRates: showRates }) });
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
        ...(body.techStacks !== undefined
          ? {
              techStacks: body.techStacks.length
                ? body.techStacks
                : [body.primaryStack ?? existing.primaryStack],
            }
          : {}),
        ...(body.signalSources !== undefined ? { signalSources: body.signalSources } : {}),
        ...(body.requestSignalSource && body.signalSources === undefined
          ? {
              signalSources: existing.signalSources.includes(body.requestSignalSource)
                ? existing.signalSources
                : [...existing.signalSources, body.requestSignalSource],
            }
          : {}),
        ...(body.scrapeSignalSource && body.signalSources === undefined
          ? {
              signalSources: existing.signalSources.includes(body.scrapeSignalSource)
                ? existing.signalSources
                : [...existing.signalSources, body.scrapeSignalSource],
            }
          : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.tierManualOverride !== undefined
          ? { tierManualOverride: body.tierManualOverride }
          : {}),
        ...(body.origin !== undefined ? { origin: body.origin } : {}),
        ...(body.published !== undefined ? { published: body.published } : {}),
        ...(body.linkedinUrl !== undefined ? { linkedinUrl: body.linkedinUrl } : {}),
        ...(body.cvUrl !== undefined ? { cvUrl: body.cvUrl } : {}),
        ...(body.portfolioUrl !== undefined ? { portfolioUrl: body.portfolioUrl } : {}),
        ...(body.yearsExperience !== undefined
          ? { yearsExperience: body.yearsExperience }
          : {}),
        ...(body.hourlyRate !== undefined ? { hourlyRate: body.hourlyRate } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.availability !== undefined ? { availability: body.availability } : {}),
        ...(body.rateCardPersonId !== undefined
          ? { rateCardPersonId: body.rateCardPersonId }
          : {}),
        ...(body.recheckDueAt !== undefined ? { recheckDueAt: body.recheckDueAt } : {}),
        ...((body.status && body.status !== existing.status) ||
        body.requestSignalSource ||
        body.scrapeSignalSource
          ? {
              activityLog: {
                create: [
                  ...(body.status && body.status !== existing.status
                    ? [
                        {
                          eventType: "STATUS_CHANGE",
                          metadata: {
                            from: existing.status,
                            to: body.status,
                            by: user.name ?? user.email,
                          } as Prisma.InputJsonValue,
                        },
                      ]
                    : []),
                  ...(body.requestSignalSource
                    ? [
                        {
                          eventType: "SIGNAL_REQUESTED",
                          metadata: {
                            source: body.requestSignalSource,
                            by: user.name ?? user.email,
                          } as Prisma.InputJsonValue,
                        },
                      ]
                    : []),
                  ...(body.scrapeSignalSource
                    ? [
                        {
                          eventType: "SIGNAL_SCRAPED",
                          metadata: {
                            source: body.scrapeSignalSource,
                            by: user.name ?? user.email,
                          } as Prisma.InputJsonValue,
                        },
                      ]
                    : []),
                ],
              },
            }
          : {}),
      },
      include: codeClearDetailInclude,
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
