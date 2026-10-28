// The rules behind the Pulse findings list (src/lib/pulse-findings.ts). Each rule is tested
// both ways: the input that must produce the stage, and a neighbouring one that must not.

import { describe, expect, it } from "vitest";
import { buildFindings, countByView, countOpenFindings, findingTask, stageLabel, type FindingState, type FindingTask } from "@/lib/pulse-findings";

const check = (checkKey: string, status: string, label = checkKey) => ({ checkKey, label, category: "Security", status, detail: `${label} detail` });
const state = (checkKey: string, patch: Partial<FindingState> = {}): FindingState => ({
  checkKey, decision: null, note: null, taskId: null, decidedByName: null, decidedAt: null, ...patch,
});
const task = (id: string, status: string): FindingTask => ({ id, status, title: id, assigneeName: null });
const stageOf = (findings: ReturnType<typeof buildFindings>, key: string) => findings.find((f) => f.check.checkKey === key)?.stage;

describe("what a finding is", () => {
  it("a failing or warning check is an open finding; a passing one with no history is not a finding at all", () => {
    const f = buildFindings([check("a", "FAIL"), check("b", "WARN"), check("c", "PASS")], [], []);
    expect(stageOf(f, "a")).toBe("open");
    expect(stageOf(f, "b")).toBe("open");
    expect(stageOf(f, "c")).toBeUndefined();
  });
  it("a check Pulse could not establish is 'couldn't check', never open", () => {
    const f = buildFindings([check("a", "INCONCLUSIVE"), check("b", "ERROR"), check("c", "NOT_TESTED")], [], []);
    expect(f.map((x) => x.stage)).toEqual(["unchecked", "unchecked", "unchecked"]);
  });
  it("a check that does not apply is left out entirely", () => {
    expect(buildFindings([check("a", "SKIPPED"), check("b", "NOT_APPLICABLE")], [], [])).toEqual([]);
  });
});

describe("decisions carry, and fixed is derived", () => {
  it("accepted risk and not-a-real-issue move a failing check out of open", () => {
    const f = buildFindings([check("a", "FAIL"), check("b", "WARN")], [state("a", { decision: "ACCEPTED_RISK" }), state("b", { decision: "FALSE_POSITIVE" })], []);
    expect(stageOf(f, "a")).toBe("accepted");
    expect(stageOf(f, "b")).toBe("false_positive");
  });
  it("a decision outranks a task on the board", () => {
    const f = buildFindings([check("a", "FAIL")], [state("a", { decision: "ACCEPTED_RISK", taskId: "t1" })], [task("t1", "DOING")]);
    expect(stageOf(f, "a")).toBe("accepted");
  });
  it("a check that passes now is fixed when the team had acted on it, or it failed last scan", () => {
    expect(stageOf(buildFindings([check("a", "PASS")], [state("a", { taskId: "t1" })], [task("t1", "DONE")]), "a")).toBe("fixed");
    expect(stageOf(buildFindings([check("a", "PASS")], [], [], new Set(["a"])), "a")).toBe("fixed");
  });
  it("a fixed check is not claimed from nothing: no decision, no task and no previous failure means no finding", () => {
    expect(stageOf(buildFindings([check("a", "PASS")], [], [], new Set(["other"])), "a")).toBeUndefined();
  });
});

describe("the board", () => {
  it("a task not done is in progress", () => {
    expect(stageOf(buildFindings([check("a", "FAIL")], [state("a", { taskId: "t1" })], [task("t1", "TODO")]), "a")).toBe("in_progress");
  });
  it("a task marked done while the check still fails says so rather than claiming fixed", () => {
    const f = buildFindings([check("a", "FAIL")], [state("a", { taskId: "t1" })], [task("t1", "DONE")]);
    expect(stageOf(f, "a")).toBe("task_done");
    expect(stageLabel(f[0])).toBe("Task done, still failing");
  });
  it("a task id with no task behind it (deleted from the board) is open again", () => {
    expect(stageOf(buildFindings([check("a", "FAIL")], [state("a", { taskId: "gone" })], []), "a")).toBe("open");
  });
  it("the task a finding becomes carries its check, so the board can link back", () => {
    const t = findingTask({ ...check("csp_header", "FAIL", "Content-Security-Policy"), evidence: "none sent" }, "scan1");
    expect(t.title).toBe("[Pulse] Content-Security-Policy");
    expect(t.priority).toBe("HIGH");
    expect(t.metadata).toMatchObject({ source: "pulse_scan", pulseScanId: "scan1", pulseCheckKey: "csp_header" });
    expect(t.description).toContain("none sent");
    expect(findingTask(check("x", "WARN"), "s").priority).toBe("MEDIUM");
  });
});

describe("the views", () => {
  it("count every finding into exactly one view, with 'task done, still failing' kept open", () => {
    const f = buildFindings(
      [check("a", "FAIL"), check("b", "WARN"), check("c", "FAIL"), check("d", "PASS"), check("e", "INCONCLUSIVE"), check("g", "FAIL")],
      [state("b", { taskId: "t1" }), state("c", { decision: "FALSE_POSITIVE" }), state("g", { taskId: "t2" })],
      [task("t1", "DOING"), task("t2", "DONE")],
      new Set(["d"]),
    );
    const counts = countByView(f);
    expect(counts).toEqual({ open: 2, in_progress: 1, fixed: 1, dismissed: 1, unchecked: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(f.length);
  });

  it("the Projects list's open count agrees with the Findings tab's Open view", () => {
    const checks = [check("a", "FAIL"), check("b", "WARN"), check("c", "FAIL"), check("d", "PASS"), check("g", "FAIL")];
    const states = [state("b", { taskId: "t1" }), state("c", { decision: "ACCEPTED_RISK" }), state("g", { taskId: "t2" })];
    const tasks = [task("t1", "DOING"), task("t2", "DONE")];
    expect(countOpenFindings(checks, states, tasks)).toBe(countByView(buildFindings(checks, states, tasks)).open);
    expect(countOpenFindings(checks, states, tasks)).toBe(2); // a, and g (task done, still failing)
    expect(countOpenFindings(checks, [], [])).toBe(4);
  });
});
