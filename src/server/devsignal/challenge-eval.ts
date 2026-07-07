import type { DevSignalStageStatus } from "@prisma/client";
import type { DevSignalFlag, DevSignalSubScore } from "./stages/types";
import type { TelemetrySummary } from "./telemetry";

/**
 * Turns a browser-run challenge attempt into coding_challenge sub-scores. Pure +
 * testable. Scores test performance, delivery-under-time, and process (iteration
 * / running tests). AI/paste use is NOT penalised — a very high paste ratio is
 * only surfaced as an info flag for the human reviewer.
 */

export interface ChallengeEvalInput {
  testsPassed: number;
  testsTotal: number;
  timeTakenSec: number;
  timeLimitSec: number;
  telemetry: TelemetrySummary;
}

export interface ChallengeEvalResult {
  status: DevSignalStageStatus;
  subScores: DevSignalSubScore[];
  flags: DevSignalFlag[];
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function evaluateChallenge(input: ChallengeEvalInput): ChallengeEvalResult {
  const passRate = input.testsTotal > 0 ? (input.testsPassed / input.testsTotal) * 100 : 0;

  // Delivery under time: full marks if comfortably inside the limit, tapering to
  // 0 as time runs over.
  const timeRatio = input.timeLimitSec > 0 ? input.timeTakenSec / input.timeLimitSec : 1;
  const deliveryUnderTime = clamp(Math.round(120 - timeRatio * 100));

  // Process: reward running tests (iteration) + genuine editing. Neutral on paste.
  const t = input.telemetry;
  const ranTests = Math.min(40, t.runCount * 15); // up to 40 for iterating
  const engaged = t.typedChars > 0 || t.pastedChars > 0 ? 40 : 0;
  const focusPenalty = Math.min(20, t.focusLossCount * 5);
  const process = clamp(20 + ranTests + engaged - focusPenalty);

  const flags: DevSignalFlag[] = [];
  if (t.pasteRatio >= 0.8 && t.pastedChars > 200) {
    flags.push({
      severity: "info",
      code: "high_paste_ratio",
      message: `High paste ratio (${Math.round(t.pasteRatio * 100)}%) — expected with AI assistance; note for the live follow-up.`,
    });
  }
  if (t.runCount === 0) {
    flags.push({ severity: "info", code: "no_test_runs", message: "Submitted without running the tests." });
  }
  if (timeRatio > 1) {
    flags.push({ severity: "warn", code: "over_time", message: "Submitted after the time limit." });
  }

  const status: DevSignalStageStatus = passRate >= 70 ? "PASS" : passRate >= 40 ? "WARN" : "FAIL";

  return {
    status,
    subScores: [
      { key: "test_performance", label: "Test performance", score: Math.round(passRate), maxScore: 100, rationale: `${input.testsPassed}/${input.testsTotal} tests passed` },
      { key: "delivery_under_time", label: "Delivery under time", score: deliveryUnderTime, maxScore: 100, rationale: `${input.timeTakenSec}s of ${input.timeLimitSec}s` },
      { key: "process", label: "Process", score: process, maxScore: 100, rationale: `${t.runCount} test runs, ${t.focusLossCount} focus losses` },
    ],
    flags,
  };
}
