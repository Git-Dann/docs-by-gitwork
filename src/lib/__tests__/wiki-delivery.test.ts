import { describe, expect, it } from "vitest";
import {
  phaseRows,
  summariseDelivery,
  type DeliveryBlock,
  type DeliveryTaskStatus,
} from "@/lib/wiki-delivery";

const counts = (over: Partial<Record<DeliveryTaskStatus, number>> = {}) => ({
  BACKLOG: 0,
  TODO: 0,
  DOING: 0,
  IN_REVIEW: 0,
  UI_DONE: 0,
  DONE: 0,
  ...over,
});

const block = (id: string, over: Partial<DeliveryBlock> = {}): DeliveryBlock => ({
  id,
  name: id,
  progress: 0,
  statusCounts: counts(),
  ...over,
});

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("summariseDelivery", () => {
  it("adds up done and total across every phase", () => {
    const out = summariseDelivery({
      blocks: [
        block("a", { statusCounts: counts({ DONE: 6, DOING: 2 }) }),
        block("b", { statusCounts: counts({ DONE: 3, TODO: 1 }) }),
      ],
      milestones: [],
      blockers: [],
      now: NOW,
    });
    expect(out.done).toBe(9);
    expect(out.total).toBe(12);
    expect(out.percent).toBe(75);
  });

  it("reports NO timeline as null, never as 0%", () => {
    // "Nobody has built a plan" and "the plan is 0% done" are different facts. Reporting
    // the first as the second is the §35 mistake, and it is the one a client would act on.
    const out = summariseDelivery({ blocks: [], milestones: [], blockers: [], now: NOW });
    expect(out.percent).toBeNull();
    expect(out.noTimeline).toBe(true);
    expect(out.percent).not.toBe(0);
  });

  it("distinguishes a real 0% from no timeline", () => {
    const out = summariseDelivery({
      blocks: [block("a", { statusCounts: counts({ TODO: 4 }) })],
      milestones: [],
      blockers: [],
      now: NOW,
    });
    expect(out.percent).toBe(0);
    expect(out.noTimeline).toBe(false);
  });

  it("does not count an EMPTY phase as complete", () => {
    // 0 of 0 is not 100%. A plan with unbroken-down phases would otherwise report as
    // finished, which is the single most misleading thing this page could say.
    const out = summariseDelivery({
      blocks: [block("empty"), block("done", { statusCounts: counts({ DONE: 2 }) })],
      milestones: [],
      blockers: [],
      now: NOW,
    });
    expect(out.phasesComplete).toBe(1);
    expect(out.phasesNotStarted).toBe(1);
  });

  it("splits phases into complete, in flight and not started", () => {
    const out = summariseDelivery({
      blocks: [
        block("a", { statusCounts: counts({ DONE: 3 }) }),
        block("b", { statusCounts: counts({ DONE: 1, DOING: 2 }) }),
        block("c", { statusCounts: counts({ TODO: 5 }) }),
      ],
      milestones: [],
      blockers: [],
      now: NOW,
    });
    expect(out).toMatchObject({ phasesComplete: 1, phasesInFlight: 1, phasesNotStarted: 1 });
    expect(out.phasesComplete + out.phasesInFlight + out.phasesNotStarted).toBe(3);
  });

  it("counts UI_DONE as not done rather than dropping it from the total", () => {
    // buildTaskStatusCounts normally folds UI_DONE into IN_REVIEW, so this is a legacy
    // row. Omitting it would make a phase's counts not sum to its task count, which is
    // worse than a slightly conservative percentage.
    const out = summariseDelivery({
      blocks: [block("a", { statusCounts: counts({ DONE: 1, UI_DONE: 1 }) })],
      milestones: [],
      blockers: [],
      now: NOW,
    });
    expect(out.total).toBe(2);
    expect(out.done).toBe(1);
    expect(out.percent).toBe(50);
  });

  it("finds the next milestone still ahead and counts the rest as hit", () => {
    const out = summariseDelivery({
      blocks: [],
      milestones: [
        { id: "m1", name: "Beta", date: "2026-08-01T00:00:00.000Z" },
        { id: "m3", name: "GA", date: "2026-12-01T00:00:00.000Z" },
        { id: "m2", name: "Store submission", date: "2026-10-01T00:00:00.000Z" },
      ],
      blockers: [],
      now: NOW,
    });
    // Nearest-ahead, not first-in-list — the input order is the author's, not a date order.
    expect(out.nextMilestone?.name).toBe("Store submission");
    expect(out.milestonesHit).toBe(1);
    expect(out.milestonesAhead).toBe(2);
  });

  it("has no next milestone when every one is behind us", () => {
    const out = summariseDelivery({
      blocks: [],
      milestones: [{ id: "m1", name: "Beta", date: "2026-01-01T00:00:00.000Z" }],
      blockers: [],
      now: NOW,
    });
    expect(out.nextMilestone).toBeNull();
    expect(out.milestonesAhead).toBe(0);
  });

  it("counts only UNANSWERED blockers as waiting on the client", () => {
    // One they have replied to is ours again. Counting it as "waiting on you" would put
    // work back on a client who has already done their part.
    const out = summariseDelivery({
      blocks: [],
      milestones: [],
      blockers: [
        { taskId: "t1", blockedResponse: null },
        { taskId: "t2", blockedResponse: "Sent the API key over" },
        { taskId: "t3", blockedResponse: null },
      ],
      now: NOW,
    });
    expect(out.waitingOnClient).toBe(2);
  });

  it("is deterministic for a given `now`", () => {
    const input = {
      blocks: [block("a", { statusCounts: counts({ DONE: 1, TODO: 1 }) })],
      milestones: [{ id: "m", name: "GA", date: "2026-12-01T00:00:00.000Z" }],
      blockers: [],
      now: NOW,
    };
    expect(summariseDelivery(input)).toEqual(summariseDelivery(input));
  });
});

