import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  clampScore,
  codeClearDetailInclude,
  computeOverallScore,
  normalizeGitHubAnalysisRun,
  serializeCandidateDetails,
} from "@/server/codeclear";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; runId: string }>;
};

function languageBoost(topLanguages: Array<{ language: string; bytes: number }> = []) {
  const labels = topLanguages.map((entry) => entry.language.toLowerCase());
  const aiSignals = [
    "python",
    "typescript",
    "javascript",
    "jupyter notebook",
    "go",
    "rust",
  ];

  return labels.some((label) => aiSignals.includes(label)) ? 8 : 0;
}

function inferAiFluency(run: {
  metrics: Prisma.JsonValue | null;
  repoSnapshot: Prisma.JsonValue | null;
  llmSummary: string | null;
}) {
  const metrics =
    run.metrics && typeof run.metrics === "object" && !Array.isArray(run.metrics)
      ? (run.metrics as {
          averageHealthScore?: number;
          recentRepoRatio?: number;
          topLanguages?: Array<{ language: string; bytes: number }>;
        })
      : null;
  const summary = run.llmSummary?.toLowerCase() ?? "";
  const repoSnapshot = Array.isArray(run.repoSnapshot)
    ? (run.repoSnapshot as Array<{ topics?: string[] }>)
    : [];
  const topicBoost = repoSnapshot.some((repo) =>
    (repo.topics ?? []).some((topic) =>
      ["ai", "llm", "openai", "agents", "langchain"].includes(topic.toLowerCase()),
    ),
  )
    ? 12
    : 0;

  return clampScore(
    36 +
      (metrics?.averageHealthScore ?? 0) * 0.24 +
      (metrics?.recentRepoRatio ?? 0) * 0.18 +
      languageBoost(metrics?.topLanguages) +
      topicBoost +
      (summary.includes("agent") || summary.includes("llm") || summary.includes("ai") ? 8 : 0),
  );
}

function inferIdentityConfidence(run: {
  profileSnapshot: Prisma.JsonValue | null;
  metrics: Prisma.JsonValue | null;
  redFlags: Prisma.JsonValue | null;
}) {
  const profile =
    run.profileSnapshot && typeof run.profileSnapshot === "object" && !Array.isArray(run.profileSnapshot)
      ? (run.profileSnapshot as { followers?: number; publicRepos?: number; company?: string | null })
      : null;
  const metrics =
    run.metrics && typeof run.metrics === "object" && !Array.isArray(run.metrics)
      ? (run.metrics as { selectedRepoCount?: number; recentRepoRatio?: number })
      : null;
  const redFlags = Array.isArray(run.redFlags) ? (run.redFlags as string[]) : [];

  if (
    (profile?.followers ?? 0) >= 50 &&
    (profile?.publicRepos ?? 0) >= 10 &&
    (metrics?.selectedRepoCount ?? 0) >= 3 &&
    redFlags.length <= 1
  ) {
    return "HIGH";
  }

  if ((metrics?.selectedRepoCount ?? 0) >= 2 && (metrics?.recentRepoRatio ?? 0) >= 25) {
    return "MEDIUM";
  }

  if ((profile?.publicRepos ?? 0) >= 1) {
    return "LOW";
  }

  return "PENDING";
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id, runId } = await context.params;
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: {
        scoreDraft: true,
      },
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    const run = await prisma.gitHubAnalysisRun.findFirst({
      where: {
        id: runId,
        candidateId: candidate.id,
      },
    });

    if (!run) {
      return apiError("Analysis run not found.", 404);
    }

    if (run.status !== "COMPLETED") {
      return apiError("Only completed GitHub analysis runs can be applied.", 400);
    }

    const technicalDepth = clampScore(run.recommendedTechnicalDepth ?? 0);
    const codeQuality = clampScore(run.recommendedCodeQuality ?? 0);
    const deliveryReadiness = clampScore(run.recommendedDeliveryReadiness ?? 0);
    const aiFluency = inferAiFluency(run);
    const identityConfidence = inferIdentityConfidence(run);
    // Identity + red flags feed into the calibre formula. Red flag count
    // comes from the run's redFlags JSON; capping happens inside the helper.
    const redFlagsCount = Array.isArray(run.redFlags) ? run.redFlags.length : 0;
    const overallScore = computeOverallScore({
      technicalDepth,
      codeQuality,
      aiFluency,
      deliveryReadiness,
      identityConfidence,
      redFlagsCount,
    });
    const profile =
      run.profileSnapshot && typeof run.profileSnapshot === "object" && !Array.isArray(run.profileSnapshot)
        ? (run.profileSnapshot as {
            avatarUrl?: string | null;
            location?: string | null;
            bio?: string | null;
          })
        : null;

    await prisma.$transaction([
      prisma.codeClearScoreDraft.upsert({
        where: {
          candidateId: candidate.id,
        },
        create: {
          candidateId: candidate.id,
          technicalDepth,
          codeQuality,
          aiFluency,
          deliveryReadiness,
          identityConfidence,
          overallScore,
          sourceRunId: run.id,
          lastAppliedAt: new Date(),
          taskAiReview: run.llmSummary,
        },
        update: {
          technicalDepth,
          codeQuality,
          aiFluency,
          deliveryReadiness,
          identityConfidence,
          overallScore,
          sourceRunId: run.id,
          lastAppliedAt: new Date(),
          taskAiReview: run.llmSummary,
        },
      }),
      prisma.candidate.update({
        where: {
          id: candidate.id,
        },
        data: {
          avatarUrl: profile?.avatarUrl ?? undefined,
          location: profile?.location ?? undefined,
          bio: profile?.bio ?? undefined,
        },
      }),
      prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          eventType: "ANALYSIS_APPLIED",
          metadata: {
            by: user.name ?? user.email,
            runId: run.id,
            overallScore,
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

    if (!refreshed) {
      return apiError("Candidate not found after applying analysis.", 404);
    }

    return apiOk({
      candidate: serializeCandidateDetails(refreshed),
      run: normalizeGitHubAnalysisRun(run),
    });
  } catch (error) {
    return fromError(error);
  }
}
