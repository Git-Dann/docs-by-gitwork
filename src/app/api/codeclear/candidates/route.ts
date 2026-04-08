import {
  Prisma,
  type CodeClearTier as PrismaCodeClearTier,
  type IdentityConfidence as PrismaIdentityConfidence,
  type PipelineStatus as PrismaPipelineStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { serializeCandidateListItem } from "@/server/codeclear";
import {
  candidateBulkUpdateSchema,
  candidateCreateSchema,
} from "@/server/validators";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildCandidateWhere(
  workspaceId: string,
  searchParams: URLSearchParams,
): Prisma.CandidateWhereInput {
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim() || undefined;
  const tier = searchParams.get("tier")?.trim() || undefined;
  const identityConfidence = searchParams.get("identityConfidence")?.trim() || undefined;
  const recheckDue = searchParams.get("recheckDue")?.trim() || undefined;
  const stack = searchParams.get("stack")?.trim() || undefined;
  const scoreMin = searchParams.get("scoreMin");
  const scoreMax = searchParams.get("scoreMax");

  const overallScoreRange: Prisma.IntFilter = {};

  if (scoreMin !== null) {
    const parsedMin = Number(scoreMin);
    if (Number.isFinite(parsedMin)) {
      overallScoreRange.gte = parsedMin;
    }
  }

  if (scoreMax !== null) {
    const parsedMax = Number(scoreMax);
    if (Number.isFinite(parsedMax)) {
      overallScoreRange.lte = parsedMax;
    }
  }

  return {
    workspaceId,
    ...(status ? { status: status as PrismaPipelineStatus } : {}),
    ...(tier ? { tier: tier as PrismaCodeClearTier } : {}),
    ...(stack
      ? {
          primaryStack: {
            contains: stack,
            mode: "insensitive",
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              githubHandle: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              primaryStack: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(identityConfidence
      ? {
          OR: [
            {
              score: {
                identityConfidence: identityConfidence as PrismaIdentityConfidence,
              },
            },
            {
              scoreDraft: {
                identityConfidence: identityConfidence as PrismaIdentityConfidence,
              },
            },
          ],
        }
      : {}),
    ...(Object.keys(overallScoreRange).length
      ? {
          OR: [
            {
              score: {
                overallScore: overallScoreRange,
              },
            },
            {
              scoreDraft: {
                overallScore: overallScoreRange,
              },
            },
          ],
        }
      : {}),
    ...(recheckDue === "ANY"
      ? {
          recheckDueAt: {
            not: null,
          },
        }
      : recheckDue === "SOON"
        ? {
            recheckDueAt: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          }
        : recheckDue === "OVERDUE"
          ? {
              recheckDueAt: {
                lt: new Date(),
              },
            }
          : {}),
  };
}

function buildCandidateOrderBy(
  sortBy: string,
  sortDir: Prisma.SortOrder,
): Prisma.CandidateOrderByWithRelationInput {
  switch (sortBy) {
    case "name":
      return { name: sortDir };
    case "status":
      return { status: sortDir };
    case "updatedAt":
      return { updatedAt: sortDir };
    case "recheckDueAt":
      return { recheckDueAt: sortDir };
    case "overallScore":
      return { score: { overallScore: sortDir } };
    case "createdAt":
    default:
      return { createdAt: sortDir };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20);
    const sortBy = searchParams.get("sortBy")?.trim() || "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const where = buildCandidateWhere(workspace.id, searchParams);

    const [items, total, stacks] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: {
          score: true,
          scoreDraft: true,
          githubAnalysisRuns: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: buildCandidateOrderBy(sortBy, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where: {
          workspaceId: workspace.id,
        },
        distinct: ["primaryStack"],
        orderBy: {
          primaryStack: "asc",
        },
        select: {
          primaryStack: true,
        },
      }),
    ]);

    return apiOk({
      items: items.map((candidate) => serializeCandidateListItem(candidate)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        sortBy,
        sortDir,
      },
      facets: {
        stacks: stacks.map((entry) => entry.primaryStack),
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const body = candidateCreateSchema.parse(await request.json());

    const candidate = await prisma.candidate.create({
      data: {
        workspaceId: workspace.id,
        rateCardPersonId: body.rateCardPersonId ?? null,
        name: body.name,
        githubHandle: body.githubHandle,
        email: body.email ?? null,
        primaryStack: body.primaryStack,
        location: body.location ?? null,
        bio: body.bio ?? null,
        tier: body.tier,
        status: "SOURCED",
      },
      include: {
        score: true,
        scoreDraft: true,
        githubAnalysisRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        candidateId: candidate.id,
        eventType: "SOURCED",
        metadata: {
          by: user.name ?? user.email,
        } as Prisma.InputJsonValue,
      },
    });

    return apiOk({ candidate: serializeCandidateListItem(candidate) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const body = candidateBulkUpdateSchema.parse(await request.json());
    const candidates = await prisma.candidate.findMany({
      where: {
        workspaceId: workspace.id,
        id: {
          in: body.ids,
        },
      },
    });

    if (candidates.length !== body.ids.length) {
      return apiError("One or more selected candidates could not be found.", 404);
    }

    await prisma.$transaction(
      candidates.map((candidate) => {
        if (body.action === "MOVE_STAGE") {
          return prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              status: body.status,
              ...(body.status !== "RECHECK_DUE"
                ? {
                    recheckDueAt: null,
                  }
                : {}),
              activityLog: candidate.status !== body.status
                ? {
                    create: {
                      eventType: "STATUS_CHANGE",
                      metadata: {
                        from: candidate.status,
                        to: body.status,
                        by: user.name ?? user.email,
                      } as Prisma.InputJsonValue,
                    },
                  }
                : undefined,
            },
          });
        }

        const recheckDueAt =
          body.recheckDueAt ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        return prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            status: "RECHECK_DUE",
            recheckDueAt,
            activityLog: {
              create: {
                eventType: "RECHECK_FLAGGED",
                metadata: {
                  by: user.name ?? user.email,
                  recheckDueAt: recheckDueAt.toISOString(),
                } as Prisma.InputJsonValue,
              },
            },
          },
        });
      }),
    );

    const refreshed = await prisma.candidate.findMany({
      where: {
        id: {
          in: body.ids,
        },
      },
      include: {
        score: true,
        scoreDraft: true,
        githubAnalysisRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return apiOk({
      candidates: refreshed.map((candidate) => serializeCandidateListItem(candidate)),
    });
  } catch (error) {
    return fromError(error);
  }
}
