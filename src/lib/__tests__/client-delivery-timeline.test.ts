import { describe, expect, it } from "vitest";
import {
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
