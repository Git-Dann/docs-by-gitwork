import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  celebratedFrom,
  countOnThePlan,
  countOnTime,
  newlyReached,
  parseCelebrated,
  progressFor,
  standupStreak,
} from "@/lib/achievements";

const def = (id: string) => ACHIEVEMENTS.find((d) => d.id === id)!;

describe("progressFor", () => {
  it("names the tier reached and the share towards the next", () => {
    const p = progressFor(def("standup-streak"), 12);
    expect(p.tier).toBe("bronze");
    expect(p.next).toBe(20);
    expect(p.share).toBeCloseTo((12 - 5) / 15);
    expect(progressFor(def("standup-streak"), 3).tier).toBeNull();
    const gold = progressFor(def("standup-streak"), 99);
    expect([gold.tier, gold.next, gold.share]).toEqual(["gold", null, 1]);
  });
});

describe("standupStreak", () => {
  // Friday 20 Nov 2026.
  const today = new Date("2026-11-20T15:00:00Z");

  it("skips weekends, leave and bank holidays without breaking the run", () => {
    const posted = new Set(["2026-11-20", "2026-11-19", "2026-11-17", "2026-11-16", "2026-11-13"]);
    const daysOff = new Set(["2026-11-18"]); // a day off midweek
    expect(standupStreak({ posted, daysOff, today, days: 30 })).toEqual({ current: 5, best: 5 });
  });

  it("doesn't count today as missed before it's posted", () => {
    const posted = new Set(["2026-11-19", "2026-11-18"]);
    expect(standupStreak({ posted, daysOff: new Set(), today, days: 30 }).current).toBe(2);
  });

  it("a missed working day ends the current run but the best is kept", () => {
    const posted = new Set(["2026-11-20", "2026-11-12", "2026-11-11", "2026-11-10"]);
    expect(standupStreak({ posted, daysOff: new Set(), today, days: 30 })).toEqual({ current: 1, best: 3 });
  });
});

describe("tasks", () => {
  const t = (createdAt: string, completedAt: string, dueDate: string | null, planned: boolean) => ({ createdAt, completedAt, dueDate, planned });

  it("only counts planned work that existed before the day it was finished", () => {
    expect(
      countOnThePlan([
        t("2026-11-01T09:00:00Z", "2026-11-03T09:00:00Z", null, true),
        t("2026-11-03T09:00:00Z", "2026-11-03T17:00:00Z", null, true), // made and closed the same day
        t("2026-11-01T09:00:00Z", "2026-11-03T09:00:00Z", null, false), // not on the plan
      ]),
    ).toBe(1);
  });

  it("counts finishing on or before the due day, ignoring tasks with no due date", () => {
    expect(
      countOnTime([
        t("2026-11-01T00:00:00Z", "2026-11-05T23:00:00Z", "2026-11-05T00:00:00Z", false),
        t("2026-11-01T00:00:00Z", "2026-11-06T09:00:00Z", "2026-11-05T00:00:00Z", false),
        t("2026-11-01T00:00:00Z", "2026-11-06T09:00:00Z", null, false),
      ]),
    ).toBe(1);
  });
});

describe("celebrating", () => {
  const progress = [progressFor(def("standup-streak"), 25), progressFor(def("on-time"), 4)];

  it("celebrates nothing the first time a browser sees someone's achievements", () => {
    expect(newlyReached(progress, null)).toEqual([]);
  });

  it("celebrates a tier only once, and a higher one when it's reached", () => {
    expect(newlyReached(progress, { "standup-streak": "silver" })).toEqual([]);
    expect(newlyReached(progress, { "standup-streak": "bronze" }).map((p) => p.id)).toEqual(["standup-streak"]);
    expect(celebratedFrom(progress)).toEqual({ "standup-streak": "silver" });
  });

  it("reads anything malformed as nothing celebrated, and missing as never seen", () => {
    expect(parseCelebrated(null)).toBeNull();
    expect(parseCelebrated("{bad")).toEqual({});
    expect(parseCelebrated(JSON.stringify({ "standup-streak": "platinum" }))).toEqual({});
  });
});
