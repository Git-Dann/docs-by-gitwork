import { describe, expect, it } from "vitest";
import {
  burnSeries,
  monthSlices,
  overlappingProjects,
  projectFigures,
  projectOfTask,
  readProjectStatus,
  spendToDate,
  timeElapsed,
  verdict,
  weekdaysBetween,
  workProgress,
  dayOf,
  type PlacementCost,
} from "@/lib/project-budget";
import type { FxRates } from "@/lib/money";

const GBP: FxRates = { base: "GBP", rates: { USD: 0.8 }, asOf: "2026-11-20", error: null };
const d = (s: string) => dayOf(s);

function dev(over: Partial<PlacementCost> = {}): PlacementCost {
  return { candidateId: "a", start: "2026-01-01", end: null, monthly: 4400, currency: "GBP", proBono: false, ...over };
}

describe("weekdays", () => {
  it("counts Mon–Fri inclusive", () => {
    // Mon 2 Nov 2026 to Sun 8 Nov 2026: five weekdays.
    expect(weekdaysBetween(d("2026-11-02"), d("2026-11-08"))).toBe(5);
    expect(weekdaysBetween(d("2026-11-07"), d("2026-11-08"))).toBe(0);
    expect(weekdaysBetween(d("2026-11-09"), d("2026-11-02"))).toBe(0);
  });

  it("splits a range over calendar months", () => {
    const s = monthSlices(d("2026-10-26"), d("2026-11-06"));
    expect(s.map((x) => x.month)).toEqual(["2026-10", "2026-11"]);
    expect(s[0].days).toBe(5); // 26–30 Oct
    expect(s[1].days).toBe(5); // 2–6 Nov
    expect(s[0].monthDays).toBe(22);
  });
});

describe("spend to date", () => {
  const now = new Date("2026-11-30T12:00:00Z");

  it("charges a whole month's rate for a whole month on the client", () => {
    const s = spendToDate({ placements: [dev()], start: "2026-11-01", end: "2026-11-30", now, fx: GBP });
    expect(s.amount).toBe(4400);
    expect(s.pricedDevs).toBe(1);
  });

  it("prorates by weekdays inside the project's dates", () => {
    // November 2026 has 21 weekdays; 2–6 Nov is 5 of them.
    const s = spendToDate({ placements: [dev()], start: "2026-11-02", end: "2026-11-06", now, fx: GBP });
    expect(s.amount).toBeCloseTo((4400 * 5) / 21, 2);
  });

  it("stops at today, not at the end date", () => {
    const early = new Date("2026-11-06T12:00:00Z");
    const s = spendToDate({ placements: [dev()], start: "2026-11-02", end: "2026-12-31", now: early, fx: GBP });
    expect(s.amount).toBeCloseTo((4400 * 5) / 21, 2);
  });

  it("only charges the days a placement overlaps", () => {
    const s = spendToDate({ placements: [dev({ start: "2026-11-09", end: "2026-11-13" })], start: "2026-11-01", end: "2026-11-30", now, fx: GBP });
    expect(s.amount).toBeCloseTo((4400 * 5) / 21, 2);
  });

  it("never charges one developer twice for the same day", () => {
    const two = [dev({ start: "2026-11-01", end: "2026-11-30" }), dev({ start: "2026-11-15", end: null })];
    const s = spendToDate({ placements: two, start: "2026-11-01", end: "2026-11-30", now, fx: GBP });
    expect(s.amount).toBe(4400);
    expect(s.pricedDevs).toBe(1);
  });

  it("leaves out pro-bono developers entirely", () => {
    const s = spendToDate({ placements: [dev({ proBono: true })], start: "2026-11-01", end: "2026-11-30", now, fx: GBP });
    expect(s.amount).toBe(0);
    expect(s.pricedDevs + s.unpricedDevs).toBe(0);
  });

  it("counts a developer with no rate instead of treating them as free", () => {
    const s = spendToDate({ placements: [dev({ monthly: null, candidateId: "b" }), dev()], start: "2026-11-01", end: "2026-11-30", now, fx: GBP });
    expect(s.amount).toBe(4400);
    expect(s.unpricedDevs).toBe(1);
  });

  it("converts other currencies and lists what it can't convert", () => {
    const s = spendToDate({
      placements: [dev({ currency: "USD", monthly: 5000 }), dev({ candidateId: "c", currency: "PKR", monthly: 100 })],
      start: "2026-11-01",
      end: "2026-11-30",
      now,
      fx: GBP,
    });
    expect(s.amount).toBe(4000);
    expect(s.unconverted).toEqual({ PKR: 100 });
  });

  it("ignores placements outside the dates", () => {
    const s = spendToDate({ placements: [dev({ start: "2025-01-01", end: "2025-06-01" })], start: "2026-11-01", end: null, now, fx: GBP });
    expect(s.amount).toBe(0);
    expect(s.pricedDevs).toBe(0);
  });
});

describe("work done", () => {
  it("is null with no tasks, never 0%", () => {
    expect(workProgress([]).share).toBeNull();
    expect(workProgress([]).estimate).toBeNull();
  });

  it("counts done tasks and sums estimates", () => {
    const p = workProgress([
      { done: true, estimateHours: 8 },
      { done: false, estimateHours: 12 },
      { done: false, estimateHours: null },
    ]);
    expect(p.share).toBeCloseTo(1 / 3);
    expect(p.estimate).toEqual({ total: 20, done: 8, remaining: 12, unestimated: 1 });
  });
});

