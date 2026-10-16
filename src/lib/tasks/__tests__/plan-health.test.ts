import { describe, expect, it } from "vitest";
import { computePlanHealth, planHealthWorthShowing, type PlanHealthTask } from "../plan-health";

const NOW = new Date("2026-10-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const pay = { id: "pay", name: "Payments" };

let seq = 0;
function t(o: Partial<PlanHealthTask>): PlanHealthTask {
  return {
    id: `t${seq++}`,
    status: "TODO",
    parentId: null,
    archivedAt: null,
    completedAt: null,
    updatedAt: daysAgo(1),
    featureBlock: null,
    ...o,
  };
}

describe("computePlanHealth", () => {
  it("splits the last 30 days' done work into on- and off-plan", () => {
    const h = computePlanHealth(
      [
        t({ status: "DONE", completedAt: daysAgo(2), featureBlock: pay }),
        t({ status: "DONE", completedAt: daysAgo(3) }),
        t({ status: "DONE", completedAt: daysAgo(4) }),
        t({ status: "DONE", completedAt: daysAgo(40) }), // outside the window
      ],
      NOW,
    );
    expect(h).toMatchObject({ doneInWindow: 3, donePlanned: 1, doneUnplanned: 2 });
  });

  it("⚠️ an ARCHIVED done task still counts — done work auto-archives and was still done", () => {
    const h = computePlanHealth([t({ status: "DONE", completedAt: daysAgo(2), archivedAt: daysAgo(1) })], NOW);
    expect(h.doneInWindow).toBe(1);
  });

  it("counts planned tasks left alone for 21+ days, and only open, unarchived ones", () => {
    const stale = t({ featureBlock: pay, updatedAt: daysAgo(25) });
    const h = computePlanHealth(
      [
        stale,
        t({ featureBlock: pay, updatedAt: daysAgo(5) }),
        t({ featureBlock: pay, updatedAt: daysAgo(40), archivedAt: daysAgo(1) }),
        t({ featureBlock: pay, status: "DONE", completedAt: daysAgo(40), updatedAt: daysAgo(40) }),
      ],
      NOW,
    );
    expect(h).toMatchObject({ plannedOpen: 2, plannedStale: 1, staleIds: [stale.id] });
  });

  it("subtasks are not counted — every progress figure in the app is top-level", () => {
    const h = computePlanHealth([t({ parentId: "p", status: "DONE", completedAt: daysAgo(1) })], NOW);
    expect(h.doneInWindow).toBe(0);
  });
});

describe("planHealthWorthShowing", () => {
  const base = computePlanHealth([], NOW);
  it("silent on a healthy board", () => {
    expect(planHealthWorthShowing({ ...base, doneInWindow: 40, donePlanned: 39, doneUnplanned: 1 })).toBe(false);
  });
  it("shows when a real share of the work was off the plan", () => {
    expect(planHealthWorthShowing({ ...base, doneInWindow: 150, donePlanned: 0, doneUnplanned: 150 })).toBe(true);
  });
  it("shows when planned work is left alone while other work is done", () => {
    expect(planHealthWorthShowing({ ...base, doneInWindow: 10, donePlanned: 10, plannedStale: 5 })).toBe(true);
  });
  it("a parked backlog on a quiet board is not a problem to flag", () => {
    expect(planHealthWorthShowing({ ...base, doneInWindow: 0, plannedStale: 20 })).toBe(false);
  });
});
