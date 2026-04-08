import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  normalizeGitHubAnalysisRun,
  serializeCandidateDetails,
  codeClearDetailInclude,
} from "@/server/codeclear";
import {
  GitHubAnalysisError,
  analyzeGitHubProfile,
  getGitHubAnalysisVersion,
} from "@/server/codeclear-analysis";

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
      select: {
        id: true,
      },
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    const runs = await prisma.gitHubAnalysisRun.findMany({
      where: {
        candidateId: candidate.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return apiOk({
      runs: runs.map((run) => normalizeGitHubAnalysisRun(run)),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id } = await context.params;
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      select: {
        id: true,
        githubHandle: true,
      },
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    const startedRun = await prisma.gitHubAnalysisRun.create({
      data: {
        candidateId: candidate.id,
        status: "RUNNING",
        triggerSource: "MANUAL",
        analysisVersion: getGitHubAnalysisVersion(),
      },
    });

    await prisma.activityLog.create({
      data: {
        candidateId: candidate.id,
        eventType: "GITHUB_ANALYSIS_STARTED",
        metadata: {
          by: user.name ?? user.email,
          runId: startedRun.id,
          githubHandle: candidate.githubHandle,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const analysis = await analyzeGitHubProfile(candidate.githubHandle);

      const completedRun = await prisma.gitHubAnalysisRun.update({
        where: {
          id: startedRun.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          profileSnapshot: analysis.profileSnapshot as unknown as Prisma.InputJsonValue,
          repoSnapshot: analysis.repoSnapshot as unknown as Prisma.InputJsonValue,
          metrics: analysis.metrics as unknown as Prisma.InputJsonValue,
          redFlags: analysis.redFlags as unknown as Prisma.InputJsonValue,
          recommendedTechnicalDepth: analysis.recommendedTechnicalDepth,
          recommendedCodeQuality: analysis.recommendedCodeQuality,
          recommendedDeliveryReadiness: analysis.recommendedDeliveryReadiness,
          llmSummary: analysis.llmSummary,
        },
      });

      await prisma.$transaction([
        prisma.candidate.update({
          where: {
            id: candidate.id,
          },
          data: {
            avatarUrl: analysis.profileSnapshot.avatarUrl ?? undefined,
            location: analysis.profileSnapshot.location ?? undefined,
            bio: analysis.profileSnapshot.bio ?? undefined,
          },
        }),
        prisma.activityLog.create({
          data: {
            candidateId: candidate.id,
            eventType: "GITHUB_ANALYSIS_COMPLETED",
            metadata: {
              by: user.name ?? user.email,
              runId: completedRun.id,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      const refreshed = await prisma.candidate.findUnique({
        where: {
          id: candidate.id,
        },
        include: codeClearDetailInclude,
      });

      return apiOk(
        {
          run: normalizeGitHubAnalysisRun(completedRun),
          candidate: refreshed ? serializeCandidateDetails(refreshed) : null,
        },
        { status: 201 },
      );
    } catch (error) {
      const analysisError = error instanceof GitHubAnalysisError ? error : null;
      const failedRun = await prisma.gitHubAnalysisRun.update({
        where: {
          id: startedRun.id,
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: analysisError?.code ?? "UNKNOWN_ERROR",
          errorMessage:
            analysisError?.message ??
            (error instanceof Error ? error.message : "Unexpected GitHub analysis failure."),
        },
      });

      await prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          eventType: "GITHUB_ANALYSIS_FAILED",
          metadata: {
            by: user.name ?? user.email,
            runId: failedRun.id,
            errorCode: failedRun.errorCode,
          } as Prisma.InputJsonValue,
        },
      });

      return apiOk({
        run: normalizeGitHubAnalysisRun(failedRun),
      });
    }
  } catch (error) {
    return fromError(error);
  }
}
