import { describe, expect, it } from "vitest";
import { dedupeAbsences, isAbsenceShaped } from "../dedupe-absences";
import type { TeamCalendarEvent } from "@/types/backstage";

/**
 * Fixtures are the REAL events, copied from the live calendar that produced the
 * report — an HR-synced all-day "Holiday" and a hand-made timed out-of-office
 * covering the same week. A fixture invented to match the implementation would
 * pass whether or not the rule is right (§42.10).
 */
const ev = (over: Partial<TeamCalendarEvent>): TeamCalendarEvent => ({
  id: "u1:x",
  userId: "u1",
  userName: "Dan Lindsay",
  summary: "Something",
  start: "2026-10-05T00:00:00+01:00",
  end: "2026-10-10T00:00:00+01:00",
  allDay: false,
  meetLink: null,
  outOfOffice: false,
  ...over,
});

/** From the HR sync: all-day, generic title, numeric id. */
const hrHoliday = ev({
  id: "u1:36802551",
  summary: "Daniel Lindsay - Holiday",
  start: "2026-10-05T00:00:00.000Z",
  end: "2026-10-10T00:00:00.000Z",
  allDay: true,
  outOfOffice: false,
});

/** Made by hand: OUT_OF_OFFICE, says where he actually is. */
const ooo = ev({
  id: "u1:3hn15doocajbaa0leui59j3kk8",
  summary: "Dan Away - New York",
  start: "2026-10-05T00:00:00.000Z",
  end: "2026-10-10T00:00:00.000Z",
  outOfOffice: true,
});

describe("one absence booked twice becomes one row", () => {
  it("collapses the HR holiday and the hand-made out-of-office", () => {
    const out = dedupeAbsences([hrHoliday, ooo]);
    expect(out).toHaveLength(1);
  });

  it("keeps the title a human wrote, not the HR export's", () => {
    // "Dan Away - New York" tells a colleague where he is. "Daniel Lindsay -
    // Holiday" is what the export calls every absence anyone takes.
    expect(dedupeAbsences([hrHoliday, ooo])[0].summary).toBe("Dan Away - New York");
    // …and the same regardless of which arrives first.
    expect(dedupeAbsences([ooo, hrHoliday])[0].summary).toBe("Dan Away - New York");
  });

  it("records what it folded in rather than silently dropping it", () => {
    expect(dedupeAbsences([hrHoliday, ooo])[0].mergedWith).toEqual([
      "Daniel Lindsay - Holiday",
    ]);
  });
});

describe("⚠️ it must never swallow a meeting", () => {
  it("keeps two different meetings that share a time slot", () => {
    // The dangerous failure. Back-to-back calendars really do hold two calls at
    // 11:30, and hiding one is far worse than showing a duplicate absence.
    const a = ev({ id: "u1:a", summary: "PollenIQ x Gitwork", start: "2026-10-06T11:30:00+01:00", end: "2026-10-06T12:00:00+01:00" });
    const b = ev({ id: "u1:b", summary: "Gaia x Gitwork", start: "2026-10-06T11:30:00+01:00", end: "2026-10-06T12:00:00+01:00" });
    expect(dedupeAbsences([a, b])).toHaveLength(2);
  });

  it("keeps a short out-of-office (a school run is not a holiday)", () => {
    const run1 = ev({ id: "u1:r1", summary: "School Run (Dan OOO)", start: "2026-10-07T15:00:00+01:00", end: "2026-10-07T15:45:00+01:00", outOfOffice: true });
    const run2 = ev({ id: "u1:r2", summary: "School Run (Dan OOO)", start: "2026-10-07T15:00:00+01:00", end: "2026-10-07T15:45:00+01:00", outOfOffice: true });
    expect(dedupeAbsences([run1, run2])).toHaveLength(2);
  });
});

describe("the boundaries of the rule", () => {
  it("does not merge two people's absences", () => {
    const other = { ...hrHoliday, id: "u2:x", userId: "u2", userName: "Harry Brown" };
    expect(dedupeAbsences([hrHoliday, other])).toHaveLength(2);
  });

  it("does not merge overlapping-but-different spans", () => {
    // Deliberately exact-span only. A three-day trip inside a week off is two
    // facts, and guessing which to hide is how a real absence goes missing.
    const shorter = { ...ooo, id: "u1:short", end: "2026-10-07T00:00:00.000Z" };
    expect(dedupeAbsences([hrHoliday, shorter])).toHaveLength(2);
  });

  it("merges three records of one absence into one", () => {
    const third = { ...ooo, id: "u1:third", summary: "Away", outOfOffice: false };
    const out = dedupeAbsences([hrHoliday, ooo, third]);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("Dan Away - New York");
    expect(out[0].mergedWith).toHaveLength(2);
  });

  it("leaves a lone absence untouched, with no merge marker", () => {
    const out = dedupeAbsences([ooo]);
    expect(out).toHaveLength(1);
    expect(out[0].mergedWith).toBeUndefined();
  });

  it("preserves the order of everything else", () => {
    const meeting = ev({ id: "u1:m", summary: "Stand Up", start: "2026-10-05T09:15:00+01:00", end: "2026-10-05T09:30:00+01:00" });
    const out = dedupeAbsences([meeting, hrHoliday, ooo]);
    expect(out.map((e) => e.summary)).toEqual(["Stand Up", "Dan Away - New York"]);
  });
});

describe("isAbsenceShaped", () => {
  it("counts an all-day block and a day-or-longer span", () => {
    expect(isAbsenceShaped(hrHoliday)).toBe(true);
    expect(isAbsenceShaped(ooo)).toBe(true);
  });

  it("does not count a meeting or a short OOO", () => {
    expect(isAbsenceShaped(ev({ start: "2026-10-05T09:15:00+01:00", end: "2026-10-05T09:30:00+01:00" }))).toBe(false);
    expect(isAbsenceShaped(ev({ start: "2026-10-07T15:00:00+01:00", end: "2026-10-07T15:45:00+01:00" }))).toBe(false);
  });

  it("refuses an unparseable date rather than guessing", () => {
    expect(isAbsenceShaped(ev({ start: "not-a-date", end: "also-not" }))).toBe(false);
  });
});

describe("⚠️ the title-length heuristic that got it backwards", () => {
  it("does not decide on length when the types differ", () => {
    // The real titles: "Daniel Lindsay - Holiday" (24) beats "Dan Away - New York"
    // (19) on length, and is the WRONG answer. Pinning this stops a future tidy-up
    // from collapsing `preferred` back to a string comparison.
    expect("Daniel Lindsay - Holiday".length).toBeGreaterThan("Dan Away - New York".length);
    expect(dedupeAbsences([hrHoliday, ooo])[0].summary).toBe("Dan Away - New York");
  });

  it("still uses length to break a tie between two of the same type", () => {
    const short = { ...hrHoliday, id: "u1:s", summary: "Leave" };
    const long = { ...hrHoliday, id: "u1:l", summary: "Daniel Lindsay - Holiday" };
    expect(dedupeAbsences([short, long])[0].summary).toBe("Daniel Lindsay - Holiday");
  });
});
