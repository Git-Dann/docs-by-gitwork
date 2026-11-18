import { describe, expect, it } from "vitest";
import {
  addMonths,
  agendaDays,
  calendarDays,
  dateNumber,
  dayLabel,
  firstOfMonth,
  monthGrid,
  monthTitle,
  releaseSpansForWeek,
  weekOf,
  weekTitle,
} from "../wiki-board-calendar";
import { dayOf } from "../wiki-board-timeline";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

const d = (iso: string) => dayOf(iso);

function card(id: string, dueDate: string | null, title = id): WikiBoardCard {
  return {
    id, title, itemType: "feature", tier: null, area: null, priority: "MEDIUM", status: "TODO", laneKey: "TODO", orderKey: 0,
    release: null, progress: null, dueDate, people: [], signOff: null, feedbackCount: 0, description: null, subtasks: [],
    isCard: true, addedByClient: false, updatedAt: "2026-11-01T00:00:00.000Z", images: [], stageHistory: [],
  } as WikiBoardCard;
}
function release(id: string, startDate: string | null, endDate: string | null): WikiBoardRelease {
  return { id, label: id, startDate, endDate, cards: 0, done: 0 };
}

describe("the month grid", () => {
  it("runs Monday to Sunday and fills the first and last rows from the months either side", () => {
    // November 2026: the 1st is a Sunday, the 30th a Monday.
    const weeks = monthGrid(2026, 10);
    expect(weeks).toHaveLength(6);
    expect(dayLabel(weeks[0][0])).toBe("Mon 26 Oct");
    expect(dayLabel(weeks[0][6])).toBe("Sun 1 Nov");
    expect(dayLabel(weeks[5][0])).toBe("Mon 30 Nov");
    expect(dayLabel(weeks[5][6])).toBe("Sun 6 Dec");
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("is exactly four weeks for a February that starts on a Monday", () => {
    // February 2027 starts on a Monday and has 28 days.
    const weeks = monthGrid(2027, 1);
    expect(weeks).toHaveLength(4);
    expect(dateNumber(weeks[0][0])).toBe(1);
    expect(dateNumber(weeks[3][6])).toBe(28);
  });

  it("steps months across a year end, and titles them", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthTitle(2026, 10)).toBe("November 2026");
    expect(firstOfMonth(2026, 10)).toBe(d("2026-11-01"));
  });
});

describe("the week", () => {
  it("is the Monday-first week holding the day", () => {
    const week = weekOf(d("2026-11-18")); // a Wednesday
    expect(dayLabel(week[0])).toBe("Mon 16 Nov");
    expect(dayLabel(week[6])).toBe("Sun 22 Nov");
    expect(weekOf(d("2026-11-22"))[0]).toBe(week[0]); // Sunday stays in the same week
    expect(weekTitle(week[0])).toBe("16 – 22 Nov 2026");
    expect(weekTitle(d("2026-12-28"))).toBe("28 Dec – 3 Jan 2027");
  });
});

describe("what falls on each day", () => {
  it("puts a card on its due date, and a card with no due date nowhere", () => {
    const days = calendarDays([card("a", "2026-11-18T09:00:00.000Z"), card("b", null)], [], d("2026-11-16"), d("2026-11-22"));
    expect(days.get(d("2026-11-18"))!.cards.map((c) => c.id)).toEqual(["a"]);
    const all = [...days.values()].flatMap((x) => x.cards.map((c) => c.id));
    expect(all).toEqual(["a"]);
  });

  it("marks a release's start and end days, and ignores days outside the range", () => {
    const r = release("v2", "2026-11-17T00:00:00.000Z", "2026-11-30T00:00:00.000Z");
    const days = calendarDays([], [r], d("2026-11-16"), d("2026-11-22"));
    expect(days.get(d("2026-11-17"))!.markers).toEqual([{ release: r, kind: "start" }]);
    expect([...days.values()].some((x) => x.markers.some((m) => m.kind === "end"))).toBe(false);
  });

  it("lists only the days with something on them for the phone", () => {
    const days = calendarDays([card("a", "2026-11-20T00:00:00.000Z")], [], d("2026-11-16"), d("2026-11-22"));
    expect(agendaDays(days, d("2026-11-16"), d("2026-11-22")).map((x) => dayLabel(x.day))).toEqual(["Fri 20 Nov"]);
  });
});

describe("a release as a span across a week", () => {
  const week = weekOf(d("2026-11-18"));

  it("is clipped to the week, and says whether it really starts or ends there", () => {
    const [s] = releaseSpansForWeek([release("v1", "2026-11-10T00:00:00.000Z", "2026-11-19T00:00:00.000Z")], week);
    expect(s).toMatchObject({ fromCol: 0, toCol: 3, startsHere: false, endsHere: true });
    const [t] = releaseSpansForWeek([release("v2", "2026-11-20T00:00:00.000Z", "2026-12-04T00:00:00.000Z")], week);
    expect(t).toMatchObject({ fromCol: 4, toCol: 6, startsHere: true, endsHere: false });
  });

  it("leaves out releases outside the week, or missing a date", () => {
    expect(releaseSpansForWeek([release("old", "2026-10-01T00:00:00.000Z", "2026-11-15T00:00:00.000Z")], week)).toEqual([]);
    expect(releaseSpansForWeek([release("open", "2026-11-17T00:00:00.000Z", null)], week)).toEqual([]);
  });

  it("stacks overlapping releases on separate tracks, and reuses a track once it's free", () => {
    const spans = releaseSpansForWeek(
      [
        release("a", "2026-11-16T00:00:00.000Z", "2026-11-18T00:00:00.000Z"),
        release("b", "2026-11-17T00:00:00.000Z", "2026-11-22T00:00:00.000Z"),
        release("c", "2026-11-20T00:00:00.000Z", "2026-11-21T00:00:00.000Z"),
      ],
      week,
    );
    const track = Object.fromEntries(spans.map((s) => [s.release.id, s.track]));
    expect(track.a).not.toBe(track.b);
    expect(track.c).toBe(track.a);
  });
});
