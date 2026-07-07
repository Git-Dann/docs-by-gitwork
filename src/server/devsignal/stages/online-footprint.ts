import { prisma } from "@/lib/prisma";
import { analyzeGitHubProfile, getGitHubAnalysisVersion } from "@/server/codeclear-analysis";
import type {
  DevSignalStageContext,
  DevSignalStageResultInput,
  DevSignalStageRunner,
  DevSignalSubScore,
} from "./types";
import { DEV_SIGNAL_STAGE_NAMES } from "./types";

/**
 * Stage 5 — online footprint. WRAPS the existing CodeClear GitHub analysis
 * (`analyzeGitHubProfile` in codeclear-analysis.ts) behind the DevSignal stage
 * interface. It does not rebuild any analysis: it maps the recommended
 * sub-scores + red flags into a StageResult, and references the analysis
 * version as evidence.
 */
export const onlineFootprintRunner: DevSignalStageRunner = {
  stageId: "online_footprint",
  stageName: DEV_SIGNAL_STAGE_NAMES.online_footprint,
  get stageVersion() {
    return getGitHubAnalysisVersion();
  },

  async run(context: DevSignalStageContext): Promise<DevSignalStageResultInput> {
    const started = Date.now();
    const version = getGitHubAnalysisVersion();
    const base = {
      stageId: "online_footprint" as const,
      stageName: DEV_SIGNAL_STAGE_NAMES.online_footprint,
      stageVersion: version,
    };

    const candidate = await prisma.candidate.findFirst({
      where: { id: context.candidateId, workspaceId: context.workspaceId },
      select: { githubHandle: true },
    });

    if (!candidate?.githubHandle) {
      return {
        ...base,
        status: "SKIPPED",
        weight: 0,
        subScores: [],
        rawSignals: null,
        evidence: [],
        flags: [{ severity: "warn", code: "no_github_handle", message: "No GitHub handle to analyse." }],
        durationMs: Date.now() - started,
      };
    }

    try {
      const analysis = await analyzeGitHubProfile(candidate.githubHandle);

      const subScores: DevSignalSubScore[] = [
        {
          key: "technical_depth",
          label: "Technical depth",
          score: analysis.recommendedTechnicalDepth,
          maxScore: 100,
          rationale: `${analysis.metrics.languageCount} languages, avg health ${Math.round(analysis.metrics.averageHealthScore)}`,
        },
        {
          key: "code_quality",
          label: "Code quality",
          score: analysis.recommendedCodeQuality,
          maxScore: 100,
          rationale: `docs ${analysis.metrics.docsCoverage}%, tests ${analysis.metrics.testsCoverage}%, CI ${analysis.metrics.ciCoverage}%`,
        },
        {
          key: "delivery_readiness",
          label: "Delivery readiness",
          score: analysis.recommendedDeliveryReadiness,
          maxScore: 100,
          rationale: `recent activity ${analysis.metrics.recentRepoRatio}%`,
        },
      ];

      const avg =
        (analysis.recommendedTechnicalDepth +
          analysis.recommendedCodeQuality +
          analysis.recommendedDeliveryReadiness) /
        3;
      const status = avg >= 70 ? "PASS" : avg >= 50 ? "WARN" : "FAIL";

      return {
        ...base,
        status,
        weight: 0, // authoritative weight comes from the config snapshot
        subScores,
        rawSignals: analysis.metrics,
        evidence: [
          {
            type: "github_profile",
            label: "GitHub profile",
            value: candidate.githubHandle,
            url: analysis.profileSnapshot.htmlUrl ?? undefined,
            sourceRef: `github-analysis:${version}`,
          },
        ],
        flags: analysis.redFlags.map((message) => ({
          severity: "warn" as const,
          code: "footprint_red_flag",
          message,
        })),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ...base,
        status: "ERROR",
        weight: 0,
        subScores: [],
        rawSignals: null,
        evidence: [],
        flags: [
          {
            severity: "warn",
            code: "footprint_error",
            message: error instanceof Error ? error.message : "GitHub analysis failed.",
          },
        ],
        durationMs: Date.now() - started,
      };
    }
  },
};
