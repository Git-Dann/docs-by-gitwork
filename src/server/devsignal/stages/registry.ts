import type {
  DevSignalStageId,
  DevSignalStageResultInput,
  DevSignalStageRunner,
  DevSignalSubScore,
} from "./types";
import { DEV_SIGNAL_STAGE_NAMES } from "./types";
import type { DevSignalStageStatus } from "@prisma/client";

/**
 * Registry of stage runners, keyed by stageId. Real runners (GitHub footprint
 * wrap, coding challenge, video, identity, interview…) register here as they
 * land in later phases; the orchestrator only knows the interface.
 */
export class DevSignalStageRegistry {
  private readonly runners = new Map<DevSignalStageId, DevSignalStageRunner>();

  register(runner: DevSignalStageRunner): this {
    this.runners.set(runner.stageId, runner);
    return this;
  }

  get(stageId: DevSignalStageId): DevSignalStageRunner | null {
    return this.runners.get(stageId) ?? null;
  }

  has(stageId: DevSignalStageId): boolean {
    return this.runners.has(stageId);
  }

  list(): DevSignalStageRunner[] {
    return [...this.runners.values()];
  }
}

/**
 * A deterministic placeholder runner used in tests and until a real runner for
 * a stage is implemented. It emits a well-formed StageResult so the engine +
 * scoring are exercisable end-to-end.
 */
export function createMockStageRunner(
  stageId: DevSignalStageId,
  opts: {
    status?: DevSignalStageStatus;
    subScores?: DevSignalSubScore[];
    stageVersion?: string;
  } = {},
): DevSignalStageRunner {
  const status = opts.status ?? "PASS";
  const subScores =
    opts.subScores ??
    [{ key: "mock", label: "Mock signal", score: status === "PASS" ? 100 : status === "WARN" ? 60 : 0, maxScore: 100 }];
  return {
    stageId,
    stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
    stageVersion: opts.stageVersion ?? "mock-v1",
    async run(): Promise<DevSignalStageResultInput> {
      return {
        stageId,
        stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
        stageVersion: opts.stageVersion ?? "mock-v1",
        status,
        weight: 0, // authoritative weight comes from the config snapshot, not the runner
        subScores,
        rawSignals: { mock: true },
        evidence: [],
        flags: [],
        durationMs: 0,
      };
    },
  };
}

/** A registry pre-populated with mock runners for every stage (tests/local). */
export function createMockRegistry(): DevSignalStageRegistry {
  const registry = new DevSignalStageRegistry();
  (Object.keys(DEV_SIGNAL_STAGE_NAMES) as DevSignalStageId[]).forEach((stageId) => {
    registry.register(createMockStageRunner(stageId));
  });
  return registry;
}
