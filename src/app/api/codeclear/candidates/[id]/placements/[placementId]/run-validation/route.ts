import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  GitHubAnalysisError,
  analyzeGitHubRepoScope,
  buildChecksFromScopedAnalysis,
  getGitHubAnalysisVersion,
} from "@/server/codeclear-analysis";
import { normalizeGitHubAnalysisRun } from "@/server/codeclear";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; placementId: string }>;
};

/**
 * POST /api/codeclear/candidates/{id}/placements/{placementId}/run-validation
 *
 * The per-engagement equivalent of "Run validation". Scans the dev's
 * activity within a specific repo (resolved via the placement's linked
 * ClientPlatform.repoUrl) and optionally narrows to specific paths and a
 * branch (set on the Placement itself).
 *
 * Writes a new GitHubAnalysisRun with `scope = REPO` and `placementId`
 * set, plus CodeClearCheck rows tagged with the same placementId so the
 * UI can show engagement-specific findings separately from the dev's
 * profile-wide validation.
 *
 * Returns 400 if the placement has no linked platform, or the platform
 * has no repoUrl — the Portal needs to set the repo before the scan can
 * happen.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id: candidateId, placementId } = await context.params;

    const placement = await prisma.placement.findFirst({
      where: {
        id: placementId,
        candidateId,
        candidate: { workspaceId: workspace.id },
      },
      include: {
        candidate: { select: { id: true, name: true, githubHandle: true } },
        clientPlatform: { select: { id: true, name: true, repoUrl: true } },
      },
    });
    if (!placement) return apiError("Placement not found.", 404);

    const repoUrl = placement.clientPlatform?.repoUrl ?? null;
    if (!repoUrl) {
      return apiError(
        placement.clientPlatformId
          ? "The linked platform has no GitHub repo set yet. Add a repo URL on the platform in Portal."
          : "This placement isn't linked to a client platform yet. Pick a platform first so we know which repo to scan.",
        400,
      );
    }

    const startedRun = await prisma.gitHubAnalysisRun.create({
      data: {
        candidateId: placement.candidateId,
        scope: "REPO",
        placementId: placement.id,
        scopedRepoUrl: repoUrl,
        scopedRepoPaths: placement.repoPaths,
        scopedRepoBranch: placement.repoBranch,
        triggerSource: "PLACEMENT",
        status: "RUNNING",
        analysisVersion: getGitHubAnalysisVersion(),
      },
    });

    await prisma.activityLog.create({
      data: {
        candidateId: placement.candidateId,
        eventType: "GITHUB_ANALYSIS_STARTED",
        metadata: {
          by: user.name ?? user.email,
          runId: startedRun.id,
          scope: "REPO",
          placementId: placement.id,
          repoUrl,
          paths: placement.repoPaths,
          branch: placement.repoBranch ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const analysis = await analyzeGitHubRepoScope({
        handle: placement.candidate.githubHandle,
        repoUrl,
        paths: placement.repoPaths,
        branch: placement.repoBranch,
      });
      const checks = buildChecksFromScopedAnalysis(analysis);

      const completedRun = await prisma.gitHubAnalysisRun.update({
        where: { id: startedRun.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          metrics: {
            owner: analysis.owner,
            repo: analysis.repo,
            paths: analysis.paths,
            branch: analysis.branch,
            commitCount: analysis.commitCount,
            scopedCommitCount: analysis.scopedCommitCount,
            uniqueFiles: analysis.uniqueFiles,
            additions: analysis.additions,
            deletions: analysis.deletions,
            lastCommitAt: analysis.lastCommitAt,
            sample: analysis.sample,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.$transaction([
        // Replace previous scoped checks for this placement only — profile
        // checks (placementId null) stay untouched.
        prisma.codeClearCheck.deleteMany({
          where: { candidateId: placement.candidateId, placementId: placement.id },
        }),
        prisma.codeClearCheck.createMany({
          data: checks.map((check) => ({
            candidateId: placement.candidateId,
            placementId: placement.id,
            runId: completedRun.id,
            category: check.category,
            checkKey: check.checkKey,
            label: check.label,
            status: check.status,
            detail: check.detail,
            weight: check.weight,
            sortOrder: check.sortOrder,
          })),
        }),
        prisma.placement.update({
          where: { id: placement.id },
          data: {
            lastScopedScanAt: completedRun.completedAt,
            lastScopedScanRunId: completedRun.id,
          },
        }),
        prisma.activityLog.create({
          data: {
            candidateId: placement.candidateId,
            eventType: "GITHUB_ANALYSIS_COMPLETED",
            metadata: {
              by: user.name ?? user.email,
              runId: completedRun.id,
              scope: "REPO",
              placementId: placement.id,
              checkCount: checks.length,
              scopedCommitCount: analysis.scopedCommitCount,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      return apiOk(
        {
          run: normalizeGitHubAnalysisRun(completedRun),
          analysis: {
            commitCount: analysis.commitCount,
            scopedCommitCount: analysis.scopedCommitCount,
            uniqueFiles: analysis.uniqueFiles,
            additions: analysis.additions,
            deletions: analysis.deletions,
            lastCommitAt: analysis.lastCommitAt,
          },
          checks,
        },
        { status: 201 },
      );
    } catch (error) {
      const analysisError = error instanceof GitHubAnalysisError ? error : null;
      const failedRun = await prisma.gitHubAnalysisRun.update({
        where: { id: startedRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: analysisError?.code ?? "UNKNOWN_ERROR",
          errorMessage:
            analysisError?.message ??
            (error instanceof Error
              ? error.message
              : "Unexpected scoped GitHub analysis failure."),
        },
      });

      await prisma.activityLog.create({
        data: {
          candidateId: placement.candidateId,
          eventType: "GITHUB_ANALYSIS_FAILED",
          metadata: {
            by: user.name ?? user.email,
            runId: failedRun.id,
            scope: "REPO",
            placementId: placement.id,
            errorCode: failedRun.errorCode,
          } as Prisma.InputJsonValue,
        },
      });

      return apiOk({ run: normalizeGitHubAnalysisRun(failedRun) }, { status: 200 });
    }
  } catch (error) {
    return fromError(error);
  }
}