describe("time elapsed", () => {
  it("is null with no end date", () => {
    expect(timeElapsed("2026-01-01", null, new Date("2026-06-01"))).toBeNull();
  });
  it("is clamped to 0 and 1", () => {
    expect(timeElapsed("2026-01-01", "2026-12-31", new Date("2025-06-01"))).toBe(0);
    expect(timeElapsed("2026-01-01", "2026-12-31", new Date("2027-06-01"))).toBe(1);
    expect(timeElapsed("2026-01-01", "2026-01-11", new Date("2026-01-06"))).toBeCloseTo(0.5);
  });
});

describe("verdict", () => {
  const base = { budget: 10000, spent: 4000, workShare: 0.4, timeShare: 0.4, started: true };
  it("says when there is no budget", () => {
    expect(verdict({ ...base, budget: null }).kind).toBe("no_budget");
  });
  it("is on budget when burn keeps pace with work", () => {
    expect(verdict(base).kind).toBe("on_budget");
  });
  it("calls out burning faster than work", () => {
    expect(verdict({ ...base, spent: 6000, workShare: 0.3 }).text).toBe("Burning faster than work is getting done.");
  });
  it("allows some slack before calling it out", () => {
    expect(verdict({ ...base, spent: 5000, workShare: 0.4 }).kind).toBe("on_budget");
  });
  it("says over budget once spend passes it", () => {
    expect(verdict({ ...base, spent: 10001, workShare: 1 }).kind).toBe("over");
  });
  it("falls back to time when there are no tasks", () => {
    expect(verdict({ ...base, spent: 7000, workShare: null, timeShare: 0.3 }).kind).toBe("ahead_of_time");
  });
  it("won't judge spend it couldn't price", () => {
    expect(verdict({ ...base, spent: null }).kind).toBe("no_spend");
  });
});

describe("project figures", () => {
  const now = new Date("2026-11-30T12:00:00Z");
  const progress = workProgress([{ done: true, estimateHours: null }]);

  it("says spend can't be worked out when every developer is unpriced", () => {
    const f = projectFigures({
      start: "2026-11-01",
      end: "2026-12-31",
      now,
      budget: { amount: 20000, currency: "GBP", source: "document" },
      placements: [dev({ monthly: null })],
      fx: GBP,
      progress,
    });
    expect(f.spent).toBeNull();
    expect(f.verdict.kind).toBe("no_spend");
    expect(f.unpricedDevs).toBe(1);
  });

  it("is £0 spent when nobody was placed", () => {
    const f = projectFigures({ start: "2026-11-01", end: null, now, budget: null, placements: [], fx: GBP, progress });
    expect(f.spent).toBe(0);
    expect(f.verdict.kind).toBe("no_budget");
  });

  it("works out burned against the budget", () => {
    const f = projectFigures({
      start: "2026-11-01",
      end: "2026-12-31",
      now,
      budget: { amount: 8800, currency: "GBP", source: "manual" },
      placements: [dev()],
      fx: GBP,
      progress,
    });
    expect(f.spent).toBe(4400);
    expect(f.burned).toBeCloseTo(0.5);
    expect(f.budgetSource).toBe("manual");
  });

  it("converts a budget in another currency and drops it when there's no rate", () => {
    const f = projectFigures({ start: "2026-11-01", end: null, now, budget: { amount: 1000, currency: "JPY", source: "manual" }, placements: [], fx: GBP, progress });
    expect(f.budget).toBeNull();
    expect(f.unconverted).toEqual({ JPY: 1000 });
  });
});

describe("burn series", () => {
  it("runs the plan evenly to the budget and stops actual spend at this month", () => {
    const s = burnSeries({
      start: "2026-10-01",
      end: "2026-12-31",
      now: new Date("2026-11-15T00:00:00Z"),
      budget: 9000,
      byMonth: [
        { month: "2026-10", amount: 3000 },
        { month: "2026-11", amount: 1500 },
      ],
    });
    expect(s.map((p) => p.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(s[0].spent).toBe(3000);
    expect(s[1].spent).toBe(4500);
    expect(s[2].spent).toBeNull();
    expect(s[2].planned).toBe(9000);
  });
});

describe("which project a task belongs to", () => {
  const releases = new Map([["r1", "p-release"]]);
  const blocks = new Map([["b1", "p-block"]]);
  it("prefers its own link, then its release, then its category", () => {
    expect(projectOfTask({ projectId: "p-own", releaseId: "r1", featureBlockId: "b1" }, releases, blocks)).toBe("p-own");
    expect(projectOfTask({ projectId: null, releaseId: "r1", featureBlockId: "b1" }, releases, blocks)).toBe("p-release");
    expect(projectOfTask({ projectId: null, releaseId: "r2", featureBlockId: "b1" }, releases, blocks)).toBe("p-block");
    expect(projectOfTask({ projectId: null, releaseId: null, featureBlockId: null }, releases, blocks)).toBeNull();
  });
});

describe("projects sharing a team", () => {
  it("names other projects whose dates overlap", () => {
    const a = { id: "a", name: "Build", startDate: "2026-01-01", endDate: "2026-06-30" };
    const b = { id: "b", name: "Support", startDate: "2026-06-01", endDate: null };
    const c = { id: "c", name: "Discovery", startDate: "2025-01-01", endDate: "2025-03-01" };
    expect(overlappingProjects(a, [a, b, c])).toEqual(["Support"]);
  });
});

describe("status", () => {
  it("reads an unknown stored status as Planned", () => {
    expect(readProjectStatus("WAT")).toBe("PLANNED");
    expect(readProjectStatus("ON_HOLD")).toBe("ON_HOLD");
  });
});
