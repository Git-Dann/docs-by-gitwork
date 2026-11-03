import { describe, expect, it } from "vitest";
import { composeHrDigest, digestWeekDue, isoWeekKey } from "@/lib/hr-digest";
import type { ComingUpItem } from "@/lib/hr";

describe("isoWeekKey", () => {
  it("gives the ISO week, whose year is the year its Thursday falls in", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01"); // a Thursday
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53"); // a Friday: still 2026's last week
    expect(isoWeekKey("2026-11-02")).toBe("2026-W45");
    expect(isoWeekKey("2026-11-08")).toBe("2026-W45"); // the Sunday of the same week
  });
});

describe("digestWeekDue — Monday from 08:00 UK time", () => {
  it("is due at 08:00 on a Monday in winter (GMT)", () => {
    expect(digestWeekDue(new Date("2026-11-02T08:00:00Z"))).toBe("2026-W45");
    expect(digestWeekDue(new Date("2026-11-02T07:59:00Z"))).toBeNull();
  });

  it("follows UK summer time, not UTC", () => {
    // 07:30 UTC on a BST Monday is 08:30 in London.
    expect(digestWeekDue(new Date("2026-06-01T07:30:00Z"))).toBe("2026-W23");
    expect(digestWeekDue(new Date("2026-06-01T06:30:00Z"))).toBeNull();
  });

  it("isn't due on any other day, so a missed Monday is skipped rather than sent late", () => {
    expect(digestWeekDue(new Date("2026-11-03T09:00:00Z"))).toBeNull();
    expect(digestWeekDue(new Date("2026-11-08T09:00:00Z"))).toBeNull();
  });
});

const item = (over: Partial<ComingUpItem>): ComingUpItem => ({ kind: "contract-end", date: "2026-11-10", name: "Ali Hassan", href: "/app/staff/r3", ...over });
const today = "2026-11-02";
const url = "https://foundry.example";

describe("composeHrDigest", () => {
  it("sends nothing in a quiet week", () => {
    expect(composeHrDigest({ comingUp: [], missing: [], toCheck: 0 }, today, url)).toBeNull();
  });

  it("says what's coming up, what's to check and whose record is incomplete", () => {
    const d = composeHrDigest(
      { comingUp: [item({})], missing: [{ recordId: "r9", name: "Bea", missing: ["start date"] }], toCheck: 2 },
      today,
      url,
    )!;
    expect(d.title).toBe("HR this week: 1 coming up, 2 to check, 1 record incomplete");
    expect(d.body).toBe("Ali Hassan · contract ends, Tue 10 Nov");
    expect(d.text).toContain("- Bea: start date");
    expect(d.html).toContain('href="https://foundry.example/app/staff/r9"');
    expect(d.counts).toEqual({ comingUp: 1, toCheck: 2, missing: 1 });
  });

  it("leaves out anything more than 30 days ahead, and marks what has passed", () => {
    const d = composeHrDigest({ comingUp: [item({ date: "2026-12-20" }), item({ name: "Tom", date: "2026-10-30" })], missing: [], toCheck: 0 }, today, url)!;
    expect(d.text).not.toContain("Ali Hassan");
    expect(d.text).toContain("Tom · contract ends: Fri 30 Oct (passed)");
  });

  it("keeps right-to-work dates out of the message, and says they're waiting in Staff", () => {
    const d = composeHrDigest({ comingUp: [item({ kind: "right-to-work", name: "Priya", date: "2026-11-12" })], missing: [], toCheck: 0 }, today, url)!;
    expect(d.text).not.toContain("Priya");
    expect(d.html).not.toContain("Priya");
    expect(d.text).toContain("1 right-to-work date: see Staff");
    expect(d.title).toBe("HR this week: 1 coming up");
  });

  it("escapes names in the email", () => {
    const d = composeHrDigest({ comingUp: [item({ name: '<img src=x onerror="a()">' })], missing: [], toCheck: 0 }, today, url)!;
    expect(d.html).not.toContain("<img");
    expect(d.html).toContain("&lt;img");
  });

  it("caps each list and says how many more", () => {
    const many = Array.from({ length: 11 }, (_, i) => item({ name: `P${i}`, date: "2026-11-05" }));
    const d = composeHrDigest({ comingUp: many, missing: [], toCheck: 0 }, today, url)!;
    expect(d.text).toContain("and 3 more");
    expect(d.text).not.toContain("P10");
  });
});
