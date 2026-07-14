import { prisma } from "@/lib/prisma";
import {
  computeCalibration,
  deriveCriterion,
  type CalibrationReport,
  type CalibrationSample,
} from "@/lib/devsignal/calibration";
import { DEV_SIGNAL_STAGE_IDS } from "./stages/types";

/**
 * Builds the calibration report from live data: joins recorded delivery outcomes
 * to their assessments' score breakdowns and correlates each stage (and the
 * composite) against the outcome criterion. Pure math lives in
 * lib/devsignal/calibration.ts — this only does the DB read + shaping.
 */

interface DefaultConfigShape {
  stageWeights: Record<string, number>;
  enabledStages: string[];
}

/** The stages the current default config actually scores (enabled, weight > 0). */
async function predictiveStagesFor(workspaceId: string): Promise<string[]> {
  const def = await prisma.devSignalPipelineConfig.findFirst({
    where: { workspaceId, isDefault: true, clientId: null },
    select: { stageWeights: true, enabledStages: true },
  });
  if (!def) {
    // Fall back to the canonical stage set minus the aggregation stage.
    return DEV_SIGNAL_STAGE_IDS.filter((s) => s !== "score_report");
  }
  const cfg = { stageWeights: (def.stageWeights ?? {}) as Record<string, number>, enabledStages: (def.enabledStages ?? []) as string[] } satisfies DefaultConfigShape;
  return cfg.enabledStages.filter((s) => (cfg.stageWeights[s] ?? 0) > 0);
}

interface BreakdownStage {
  stageId: string;
  rawStageScore: number;
}

export async function getCalibrationReport(workspaceId: string): Promise<CalibrationReport> {
  const predictiveStages = await predictiveStagesFor(workspaceId);

  // Outcome links that have at least one structured signal recorded.
  const links = await prisma.devSignalOutcomeLink.findMany({
    where: {
      workspaceId,
      OR: [
        { clientRating: { not: null } },
        { retained: { not: null } },
        { churned: { not: null } },
        { tenureDays: { not: null } },
      ],
    },
    include: {
      assessment: { select: { finalScore: true, scoreBreakdown: true } },
    },
  });

  const samples: CalibrationSample[] = [];
  for (const link of links) {
    const criterion = deriveCriterion({
      retained: link.retained,
      tenureDays: link.tenureDays,
      clientRating: link.clientRating,
      churned: link.churned,
    });
    if (criterion === null) continue;

    const finalScore = link.assessment?.finalScore;
    const breakdown = link.assessment?.scoreBreakdown as { stages?: BreakdownStage[] } | null;
    if (typeof finalScore !== "number" || !breakdown?.stages) continue;

    const stageScores: Record<string, number> = {};
    for (const s of breakdown.stages) {
      if (typeof s.rawStageScore === "number") stageScores[s.stageId] = s.rawStageScore;
    }
    samples.push({ finalScore, stageScores, criterion });
  }

  return computeCalibration(samples, predictiveStages);
}
