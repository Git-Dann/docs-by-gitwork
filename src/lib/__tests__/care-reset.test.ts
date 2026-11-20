/**
 * Clearing a backlog: the rules that decide what a cutoff means and what it may touch.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_RESET_AGE_HOURS,
  describeResetPlan,
  isResetBatch,
  resetBatchMarker,
  resolveResetCutoff,
} from "@/lib/care-reset";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("resolveResetCutoff", () => {
  it("turns a preset into a date", () => {
    const r = resolveResetCutoff({ presetDays: 7 }, NOW);
    expect(r.ok && r.cutoff).toEqual(ago(7 * DAY));
  });

  it("refuses a date in the future", () => {
    const r = resolveResetCutoff({ iso: "2027-01-01T00:00:00.000Z" }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/future/i);
  });

  it(`⚠️ refuses anything inside ${MIN_RESET_AGE_HOURS} hours`, () => {
    /*
     * The guard that stops "close everything older than 0 minutes" from wiping a live desk. A
     * bulk close is reversible, but reversing 500 rows is not something anyone should have to do
     * because a date picker defaulted somewhere unhelpful.
     */
    const r = resolveResetCutoff({ iso: ago(2 * HOUR).toISOString() }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/today's conversations/i);
    // And the boundary itself is allowed.
    expect(resolveResetCutoff({ iso: ago(MIN_RESET_AGE_HOURS * HOUR).toISOString() }, NOW).ok).toBe(true);
  });

  it("refuses a date more than five years back — almost always a typo in the year", () => {
    const r = resolveResetCutoff({ iso: "2015-01-01T00:00:00.000Z" }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/five years/i);
  });

  it("says plainly when it was given nothing, or nonsense", () => {
    expect(resolveResetCutoff({}, NOW).ok).toBe(false);
    expect(resolveResetCutoff({ iso: "not a date" }, NOW).ok).toBe(false);
    expect(resolveResetCutoff({ presetDays: 0 }, NOW).ok).toBe(false);
  });
});

describe("describeResetPlan", () => {
  it("states the number, and what it does NOT do", () => {
    const text = describeResetPlan(324, new Date("2026-11-13T00:00:00.000Z"));
    expect(text).toContain("324 conversations");
    expect(text).toContain("13 November 2026");
    // The commonest reason someone does not clear a backlog they should clear is not knowing
    // whether it throws anything away.
    expect(text).toMatch(/stay in Care/i);
    expect(text).toMatch(/undo/i);
    expect(text).not.toMatch(/delete|remove|erase/i);
  });

  it("says there is nothing to do rather than offering to do nothing", () => {
    expect(describeResetPlan(0, NOW)).toMatch(/nothing to close/i);
  });

  it("gets the singular right", () => {
    expect(describeResetPlan(1, NOW)).toContain("1 conversation whose");
  });
});

describe("the batch marker", () => {
  it("round-trips, so one run and only that run can be undone", () => {
    expect(isResetBatch(resetBatchMarker("log_a"), "log_a")).toBe(true);
    expect(isResetBatch(resetBatchMarker("log_a"), "log_b")).toBe(false);
  });

  it("does not match a row nobody marked", () => {
    // A conversation a person closed by hand between two runs must never be reopened by undoing
    // one of them.
    expect(isResetBatch(null, "log_a")).toBe(false);
    expect(isResetBatch(undefined, "log_a")).toBe(false);
    expect(isResetBatch("", "log_a")).toBe(false);
  });
});
