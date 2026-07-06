import { describe, it, expect } from "vitest";
import { CHALLENGES, defaultChallenge, getChallenge, toPublicChallenge } from "../challenges";
import { summarizeTelemetry, type TelemetryEvent } from "../telemetry";
import { evaluateChallenge } from "../challenge-eval";

describe("challenge catalog", () => {
  it("sends the full suite (browser-run) with hidden flags for UI display", () => {
    const c = defaultChallenge();
    const pub = toPublicChallenge(c);
    expect(pub.testCount).toBe(c.tests.length);
    expect(pub.tests.length).toBe(c.tests.length);
    // At least one test is flagged hidden (detailed as an example: false).
    expect(pub.tests.some((t) => t.hidden)).toBe(true);
    expect(pub.tests.some((t) => !t.hidden)).toBe(true);
  });
  it("looks up by id", () => {
    expect(getChallenge(CHALLENGES[0].id)?.id).toBe(CHALLENGES[0].id);
    expect(getChallenge("nope")).toBeNull();
  });
});

describe("summarizeTelemetry", () => {
  it("aggregates events + computes paste ratio", () => {
    const events: TelemetryEvent[] = [
      { t: 500, type: "keystroke", size: 1 },
      { t: 600, type: "keystroke", size: 1 },
      { t: 700, type: "paste", size: 8 },
      { t: 900, type: "run" },
      { t: 1000, type: "blur" },
    ];
    const s = summarizeTelemetry(events);
    expect(s.keystrokes).toBe(2);
    expect(s.typedChars).toBe(2);
    expect(s.pasteCount).toBe(1);
    expect(s.pastedChars).toBe(8);
    expect(s.runCount).toBe(1);
    expect(s.focusLossCount).toBe(1);
    expect(s.timeToFirstEditMs).toBe(500);
    expect(s.pasteRatio).toBe(0.8); // 8 / (2 + 8)
    expect(s.totalMs).toBe(1000);
  });
  it("is safe on empty input", () => {
    const s = summarizeTelemetry([]);
    expect(s.pasteRatio).toBe(0);
    expect(s.timeToFirstEditMs).toBeNull();
  });
});

describe("evaluateChallenge", () => {
  const telemetry = summarizeTelemetry([
    { t: 100, type: "keystroke", size: 50 },
    { t: 200, type: "run" },
    { t: 300, type: "run" },
  ]);

  it("full pass within time → PASS with strong sub-scores", () => {
    const r = evaluateChallenge({ testsPassed: 5, testsTotal: 5, timeTakenSec: 300, timeLimitSec: 1500, telemetry });
    expect(r.status).toBe("PASS");
    expect(r.subScores.find((s) => s.key === "test_performance")?.score).toBe(100);
    expect(r.subScores.find((s) => s.key === "process")?.score).toBeGreaterThan(60);
  });

  it("low pass rate → FAIL", () => {
    const r = evaluateChallenge({ testsPassed: 1, testsTotal: 5, timeTakenSec: 300, timeLimitSec: 1500, telemetry });
    expect(r.status).toBe("FAIL");
  });

  it("over the time limit flags a warning", () => {
    const r = evaluateChallenge({ testsPassed: 5, testsTotal: 5, timeTakenSec: 2000, timeLimitSec: 1500, telemetry });
    expect(r.flags.some((f) => f.code === "over_time")).toBe(true);
  });

  it("high paste ratio is an INFO flag, not a penalty (AI use is allowed)", () => {
    const pasteHeavy = summarizeTelemetry([
      { t: 100, type: "paste", size: 400 },
      { t: 200, type: "run" },
    ]);
    const r = evaluateChallenge({ testsPassed: 5, testsTotal: 5, timeTakenSec: 300, timeLimitSec: 1500, telemetry: pasteHeavy });
    const flag = r.flags.find((f) => f.code === "high_paste_ratio");
    expect(flag?.severity).toBe("info");
    expect(r.status).toBe("PASS"); // not penalised
  });
});
