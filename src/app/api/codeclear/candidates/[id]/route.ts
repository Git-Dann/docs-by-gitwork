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

    // Atomic: candidate update + (optional) rate-card write-through both
    // succeed or both roll back. Prevents the half-saved state where
    // Candidate.hourlyRate changes but RateCardPerson.sourceRate doesn't
    // (which is exactly what the table reads). Re-fetch happens outside
    // the transaction so the include shape isn't affected.
    const ratePropagated =
      body.hourlyRate !== undefined &&
      existing.rateCardPersonId &&
      body.hourlyRate != null;

    const [candidate] = await prisma.$transaction([
      prisma.candidate.update({
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
    }),
      // Propagate the rate edit to the linked rate-card row. The Code →
      // Developers Monthly column reads from the rate-card join (single
      // source of truth), so without this write-through Syed's edits
      // were saving to Candidate.hourlyRate but invisible in the table.
      // We treat the form's figure as MONTH because that's how the
      // form pre-fills (from rate-card.sourceRate → Candidate.hourlyRate)
      // and what the table renders.
      ...(ratePropagated
        ? [
            prisma.rateCardPerson.update({
              where: { id: existing.rateCardPersonId as string },
              data: {
                sourceRate: new Prisma.Decimal(body.hourlyRate as number),
                billingPeriod: "MONTH" as const,
                ...(body.currency ? { sourceCurrencyCode: body.currency } : {}),
              },
            }),
          ]
        : []),
    ]);

    // Re-fetch when we updated the rate-card row so the response carries
    // the fresh monthly figure (the prior `update` returned the stale
    // join). Cheap — one extra read against the same indexed PK.
    const fresh = ratePropagated
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
