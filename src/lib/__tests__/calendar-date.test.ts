import { afterEach, describe, expect, it } from "vitest";
import {
  dateToISO,
  formatDisplayDate,
  formatISODate,
  isISODate,
  isoToDate,
  isWithinBounds,
  parseISODate,
  todayISO,
} from "@/lib/calendar-date";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("parse / format", () => {
  it("round-trips the native input's value", () => {
    expect(parseISODate("2026-11-03")).toEqual({ year: 2026, month: 11, day: 3 });
    expect(formatISODate({ year: 2026, month: 11, day: 3 })).toBe("2026-11-03");
  });

  it("rejects anything a native date input would show as empty", () => {
    for (const bad of ["", "2026-02-30", "2026-13-01", "2026-11-3", "2026-11-03T00:00:00.000Z", "03/11/2026"]) {
      expect(isISODate(bad)).toBe(false);
    }
    expect(parseISODate(null)).toBeNull();
    expect(isISODate("2028-02-29")).toBe(true); // leap year
  });

  it("displays as people write it", () => {
    expect(formatDisplayDate("2026-11-03")).toBe("3 Nov 2026");
  });
});

describe("min / max", () => {
  it("treats an empty bound as no bound", () => {
    expect(isWithinBounds("2026-11-03", "", "")).toBe(true);
    expect(isWithinBounds("2026-11-03", "2026-11-04")).toBe(false);
    expect(isWithinBounds("2026-11-03", undefined, "2026-11-02")).toBe(false);
    expect(isWithinBounds("2026-11-03", "2026-11-03", "2026-11-03")).toBe(true);
  });
});

describe("timezones — a calendar date is not an instant", () => {
  const zones = ["America/Los_Angeles", "Europe/London", "Pacific/Auckland", "Pacific/Kiritimati", "America/Sao_Paulo"];
  // Both UK clock changes in 2026, the US fall-back, and New Year.
  const dates = ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26", "2026-11-01", "2027-01-01"];

  it("a string survives the trip to a Date and back in every zone", () => {
    for (const tz of zones) {
      process.env.TZ = tz;
      for (const iso of dates) expect(dateToISO(isoToDate(iso))).toBe(iso);
    }
  });

  it("formats the same day in every zone", () => {
    for (const tz of zones) {
      process.env.TZ = tz;
      expect(formatDisplayDate("2026-03-29")).toBe("29 Mar 2026");
      expect(formatDisplayDate("2027-01-01")).toBe("1 Jan 2027");
    }
  });

  it("today is the user's own calendar day, even a minute either side of midnight", () => {
    process.env.TZ = "Pacific/Auckland";
    // 23:59 UTC on 3 Nov is 12:59 on the 4th in Auckland.
    expect(todayISO(new Date("2026-11-03T23:59:00Z"))).toBe("2026-11-04");
    process.env.TZ = "America/Los_Angeles";
    // 00:01 UTC on 4 Nov is still the 3rd in Los Angeles.
    expect(todayISO(new Date("2026-11-04T00:01:00Z"))).toBe("2026-11-03");
    process.env.TZ = "Europe/London";
    // 00:30 local on the night the clocks went forward.
    expect(todayISO(new Date(2026, 2, 29, 0, 30))).toBe("2026-03-29");
  });
});
