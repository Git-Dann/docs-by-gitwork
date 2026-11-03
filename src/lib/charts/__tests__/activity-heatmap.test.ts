import { describe, expect, it } from "vitest";
import { countByDay, formatHeatmapDay, heatmapWeekCount, parseDayKey, weekdayRow } from "../activity-heatmap";

const d = (iso: string) => new Date(iso);

describe("countByDay", () => {
  it("is gapless across the range, inclusive of both ends, zeros included", () => {
    const out = countByDay([], d("2026-10-01T15:00:00Z"), d("2026-10-07T03:00:00Z"));
    expect(out.map((x) => x.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(out.every((x) => x.count === 0)).toBe(true);
  });

  it("bins events by UTC calendar day and ignores anything outside the window", () => {
    const out = countByDay(
      [
        d("2026-10-02T00:00:00Z"),
        d("2026-10-02T23:59:59Z"), // still the 2nd in UTC
        d("2026-10-03T00:00:01Z"),
        d("2026-09-30T12:00:00Z"), // before the window
        d("2026-10-09T12:00:00Z"), // after the window
        new Date("not a date"),
      ],
      d("2026-10-01T00:00:00Z"),
      d("2026-10-05T00:00:00Z"),
    );
    expect(Object.fromEntries(out.map((x) => [x.date, x.count]))).toEqual({
      "2026-10-01": 0,
      "2026-10-02": 2,
      "2026-10-03": 1,
      "2026-10-04": 0,
      "2026-10-05": 0,
    });
  });

  it("a year is 366 days inclusive, and bounded", () => {
    expect(countByDay([], d("2025-10-29T00:00:00Z"), d("2026-10-29T00:00:00Z"))).toHaveLength(366);
    expect(countByDay([], d("2000-01-01T00:00:00Z"), d("2026-01-01T00:00:00Z")).length).toBeLessThanOrEqual(1100);
  });
});

describe("heatmapWeekCount", () => {
  it("counts Monday-first week columns the window spans", () => {
    // Thu 1 Oct → Sun 4 Oct is one column; Mon 5 Oct opens the second.
    expect(heatmapWeekCount(countByDay([], d("2026-10-01T00:00:00Z"), d("2026-10-04T00:00:00Z")))).toBe(1);
    expect(heatmapWeekCount(countByDay([], d("2026-10-01T00:00:00Z"), d("2026-10-05T00:00:00Z")))).toBe(2);
    // 90 days from Thu 31 Jul.
    expect(heatmapWeekCount(countByDay([], d("2026-07-31T00:00:00Z"), d("2026-10-28T00:00:00Z")))).toBe(14);
  });

  it("ignores malformed keys and is 0 for nothing", () => {
    expect(heatmapWeekCount([])).toBe(0);
    expect(heatmapWeekCount([{ date: "yesterday", count: 3 }])).toBe(0);
  });
});

describe("dates", () => {
  it("parses only real YYYY-MM-DD days, Monday-first", () => {
    expect(parseDayKey("2026-02-31")).toBeNull();
    expect(parseDayKey("2026-10-05T00:00")).toBeNull();
    expect(weekdayRow(parseDayKey("2026-10-05")!)).toBe(0); // Monday
    expect(weekdayRow(parseDayKey("2026-10-04")!)).toBe(6); // Sunday
  });

  it("formats a day in full", () => {
    expect(formatHeatmapDay("2026-10-05")).toBe("Mon 5 Oct 2026");
    expect(formatHeatmapDay("nope")).toBe("nope");
  });
});
