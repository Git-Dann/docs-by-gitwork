import { describe, expect, it } from "vitest";
import {
  dailyLine,
  dayLabel,
  formatAvailabilityDigest,
  rangeLabel,
  weeklyLine,
  type DigestLeave,
} from "../availability-digest-format";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function leave(over: Partial<DigestLeave> = {}): DigestLeave {
  return {
    name: "Dan Lindsay",
    type: "OTHER",
    startDate: d("2026-11-11"),
    endDate: d("2026-11-11"),
    halfDayStart: false,
    halfDayEnd: false,
    ...over,
  };
}

const MONDAY = d("2026-11-09");

describe("dates", () => {
  it("writes a single day once, never as a range", () => {
    expect(rangeLabel(d("2026-11-11"), d("2026-11-11"))).toBe("Wed 11 Nov");
  });
  it("does not repeat a shared month", () => {
    expect(rangeLabel(d("2026-11-09"), d("2026-11-13"))).toBe("Mon 9 – Fri 13 Nov");
  });
  it("names both months when the range crosses one", () => {
    expect(rangeLabel(d("2026-10-30"), d("2026-11-03"))).toBe("Fri 30 Oct – Tue 3 Nov");
  });
  it("adds the year only when it differs from the post's", () => {
    expect(dayLabel(d("2027-01-04"), d("2026-12-28"))).toBe("Mon 4 Jan 2027");
    expect(dayLabel(d("2026-12-31"), d("2026-12-28"))).toBe("Thu 31 Dec");
  });
});

describe("weekly lines", () => {
  it("a half day reads as one day and says ½ day (the 11 Nov post)", () => {
    const line = weeklyLine(leave({ halfDayStart: true }), MONDAY);
    expect(line).toBe("• *Dan Lindsay* — Wed 11 Nov · ½ day · leave");
    expect(line).not.toContain("–");
    expect(line).not.toContain("back");
  });

  it("a half day flagged on its end reads the same", () => {
    expect(weeklyLine(leave({ halfDayEnd: true }), MONDAY)).toContain("½ day");
  });

  it("a whole single day says when they're back, and no ½", () => {
    const line = weeklyLine(leave({ type: "ANNUAL" }), MONDAY);
    expect(line).toBe("• *Dan Lindsay* — Wed 11 Nov · holiday · back Thu 12 Nov");
  });

  it("a longer booking names its half days and the return day", () => {
    const line = weeklyLine(
      leave({ type: "ANNUAL", startDate: d("2026-11-09"), endDate: d("2026-11-13"), halfDayEnd: true }),
      MONDAY,
    );
    expect(line).toBe("• *Dan Lindsay* — Mon 9 – Fri 13 Nov · holiday · ½ day on Fri 13 Nov · back Mon 16 Nov");
  });
});

describe("daily lines", () => {
  it("a half day today", () => {
    expect(dailyLine(leave({ halfDayStart: true }), d("2026-11-11"))).toBe("• *Dan Lindsay* — ½ day · leave");
  });

  it("the last day of a booking", () => {
    const l = leave({ type: "ANNUAL", startDate: d("2026-10-26"), endDate: d("2026-10-27") });
    expect(dailyLine(l, d("2026-10-27"))).toBe("• *Dan Lindsay* — holiday · last day, back Wed 28 Oct");
  });

  it("mid-booking counts working days left, skipping the weekend", () => {
    const l = leave({ type: "ANNUAL", startDate: d("2026-11-12"), endDate: d("2026-11-17") });
    expect(dailyLine(l, d("2026-11-13"))).toBe(
      "• *Dan Lindsay* — holiday · until Tue 17 Nov · back Wed 18 Nov · 3 working days left",
    );
  });

  it("flags a half day that falls today inside a longer booking", () => {
    const l = leave({ type: "ANNUAL", startDate: d("2026-11-12"), endDate: d("2026-11-13"), halfDayStart: true });
    expect(dailyLine(l, d("2026-11-12"))).toContain("holiday (½ day today)");
  });
});

describe("the whole post", () => {
  it("says nothing when nobody is off", () => {
    expect(formatAvailabilityDigest([], "weekly", MONDAY)).toBeNull();
  });

  it("weekly: the working week, where it comes from, and the half day", () => {
    const text = formatAvailabilityDigest([leave({ halfDayStart: true })], "weekly", MONDAY)!;
    expect(text.split("\n")[0]).toBe("*Who's off this week · Mon 9 – Fri 13 Nov*");
    expect(text).toContain("Wed 11 Nov · ½ day");
    expect(text).toContain("approved leave in Foundry Backstage");
    expect(text).toContain("1 person off this week");
    expect(text).not.toContain("11 Nov–11 Nov");
  });

  it("daily: today's date in the heading", () => {
    const text = formatAvailabilityDigest([leave({ halfDayStart: true })], "daily", d("2026-11-11"))!;
    expect(text.split("\n")[0]).toBe("*Who's off today · Wed 11 Nov*");
    expect(text).toContain("1 person off today");
  });

  it("counts people, not bookings", () => {
    const text = formatAvailabilityDigest(
      [leave(), leave({ startDate: d("2026-11-13"), endDate: d("2026-11-13") }), leave({ name: "Shahab Rasheed" })],
      "weekly",
      MONDAY,
    )!;
    expect(text).toContain("2 people off this week");
  });
});
