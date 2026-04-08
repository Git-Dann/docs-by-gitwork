import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  codeClearDetailInclude,
  computeOverallScore,
  serializeCandidateDetails,
} from "@/server/codeclear";
import { candidateScoreSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function addDays(base: Date, days: number) {
  const value = new Date(base);
  value.setDate(value.getDate() + days);
  return value;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id } = await context.params;
    const body = candidateScoreSchema.parse(await request.json());

    const existing = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: {
        score: true,
        scoreDraft: true,
      },
    });

    if (!existing) {
      return apiError("Candidate not found.", 404);
    }

    const technicalDepth =
      body.technicalDepth ??
      existing.scoreDraft?.technicalDepth ??
      existing.score?.technicalDepth ??
      0;
    const codeQuality =
      body.codeQuality ??
      existing.scoreDraft?.codeQuality ??
      existing.score?.codeQuality ??
      0;
    const aiFluency =
      body.aiFluency ??
      existing.scoreDraft?.aiFluency ??
      existing.score?.aiFluency ??
      0;
    const deliveryReadiness =
      body.deliveryReadiness ??
      existing.scoreDraft?.deliveryReadiness ??
      existing.score?.deliveryReadiness ??
      0;
    const identityConfidence =
      body.identityConfidence ??
      existing.scoreDraft?.identityConfidence ??
      existing.score?.identityConfidence ??
      "PENDING";
    const taskScore =
      body.taskScore !== undefined
        ? body.taskScore
        : existing.scoreDraft?.taskScore ?? existing.score?.taskScore ?? null;
    const taskTimeSeconds =
      body.taskTimeSeconds !== undefined
        ? body.taskTimeSeconds
        : existing.scoreDraft?.taskTimeSeconds ?? existing.score?.taskTimeSeconds ?? null;
    const taskAiReview =
      body.taskAiReview !== undefined
        ? body.taskAiReview
        : existing.scoreDraft?.taskAiReview ?? existing.score?.taskAiReview ?? null;
    const overallScore = computeOverallScore({
      technicalDepth,
      codeQuality,
      aiFluency,
      deliveryReadiness,
    });
    const verifiedAt = new Date();
    const validUntil = addDays(verifiedAt, 365);
    const nextStatus = existing.status === "PLACED" ? "PLACED" : "CODECLEAR_COMPLETE";

    await prisma.$transaction([
      prisma.codeClearScore.upsert({
        where: {
          candidateId: existing.id,
        },
        create: {
          candidateId: existing.id,
          technicalDepth,
          codeQuality,
          aiFluency,
          deliveryReadiness,
          identityConfidence,
          overallScore,
          taskScore,
          taskTimeSeconds,
          taskAiReview,
          verifiedAt,
          validUntil,
        },
        update: {
          technicalDepth,
          codeQuality,
          aiFluency,
          deliveryReadiness,
          identityConfidence,
          overallScore,
          taskScore,
          taskTimeSeconds,
          taskAiReview,
          verifiedAt,
          validUntil,
          expiredAt: null,
        },
      }),
      prisma.candidate.update({
        where: {
          id: existing.id,
        },
        data: {
          status: nextStatus,
          ...(nextStatus === "CODECLEAR_COMPLETE"
            ? {
                recheckDueAt: null,
              }
            : {}),
        },
      }),
      prisma.activityLog.create({
        data: {
          candidateId: existing.id,
          eventType: "SCORE_FINALIZED",
          metadata: {
            by: user.name ?? user.email,
            overallScore,
            status: nextStatus,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);

    const candidate = await prisma.candidate.findUnique({
      where: {
        id: existing.id,
      },
      include: codeClearDetailInclude,
    });

    if (!candidate) {
      return apiError("Candidate not found after score update.", 404);
    }

    return apiOk({ candidate: serializeCandidateDetails(candidate) });
  } catch (error) {
    return fromError(error);
  }
}