describe("phaseRows", () => {
  it("gives each phase its own done/total", () => {
    const rows = phaseRows([
      block("a", { name: "Discovery", statusCounts: counts({ DONE: 4 }) }),
      block("b", { name: "Build", statusCounts: counts({ DONE: 2, DOING: 6 }) }),
    ]);
    expect(rows).toEqual([
      { id: "a", name: "Discovery", done: 4, total: 4, percent: 100 },
      { id: "b", name: "Build", done: 2, total: 8, percent: 25 },
    ]);
  });

  it("gives a phase with no tasks a null percentage, not 0%", () => {
    // 0% says something untrue about work nobody has broken down yet.
    expect(phaseRows([block("empty")])[0].percent).toBeNull();
  });

  it("keeps the author's phase order", () => {
    const rows = phaseRows([block("z", { name: "Z" }), block("a", { name: "A" })]);
    expect(rows.map((r) => r.name)).toEqual(["Z", "A"]);
  });
});

describe("a block with no statusCounts", () => {
  // Found by rendering the demo wiki: its timeline blocks carry NO `statusCounts` at all
  // (the fixture is cast `as unknown as WikiDTO["timeline"]`, so tsc said nothing), and
  // reading `.DONE` off undefined threw inside WikiDashboard on first paint.
  const withTasks = {
    id: "a",
    name: "Foundations",
    progress: 100,
    tasks: [{ done: true }, { done: true }, { done: false }],
  };

  it("counts from the tasks list instead of throwing", () => {
    const out = summariseDelivery({ blocks: [withTasks], milestones: [], blockers: [], now: NOW });
    expect(out.done).toBe(2);
    expect(out.total).toBe(3);
    expect(out.percent).toBe(67);
  });

  it("prefers statusCounts when BOTH are present", () => {
    // They are the same facts at two grains, not two sources of truth — the finer one
    // wins, so a block that carries both can never report two different answers.
    const both = { ...withTasks, statusCounts: counts({ DONE: 5, TODO: 5 }) };
    const out = summariseDelivery({ blocks: [both], milestones: [], blockers: [], now: NOW });
    expect(out.total).toBe(10);
    expect(out.done).toBe(5);
  });

  it("survives a block with neither, rather than crashing the page", () => {
    const bare = { id: "x", name: "Bare", progress: 0 };
    const out = summariseDelivery({ blocks: [bare], milestones: [], blockers: [], now: NOW });
    expect(out.total).toBe(0);
    expect(out.percent).toBeNull();
    expect(out.phasesNotStarted).toBe(1);
  });
});
