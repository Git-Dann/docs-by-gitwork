import { describe, expect, it } from "vitest";
import {
  cardBehind,
  dayOf,
  initialScrollLeft,
  mondayOnOrBefore,
  PX_PER_DAY,
  quarterBands,
  releasePercent,
  releaseState,
  spanX,
  timelineCounts,
  timelineColumns,
  timelineGroups,
  timelineRange,
  todayX,
} from "../wiki-board-timeline";
import { countReleaseCards } from "../wiki-board-layout";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

const day = (iso: string) => dayOf(`${iso}T00:00:00.000Z`);

function rel(id: string, start: string | null, end: string | null, cards = 0, done = 0): WikiBoardRelease {
  return { id, label: id, startDate: start && `${start}T00:00:00.000Z`, endDate: end && `${end}T00:00:00.000Z`, cards, done };
}

function card(id: string, release: string | null, over: Partial<WikiBoardCard> = {}): WikiBoardCard {
  return {
    id, title: id, itemType: "feature", tier: null, area: null, priority: "MEDIUM", status: "TODO", laneKey: "TODO",
    orderKey: 0, release: release ? { id: release, label: release } : null, progress: null, dueDate: null, people: [],
    signOff: null, feedbackCount: 0, description: null, subtasks: [], isCard: true, addedByClient: false,
    updatedAt: "2026-11-01T00:00:00.000Z", ...over,
  } as WikiBoardCard;
}

describe("calendar days", () => {
  it("finds the Monday on or before any day", () => {
    // 18 Nov 2026 is a Wednesday; 16 Nov is the Monday.
    expect(mondayOnOrBefore(day("2026-11-18"))).toBe(day("2026-11-16"));
    expect(mondayOnOrBefore(day("2026-11-16"))).toBe(day("2026-11-16"));
    expect(mondayOnOrBefore(day("2026-11-22"))).toBe(day("2026-11-16"));
    expect(mondayOnOrBefore(day("1970-01-01"))).toBe(day("1969-12-29"));
  });

  it("reads a date as its UTC calendar day whatever the time", () => {
    expect(dayOf("2026-11-09T23:30:00.000Z")).toBe(day("2026-11-09"));
  });
});

describe("the range drawn", () => {
  const today = day("2026-11-18");

  it("covers every release and leaves room either side of today, on Mondays", () => {
    const r = timelineRange([rel("a", "2026-10-17", "2026-10-30"), rel("b", "2026-11-23", "2026-12-20")], today, "weeks");
    expect(r.start).toBe(day("2026-10-12"));
    expect(r.end).toBe(day("2026-12-21"));
    expect((r.end - r.start) % 7).toBe(0);
  });

  it("with no releases still shows two weeks back and four ahead", () => {
    const r = timelineRange([], today, "weeks");
    expect(r.start).toBeLessThanOrEqual(today - 14);
    expect(r.end).toBeGreaterThan(today + 28);
  });

  it("snaps to whole months at the months scale", () => {
    const r = timelineRange([rel("a", "2026-10-17", "2026-12-02")], today, "months");
    expect(r.start).toBe(day("2026-10-01"));
    expect(r.end).toBe(day("2027-01-01"));
  });
});

describe("columns", () => {
  it("one week column per Monday, labelled like Luke's site", () => {
    const cols = timelineColumns({ start: day("2026-10-26"), end: day("2026-11-16") }, "weeks");
    expect(cols.map((c) => c.label)).toEqual(["26 Oct", "2 Nov", "9 Nov"]);
    expect(cols.map((c) => c.x)).toEqual([0, 7 * PX_PER_DAY.weeks, 14 * PX_PER_DAY.weeks]);
  });

  it("month columns are as wide as their month", () => {
    const cols = timelineColumns({ start: day("2026-11-01"), end: day("2027-01-01") }, "months");
    expect(cols.map((c) => c.label)).toEqual(["Nov", "Dec"]);
    expect(cols[0].width).toBe(30 * PX_PER_DAY.months);
    expect(cols[1].x).toBe(30 * PX_PER_DAY.months);
  });

  it("quarter bands split at the quarter and clip to the range", () => {
    const bands = quarterBands({ start: day("2026-09-28"), end: day("2026-10-12") }, "weeks");
    expect(bands.map((b) => b.label)).toEqual(["Q3 2026", "Q4 2026"]);
    expect(bands[0].width).toBe(3 * PX_PER_DAY.weeks);
    expect(bands[1].x).toBe(3 * PX_PER_DAY.weeks);
  });
});

describe("bars", () => {
  const range = { start: day("2026-11-02"), end: day("2026-11-30") };

  it("lines up with the week columns, end date inclusive", () => {
    // 9 Nov – 15 Nov is exactly the second week column.
    expect(spanX("2026-11-09T00:00:00.000Z", "2026-11-15T00:00:00.000Z", range, "weeks")).toEqual({ x: 140, width: 140 });
  });

  it("clips to the range and drops a span entirely outside it", () => {
    expect(spanX("2026-10-20T00:00:00.000Z", "2026-11-03T00:00:00.000Z", range, "weeks")).toEqual({ x: 0, width: 40 });
    expect(spanX("2026-12-05T00:00:00.000Z", "2026-12-10T00:00:00.000Z", range, "weeks")).toBeNull();
    expect(spanX(null, null, range, "weeks")).toBeNull();
  });

  it("a span with only one date is one day wide", () => {
    expect(spanX(null, "2026-11-10T00:00:00.000Z", range, "weeks")).toEqual({ x: 160, width: 20 });
  });

  it("today's line, and the scroll that puts it a third of the way in", () => {
    expect(todayX(day("2026-11-18"), range, "weeks")).toBe(16 * 20);
    expect(todayX(day("2026-12-18"), range, "weeks")).toBeNull();
    expect(initialScrollLeft(900, 900)).toBe(600);
    expect(initialScrollLeft(100, 900)).toBe(0);
    expect(initialScrollLeft(null, 900)).toBe(0);
  });
});

