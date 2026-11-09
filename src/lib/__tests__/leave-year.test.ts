/**
 * A person's holiday year runs from the anniversary of their start date (Dan, Nov 2026);
 * no start date keeps January to December.
 */
import { describe, expect, it } from "vitest";
import { anniversaryIn, formatLeaveYear, leaveYearFor } from "@/lib/leave-year";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ymd = (x: Date) => x.toISOString().slice(0, 10);

describe("leaveYearFor", () => {
  it("is January to December with no start date", () => {
    const y = leaveYearFor(null, d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end), y.fromStartDate]).toEqual(["2026-01-01", "2026-12-31", false]);
  });

  it("runs from this year's anniversary once it has passed", () => {
    const y = leaveYearFor(d("2023-03-14"), d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end), y.fromStartDate]).toEqual(["2026-03-14", "2027-03-13", true]);
  });

  it("runs from last year's anniversary when this year's is still ahead", () => {
    const y = leaveYearFor(d("2023-12-01"), d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end)]).toEqual(["2025-12-01", "2026-11-30"]);
  });

  it("starts a new year on the anniversary itself", () => {
    expect(ymd(leaveYearFor(d("2023-11-04"), d("2026-11-04")).start)).toBe("2026-11-04");
    expect(ymd(leaveYearFor(d("2023-11-04"), d("2026-11-03")).start)).toBe("2025-11-04");
  });

  it("starts the first year on the joining day, never an anniversary before it", () => {
    const y = leaveYearFor(d("2026-06-15"), d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end)]).toEqual(["2026-06-15", "2027-06-14"]);
  });

  it("gives someone who hasn't started yet the year from their start date", () => {
    const y = leaveYearFor(d("2027-02-01"), d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end)]).toEqual(["2027-02-01", "2028-01-31"]);
  });

  it("puts a 29 February start on 28 February in other years", () => {
    expect(ymd(anniversaryIn(d("2024-02-29"), 2026))).toBe("2026-02-28");
    const y = leaveYearFor(d("2024-02-29"), d("2026-11-04"));
    expect([ymd(y.start), ymd(y.end)]).toEqual(["2026-02-28", "2027-02-27"]);
  });

  it("ignores the time of day", () => {
    const y = leaveYearFor(new Date("2023-03-14T23:30:00Z"), new Date("2026-03-14T00:10:00Z"));
    expect(ymd(y.start)).toBe("2026-03-14");
  });

  it("formats the period for display", () => {
    expect(formatLeaveYear({ start: "2026-03-14", end: "2027-03-13" })).toBe("14 Mar 2026 – 13 Mar 2027");
  });

  it("renders nothing rather than throwing for a missing or bad date", () => {
    expect(formatLeaveYear({ start: undefined, end: "2027-03-13" })).toBe("");
    expect(formatLeaveYear({ start: "not a date", end: "2027-03-13" })).toBe("");
  });
});
