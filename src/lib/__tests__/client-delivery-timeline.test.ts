import { describe, expect, it } from "vitest";
import {
  findTidyUps,
  foldQuietWeeks,
  dueWords,
  firstNames,
  firstSentence,
  groupByWeek,
  outageLength,
  weekLabel,
  weekStart,
  weekSummary,
  type DeliveryItem,
} from "../client-delivery-timeline";

const item = (id: string, at: string, kind: DeliveryItem["kind"] = "done"): DeliveryItem => ({
  id,
  kind,
  at,
  title: id,
  detail: null,
  href: null,
  people: [],
  group: null,
});

// Friday 20 Nov 2026.
const now = new Date("2026-11-20T15:00:00Z");

describe("weeks", () => {
  it("start on Monday, in UTC", () => {
    expect(weekStart(new Date("2026-11-20T15:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(weekStart(new Date("2026-11-16T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(weekStart(new Date("2026-11-22T23:59:00Z")).toISOString().slice(0, 10)).toBe("2026-11-16");
  });

  it("are labelled this week, last week, then by date", () => {
    expect(weekLabel(new Date("2026-11-16T00:00:00Z"), now)).toBe("This week");
    expect(weekLabel(new Date("2026-11-09T00:00:00Z"), now)).toBe("Last week");
    expect(weekLabel(new Date("2026-11-02T00:00:00Z"), now)).toBe("Week of 2 Nov");
  });
});

describe("groupByWeek", () => {
  const from = new Date("2026-11-02T00:00:00Z");

  it("keeps a quiet week as an empty week rather than dropping it", () => {
    const weeks = groupByWeek([item("a", "2026-11-18T10:00:00Z"), item("b", "2026-11-03T10:00:00Z")], from, now);
    expect(weeks.map((w) => w.start)).toEqual(["2026-11-16", "2026-11-09", "2026-11-02"]);
    expect(weeks[1].items).toEqual([]);
  });

  it("drops what is outside the window, in the future, undated or repeated", () => {
    const weeks = groupByWeek(
      [item("old", "2026-10-30T10:00:00Z"), item("future", "2026-11-21T10:00:00Z"), item("bad", "nope"), item("a", "2026-11-18T10:00:00Z"), item("a", "2026-11-18T10:00:00Z")],
      from,
      now,
    );
    expect(weeks.flatMap((w) => w.items.map((i) => i.id))).toEqual(["a"]);
  });

  it("puts the newest day first and, inside a day, releases before finished work before starts", () => {
    const weeks = groupByWeek(
      [
        item("started", "2026-11-18T16:00:00Z", "started"),
        item("done", "2026-11-18T09:00:00Z", "done"),
        item("shipped", "2026-11-18T08:00:00Z", "shipped"),
        item("friday", "2026-11-20T09:00:00Z", "request"),
      ],
      from,
      now,
    );
    expect(weeks[0].items.map((i) => i.id)).toEqual(["friday", "shipped", "done", "started"]);
    expect(weeks[0].counts).toEqual({ started: 1, done: 1, shipped: 1, request: 1 });
  });
});

describe("words", () => {
  it("summarises a week, most telling first, and says when nothing was recorded", () => {
    expect(weekSummary({ meeting: 2, done: 3, shipped: 1 })).toBe("3 done · 1 release · 2 meetings");
    expect(weekSummary({})).toBe("Nothing recorded");
  });

  it("uses first names only, once each", () => {
    expect(firstNames(["Harry Brown", "harry", " ", null, "Harry Smith", "Syed Usama"])).toEqual(["Harry", "harry", "Syed"]);
  });

  it("takes the first sentence of a summary and caps it", () => {
    expect(firstSentence("We agreed the plan. Then lunch.")).toBe("We agreed the plan.");
    expect(firstSentence("")).toBeNull();
    expect(firstSentence("x".repeat(300), 20)).toHaveLength(20);
  });

  it("says how long an outage lasted, and nothing while it's open", () => {
    expect(outageLength("2026-11-18T10:00:00Z", "2026-11-18T10:12:00Z")).toBe("12 min");
    expect(outageLength("2026-11-18T10:00:00Z", "2026-11-18T12:30:00Z")).toBe("2 h 30 min");
    expect(outageLength("2026-11-18T10:00:00Z", null)).toBeNull();
  });
});

describe("findTidyUps (real Campfire data, Nov 2026)", () => {
  // Nine tasks created 2 Jun, closed together on 3 Nov with nobody on them: a tidy-up.
  const tidy = Array.from({ length: 9 }, (_, i) => ({
    id: `june-${i}`,
    completedAt: "2026-11-03T14:38:04.974Z",
    startedAt: "2026-11-03T14:38:04.974Z",
    createdAt: "2026-06-02T14:25:56.471Z",
  }));
  // Sardar's four closed in one go on 19 Nov: real work, started on different days.
  const sardar = [
    { id: "s1", completedAt: "2026-11-19T16:16:10.000Z", startedAt: "2026-11-17T07:39:00.000Z", createdAt: "2026-11-17T07:00:00.000Z" },
    { id: "s2", completedAt: "2026-11-19T16:16:10.000Z", startedAt: "2026-11-18T15:44:00.000Z", createdAt: "2026-11-18T15:00:00.000Z" },
    { id: "s3", completedAt: "2026-11-19T16:16:10.000Z", startedAt: "2026-11-19T16:16:10.000Z", createdAt: "2026-11-19T16:00:00.000Z" },
    { id: "s4", completedAt: "2026-11-19T16:16:10.000Z", startedAt: "2026-11-19T16:16:10.000Z", createdAt: "2026-11-19T16:00:00.000Z" },
  ];

  it("finds the June batch and leaves real work alone", () => {
    const batches = findTidyUps([...tidy, ...sardar]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(9);
  });

  it("needs every task in the batch to be old and never started", () => {
    const oneWorked = tidy.map((t, i) => (i === 0 ? { ...t, startedAt: "2026-10-01T09:00:00.000Z" } : t));
    expect(findTidyUps(oneWorked)).toEqual([]);
    const oneNew = tidy.map((t, i) => (i === 0 ? { ...t, createdAt: "2026-10-30T09:00:00.000Z" } : t));
    expect(findTidyUps(oneNew)).toEqual([]);
  });

  it("needs a batch, not a single old task closed on its own", () => {
    expect(findTidyUps(tidy.slice(0, 2))).toEqual([]);
    expect(findTidyUps(tidy.slice(0, 3))).toHaveLength(1);
  });

  it("counts a tidy-up as its own thing in the week's summary", () => {
    expect(weekSummary({ done: 4, tidy: 1 })).toBe("4 done · 1 board tidy-up");
  });
});

describe("dueWords", () => {
  const now = new Date("2026-11-20T09:00:00Z");
  it("says how late, by calendar day", () => {
    // Campfire's "Push attachments fixes to production", due 17 Nov, still in progress on the 20th.
    expect(dueWords("2026-11-17T00:00:00.000Z", now)).toEqual({ text: "3 days late", late: true });
    expect(dueWords("2026-11-19T23:00:00.000Z", now)).toEqual({ text: "1 day late", late: true });
  });
  it("is not late on the day it's due, whatever the hour", () => {
    expect(dueWords("2026-11-20T00:00:00.000Z", new Date("2026-11-20T23:30:00Z"))).toEqual({ text: "due today", late: false });
  });
  it("names a future date and says nothing without one", () => {
    expect(dueWords("2026-11-24T00:00:00.000Z", now)).toEqual({ text: "due 24 Nov", late: false });
    expect(dueWords(null, now)).toBeNull();
  });
});

describe("foldQuietWeeks", () => {
  const wk = (start: string, n: number) => ({ start, label: start, counts: {}, items: Array.from({ length: n }, (_, i) => ({ id: `${start}-${i}` })) }) as never;
  it("folds two or more quiet weeks in a row and keeps a lone one", () => {
    const rows = foldQuietWeeks([wk("w1", 2), wk("w2", 0), wk("w3", 3), wk("w4", 0), wk("w5", 0), wk("w6", 0)]);
    expect(rows.map((r) => (r.kind === "week" ? r.week.start : `quiet:${r.weeks.length}`))).toEqual(["w1", "w2", "w3", "quiet:3"]);
  });
  it("never folds the current week, even when it's quiet", () => {
    const rows = foldQuietWeeks([wk("now", 0), wk("w2", 0), wk("w3", 0)]);
    expect(rows.map((r) => (r.kind === "week" ? r.week.start : `quiet:${r.weeks.length}`))).toEqual(["now", "quiet:2"]);
  });
});
