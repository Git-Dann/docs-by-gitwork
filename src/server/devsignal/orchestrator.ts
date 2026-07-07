import type { DevSignalConfigSnapshot } from "./config";
import { computeScore, type DevSignalScoreBreakdown, type ScoringStageInput } from "./scoring";
import { toBestMatchLabel, type BestMatchLabel } from "./best-match";
import type { DevSignalStageRegistry } from "./stages/registry";
import { DEV_SIGNAL_STAGE_IDS } from "./stages/types";
import type {
  DevSignalStageContext,
  DevSignalStageId,
  DevSignalStageResultInput,
} from "./stages/types";

/**
 * The stage engine — pure orchestration (no IO). Persistence of StageResults,
 * audit events, and the assessment row happens in the assessment service
 * (Phase B), which calls these helpers. Keeping this layer pure makes the whole
 * engine unit-testable without a database.
 */

/** Ordered list of enabled stages to run, per the config snapshot. */
export function planStages(config: DevSignalConfigSnapshot): DevSignalStageId[] {
  return DEV_SIGNAL_STAGE_IDS.filter((id) => config.stages[id]?.enabled)
    .filter((id) => id !== "score_report") // aggregation stage isn't "run"
    .sort((a, b) => config.stages[a].order - config.stages[b].order);
}

/**
 * Run the planned stages in order. A runner that throws is captured as an ERROR
 * StageResult for that stage — one failing stage never aborts the whole run,
 * and re-running is safe (results are upserted by the caller).
 */
export async function runStages(args: {
  registry: DevSignalStageRegistry;
  context: DevSignalStageContext;
  stageIds: DevSignalStageId[];
}): Promise<DevSignalStageResultInput[]> {
  const { registry, context, stageIds } = args;
  const out: DevSignalStageResultInput[] = [];
  for (const stageId of stageIds) {
    const runner = registry.get(stageId);
    if (!runner) continue; // no runner registered yet → stage simply not produced
    try {
      out.push(await runner.run(context));
    } catch (error) {
      out.push({
        stageId,
        stageName: runner.stageName,
        stageVersion: runner.stageVersion,
        status: "ERROR",
        weight: 0,
        subScores: [],
        rawSignals: null,
        evidence: [],
        flags: [
          {
            severity: "warn",
            code: "stage_error",
            message: error instanceof Error ? error.message : "stage runner threw",
          },
        ],
        durationMs: 0,
      });
    }
  }
  return out;
}

export interface AssessmentSummary {
  breakdown: DevSignalScoreBreakdown;
  label: BestMatchLabel;
}

/**
 * Aggregate stage results into the final score + best-match label. This is what
 * stage 8 (score_report) records. The weight used is always the config
 * snapshot's, never the runner-reported weight.
 */
export function summarizeAssessment(
  config: DevSignalConfigSnapshot,
  stageResults: Array<Pick<DevSignalStageResultInput, "stageId" | "status" | "subScores" | "flags">>,
): AssessmentSummary {
  const scoringInputs: ScoringStageInput[] = stageResults.map((r) => ({
    stageId: r.stageId,
    status: r.status,
    subScores: r.subScores,
    flags: r.flags,
  }));
  const breakdown = computeScore(config, scoringInputs);
  return { breakdown, label: toBestMatchLabel(breakdown) };
}
