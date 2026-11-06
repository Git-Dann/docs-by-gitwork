import { describe, expect, it } from "vitest";
import {
  applyWhen,
  isValidRecurrence,
  nextOccurrence,
  nextOccurrenceFields,
  normaliseChecklist,
  normaliseTags,
  readChecklist,
} from "@/lib/commitments";

const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe("nextOccurrence", () => {
  it("daily is the next day at the same time", () => {
    expect(iso(nextOccurrence("daily", at("2026-11-04T09:30:00Z")))).toBe("2026-11-05T09:30:00.000Z");
  });

  it("weekdays skips the weekend", () => {
    // Friday → Monday, Saturday → Monday, Wednesday → Thursday
    expect(iso(nextOccurrence("weekdays", at("2026-11-06T08:00:00Z")))).toBe("2026-11-09T08:00:00.000Z");
    expect(iso(nextOccurrence("weekdays", at("2026-11-07T08:00:00Z")))).toBe("2026-11-09T08:00:00.000Z");
    expect(iso(nextOccurrence("weekdays", at("2026-11-04T08:00:00Z")))).toBe("2026-11-05T08:00:00.000Z");
  });

  it("weekly and fortnightly add 7 and 14 days", () => {
    expect(iso(nextOccurrence("weekly", at("2026-11-04T09:00:00Z")))).toBe("2026-11-11T09:00:00.000Z");
    expect(iso(nextOccurrence("fortnightly", at("2026-11-04T09:00:00Z")))).toBe("2026-11-18T09:00:00.000Z");
  });

  it("monthly keeps the day, clamped to a shorter month", () => {
    expect(iso(nextOccurrence("monthly", at("2026-11-04T09:00:00Z")))).toBe("2026-12-04T09:00:00.000Z");
    expect(iso(nextOccurrence("monthly", at("2027-01-31T09:00:00Z")))).toBe("2027-02-28T09:00:00.000Z");
    expect(iso(nextOccurrence("monthly", at("2028-01-31T09:00:00Z")))).toBe("2028-02-29T09:00:00.000Z");
    expect(iso(nextOccurrence("monthly", at("2026-12-15T09:00:00Z")))).toBe("2027-01-15T09:00:00.000Z");
  });

  it("yearly keeps the date, clamping 29 Feb", () => {
    expect(iso(nextOccurrence("yearly", at("2026-11-04T09:00:00Z")))).toBe("2027-11-04T09:00:00.000Z");
    expect(iso(nextOccurrence("yearly", at("2028-02-29T09:00:00Z")))).toBe("2029-02-28T09:00:00.000Z");
  });

  it("every:N:unit", () => {
    expect(iso(nextOccurrence("every:3:day", at("2026-11-04T09:00:00Z")))).toBe("2026-11-07T09:00:00.000Z");
    expect(iso(nextOccurrence("every:2:week", at("2026-11-04T09:00:00Z")))).toBe("2026-11-18T09:00:00.000Z");
    expect(iso(nextOccurrence("every:3:month", at("2026-11-30T09:00:00Z")))).toBe("2027-02-28T09:00:00.000Z");
  });

  it("throws on a rule that isn't valid", () => {
    expect(() => nextOccurrence("hourly", new Date())).toThrow();
    expect(() => nextOccurrence("every:0:day", new Date())).toThrow();
  });
});

describe("isValidRecurrence", () => {
  it("accepts the fixed rules and every:N:unit with N 1..365", () => {
    for (const r of ["daily", "weekdays", "weekly", "fortnightly", "monthly", "yearly", "every:1:day", "every:365:month"]) {
      expect(isValidRecurrence(r)).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const r of ["", "Daily", "hourly", "every:0:day", "every:366:day", "every:2:year", "every:x:day", "every:2:days", "weekly "]) {
      expect(isValidRecurrence(r)).toBe(false);
    }
  });
});