describe("% done", () => {
  it("is done cards over cards, and a release with no cards has no percentage", () => {
    expect(releasePercent({ cards: 4, done: 1 })).toBe(25);
    expect(releasePercent({ cards: 0, done: 0 })).toBeNull();
  });

  it("counts only the client's cards, never the team's dev tasks", () => {
    const [r] = countReleaseCards(
      [card("a", "r1", { status: "DONE" }), card("b", "r1"), card("dev", "r1", { isCard: false, status: "DONE" })],
      [{ id: "r1", label: "r1", startDate: null, endDate: null }],
    );
    expect(r).toMatchObject({ cards: 2, done: 1 });
  });
});

describe("row order", () => {
  it("dated releases by start date, then undated, then no release; empty releases left out", () => {
    const releases = [rel("late", "2026-12-01", "2026-12-08"), rel("undated", null, null), rel("early", "2026-11-01", "2026-11-08"), rel("empty", "2026-10-01", "2026-10-08")];
    const groups = timelineGroups([card("x", "late"), card("y", "undated"), card("z", "early"), card("loose", null)], releases);
    expect(groups.map((g) => g.release?.id ?? "none")).toEqual(["early", "late", "undated", "none"]);
  });

  it("keeps the board's order within a release", () => {
    const groups = timelineGroups([card("b", "r", { orderKey: 2 }), card("a", "r", { orderKey: 1 })], [rel("r", "2026-11-01", "2026-11-08")]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("completed and behind schedule", () => {
  const today = day("2026-11-25");

  it("a release is complete when every card is done, behind when it ended with work open", () => {
    expect(releaseState(rel("r", "2026-05-24", "2026-07-09", 6, 6), today)).toBe("complete");
    expect(releaseState(rel("r", "2026-05-24", "2026-07-09", 6, 2), today)).toBe("behind");
    expect(releaseState(rel("r", "2026-11-01", "2026-12-20", 6, 2), today)).toBe("open");
    // Ending today isn't late yet, and a release with no end date can't be.
    expect(releaseState(rel("r", "2026-11-01", "2026-11-25", 6, 2), today)).toBe("open");
    expect(releaseState(rel("r", null, null, 6, 2), today)).toBe("open");
    // No cards is never "complete" (0 of 0 is not finished work).
    expect(releaseState(rel("r", "2026-05-24", "2026-07-09", 0, 0), today)).toBe("open");
  });

  it("a card is behind when it's open past its due date, or past its release's end with no due date", () => {
    const ended = rel("r", "2026-05-24", "2026-07-09");
    expect(cardBehind(card("a", "r"), ended, today)).toBe(true);
    expect(cardBehind(card("a", "r", { status: "DONE" }), ended, today)).toBe(false);
    // Its own due date wins over the release's.
    expect(cardBehind(card("a", "r", { dueDate: "2026-12-01T00:00:00.000Z" }), ended, today)).toBe(false);
    expect(cardBehind(card("a", null, { dueDate: "2026-11-20T00:00:00.000Z" }), null, today)).toBe(true);
    expect(cardBehind(card("a", null), null, today)).toBe(false);
  });

  const releases = [
    rel("done", "2026-05-24", "2026-07-09", 2, 2),
    rel("late", "2026-08-01", "2026-09-01", 2, 1),
    rel("now", "2026-11-01", "2026-12-20", 1, 0),
  ];
  const cards = [
    card("d1", "done", { status: "DONE" }),
    card("d2", "done", { status: "DONE" }),
    card("l1", "late", { status: "DONE" }),
    card("l2", "late"),
    card("n1", "now"),
    card("loose-done", null, { status: "DONE" }),
    card("loose-open", null),
  ];
  const ids = (g: ReturnType<typeof timelineGroups>) => g.map((x) => `${x.release?.id ?? "none"}:${x.cards.map((c) => c.id).join(",")}`);

  it("hides completed releases and done loose cards by default", () => {
    expect(ids(timelineGroups(cards, releases, { today, showCompleted: false, onlyBehind: false }))).toEqual([
      "late:l1,l2",
      "now:n1",
      "none:loose-open",
    ]);
  });

  it("shows them again when asked", () => {
    expect(ids(timelineGroups(cards, releases, { today, showCompleted: true, onlyBehind: false }))).toEqual([
      "done:d1,d2",
      "late:l1,l2",
      "now:n1",
      "none:loose-done,loose-open",
    ]);
  });

  it("Behind only keeps just the late cards", () => {
    expect(ids(timelineGroups(cards, releases, { today, showCompleted: false, onlyBehind: true }))).toEqual(["late:l2"]);
  });

  it("counts completed and behind releases among the cards in view", () => {
    expect(timelineCounts(cards, releases, today)).toEqual({ completed: 1, behind: 1 });
    expect(timelineCounts([card("n1", "now")], releases, today)).toEqual({ completed: 0, behind: 0 });
  });
});
