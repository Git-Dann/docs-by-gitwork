import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { codeClearDetailInclude, serializeCandidateDetails } from "@/server/codeclear";
import {
  assertCan,
  canManageCode,
  canViewRates,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
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
    assertCan(await getEffectiveUserOrNull(request), canManageCode, "edit candidates");
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

    // Atomic: candidate update + (optional) rate-card sync both succeed
    // or both roll back. Rate-card sync has two branches:
    //   1. Candidate already has a linked rate-card row → update it.
    //   2. Candidate has no link AND a rate is being saved → CREATE a
    //      rate-card row + link the candidate to it. Handles the
    //      "manually-added dev with no seed entry" case (e.g. Sibghat).
    // Either way the next read returns the fresh rate via the join, so
    // the display works without falling back to Candidate.hourlyRate.
    // Switched to an interactive transaction because the create+link
    // path needs the new row's id to wire onto the candidate row.
    const rateBeingSet = body.hourlyRate !== undefined && body.hourlyRate != null;

    const candidate = await prisma.$transaction(async (tx) => {
      const updated = await tx.candidate.update({
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
        ...(body.devGroup !== undefined ? { devGroup: body.devGroup } : {}),
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

      if (rateBeingSet) {
        const rate = new Prisma.Decimal(body.hourlyRate as number);
        const currency = body.currency || "USD";

        if (existing.rateCardPersonId) {
          // Branch 1 — candidate already has a rate-card link. Update
          // the linked row in place; the next read pulls the fresh
          // monthly figure through the join.
          await tx.rateCardPerson.update({
            where: { id: existing.rateCardPersonId },
            data: {
              sourceRate: rate,
              billingPeriod: "MONTH",
              sourceCurrencyCode: currency,
            },
          });
        } else {
          // Branch 2 — no link. Create a rate-card row from the
          // candidate's identity and wire it onto the candidate so
          // future reads + saves go through the join cleanly. Area
          // defaults to the primary stack since we don't carry a
          // separate role string on Candidate.
          const newRateCard = await tx.rateCardPerson.create({
            data: {
              workspaceId: existing.workspaceId,
              name: updated.name,
              area: updated.primaryStack || "Developer",
              sourceRate: rate,
              sourceCurrencyCode: currency,
              billingPeriod: "MONTH",
            },
          });
          await tx.candidate.update({
            where: { id: updated.id },
            data: { rateCardPersonId: newRateCard.id },
          });
        }
      }

      return updated;
    });

    // Re-fetch when the rate path ran so the response carries the
    // freshly-linked + freshly-priced rate-card row through the join.
    const fresh = rateBeingSet
      ? await prisma.candidate.findFirstOrThrow({
          where: { id: candidate.id },
          include: codeClearDetailInclude,
        })
      : candidate;

    return apiOk({ candidate: serializeCandidateDetails(fresh) });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageCode, "delete candidates");
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const existing = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      select: {
        id: true,
        email: true,
        rateCardPerson: {
          select: {
            id: true,
            seedIdentifier: true,
          },
        },
      },
    });

    if (!existing) {
      return apiError("Candidate not found.", 404);
    }

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    if (existing.rateCardPerson?.seedIdentifier?.startsWith("gitwork.")) {
      writes.push(
        prisma.rateCardPerson.update({
          where: { id: existing.rateCardPerson.id },
          data: { archivedAt: new Date() },
        }),
      );
    }
    if (existing.email?.toLowerCase().endsWith("@gitwork.co.uk")) {
      writes.push(
        prisma.workspaceMember.deleteMany({
          where: {
            workspaceId: workspace.id,
            user: { email: existing.email },
          },
        }),
      );
    }
    writes.push(prisma.candidate.delete({ where: { id: existing.id } }));

    await prisma.$transaction(writes);

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