describe("normaliseTags", () => {
  it("trims, lowercases, strips '#', dedupes and drops empties", () => {
    expect(normaliseTags([" #Work ", "work", "##Home", "  ", "#"])).toEqual({ value: ["work", "home"] });
  });

  it("refuses more than 20 tags and a tag over 40 characters", () => {
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(normaliseTags(many)).toHaveProperty("error");
    expect(normaliseTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveProperty("value");
    expect(normaliseTags(["x".repeat(41)])).toHaveProperty("error");
    expect(normaliseTags(["#" + "x".repeat(40)])).toEqual({ value: ["x".repeat(40)] });
  });

  it("counts after deduping", () => {
    const repeated = Array.from({ length: 30 }, () => "same");
    expect(normaliseTags(repeated)).toEqual({ value: ["same"] });
  });
});

describe("normaliseChecklist", () => {
  let n = 0;
  const newId = () => `gen-${++n}`;

  it("keeps ids, generates missing ones and trims text", () => {
    n = 0;
    expect(normaliseChecklist([{ id: "a", text: " One ", done: true }, { text: "Two" }], newId)).toEqual({
      value: [
        { id: "a", text: "One", done: true },
        { id: "gen-1", text: "Two", done: false },
      ],
    });
  });

  it("refuses over 100 items, long text, long ids and empty text", () => {
    expect(normaliseChecklist(Array.from({ length: 101 }, () => ({ text: "x" })), newId)).toHaveProperty("error");
    expect(normaliseChecklist([{ text: "x".repeat(201) }], newId)).toHaveProperty("error");
    expect(normaliseChecklist([{ id: "i".repeat(65), text: "x" }], newId)).toHaveProperty("error");
    expect(normaliseChecklist([{ text: "   " }], newId)).toHaveProperty("error");
  });

  it("readChecklist drops malformed stored items", () => {
    expect(readChecklist([{ id: "a", text: "A", done: true }, { text: "no id" }, null, "x"])).toEqual([
      { id: "a", text: "A", done: true },
    ]);
    expect(readChecklist(null)).toEqual([]);
  });
});

describe("applyWhen", () => {
  const planned = { startAt: at("2026-11-05T00:00:00Z"), evening: true, someday: false };

  it("someday clears the start date and evening", () => {
    expect(applyWhen(planned, { someday: true })).toEqual({ value: { startAt: null, evening: false, someday: true } });
  });

  it("setting a start date clears someday", () => {
    const later = { startAt: null, evening: false, someday: true };
    expect(applyWhen(later, { startAt: at("2026-11-09T00:00:00Z") })).toEqual({
      value: { startAt: at("2026-11-09T00:00:00Z"), evening: false, someday: false },
    });
  });

  it("refuses someday together with a start date or evening", () => {
    expect(applyWhen(planned, { someday: true, startAt: at("2026-11-09T00:00:00Z") })).toHaveProperty("error");
    expect(applyWhen(planned, { someday: true, evening: true })).toHaveProperty("error");
  });

  it("clearing the start date leaves someday alone", () => {
    expect(applyWhen(planned, { startAt: null })).toEqual({ value: { startAt: null, evening: true, someday: false } });
  });
});

describe("nextOccurrenceFields", () => {
  const now = at("2026-11-04T15:45:00Z");

  it("moves each set date on from its own value and resets the checklist", () => {
    const next = nextOccurrenceFields(
      "weekly",
      {
        dueAt: at("2026-11-06T17:00:00Z"),
        startAt: at("2026-11-05T00:00:00Z"),
        remindAt: null,
        checklist: [{ id: "a", text: "A", done: true }],
      },
      now,
    );
    expect(next).toEqual({
      dueAt: at("2026-11-13T17:00:00Z"),
      startAt: at("2026-11-12T00:00:00Z"),
      remindAt: null,
      checklist: [{ id: "a", text: "A", done: false }],
    });
  });

  it("with no dates, dueAt is the next occurrence from now at the same time of day", () => {
    const next = nextOccurrenceFields("daily", { dueAt: null, startAt: null, remindAt: null, checklist: [] }, now);
    expect(next.dueAt).toEqual(at("2026-11-05T15:45:00Z"));
    expect(next.startAt).toBeNull();
  });
});
