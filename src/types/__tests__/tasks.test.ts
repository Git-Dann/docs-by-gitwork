import { describe, expect, it } from "vitest";
import { buildTaskStatusCounts, TASK_STATUSES } from "@/types/tasks";

/**
 * `buildTaskStatusCounts` backs the Gantt bar's status-composition fill on
 * every surface that renders one (internal Tasks, wiki Timeline, the public
 * /timeline share) — a wrong count here would desync exactly the "internal
 * and client don't match" symptom this function exists to close.
 */
describe("buildTaskStatusCounts", () => {
  it("counts each status independently", () => {
    const counts = buildTaskStatusCounts([
      { status: "DONE" },
      { status: "DONE" },
      { status: "IN_REVIEW" },
      { status: "DOING" },
      { status: "TODO" },
      { status: "BACKLOG" },
    ]);
    expect(counts).toEqual({ BACKLOG: 1, TODO: 1, DOING: 1, IN_REVIEW: 1, DONE: 2 });
  });

  it("coalesces the retired UI_DONE status into IN_REVIEW", () => {
    const counts = buildTaskStatusCounts([{ status: "UI_DONE" }, { status: "IN_REVIEW" }]);
    expect(counts.IN_REVIEW).toBe(2);
    // The object never carries a UI_DONE key — it isn't one of TASK_STATUSES.
    expect(Object.keys(counts)).not.toContain("UI_DONE");
  });

  it("returns zero for every status on an empty task list", () => {
    const counts = buildTaskStatusCounts([]);
    for (const status of TASK_STATUSES) {
      expect(counts[status]).toBe(0);
    }
  });

  it("sums to the input length", () => {
    const tasks = [
      { status: "DONE" as const },
      { status: "UI_DONE" as const },
      { status: "DOING" as const },
      { status: "BACKLOG" as const },
      { status: "TODO" as const },
    ];
    const counts = buildTaskStatusCounts(tasks);
    const total = TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0);
    expect(total).toBe(tasks.length);
  });
});
