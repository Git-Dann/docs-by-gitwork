import { describe, expect, it } from "vitest";
import { END_SOON_DAYS, daysUntil, endDateState } from "@/lib/client-end-date";

const now = new Date("2026-11-18T21:30:00Z");

describe("engagement end date", () => {
  it("counts whole UTC days, whatever the time of day", () => {
    expect(daysUntil("2026-11-18", now)).toBe(0);
    expect(daysUntil("2026-11-19", now)).toBe(1);
    expect(daysUntil("2026-11-17T23:59:00Z", now)).toBe(-1);
  });

  it("is only coloured when it means something", () => {
    expect(endDateState("2027-03-01", now).state).toBeNull();
    expect(endDateState("2026-12-18", now).state).toBe("soon");
    expect(endDateState("2026-11-18", now).state).toBe("soon");
    expect(endDateState("2026-11-17", now).state).toBe("past");
  });

  it("the 'soon' window is inclusive of its last day and no wider", () => {
    const edge = new Date(Date.UTC(2026, 10, 18 + END_SOON_DAYS)).toISOString().slice(0, 10);
    const beyond = new Date(Date.UTC(2026, 10, 19 + END_SOON_DAYS)).toISOString().slice(0, 10);
    expect(endDateState(edge, now).state).toBe("soon");
    expect(endDateState(beyond, now).state).toBeNull();
  });
});
