/**
 * The Board's Schedule (src/lib/wiki-board-schedule.ts): weeks, overdue, releases once per week,
 * what happened, the undated tray, and folding quiet weeks.
 */
import { describe, expect, it } from "vitest";
import { buildSchedule, cardEvents, releaseInWeek, scheduleRows, weekLabel, type ScheduleWeek } from "@/lib/wiki-board-schedule";
import { dayOf, mondayOnOrBefore } from "@/lib/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardKeyDate, WikiBoardRelease } from "@/types/wiki-board";

// Wednesday 18 November 2026. Its week is Mon 16 – Sun 22 Nov.
const TODAY = dayOf("2026-11-18");
const MONDAY = dayOf("2026-11-16");

function card(id: string, over: Partial<WikiBoardCard> = {}): WikiBoardCard {
  return {
    id,
    title: id,
    itemType: "feature",
    tier: null,
    area: null,
    list: null,
    priority: "MEDIUM",
    estimateHours: null,
    status: "TODO",
    laneKey: "TODO",
    orderKey: 1,
    release: null,
    progress: null,
    dueDate: null,
    people: [],
    signOff: null,
    feedbackCount: 0,
    description: null,
    subtasks: [],
    images: [],
    removedImages: [],
    stageHistory: [],
    doneAt: null,
    dependsOn: [],
    isCard: true,
    addedByClient: false,
    updatedAt: "2026-11-18T00:00:00.000Z",
    ...over,
  };
}

function release(id: string, start: string | null, end: string | null, cards = 4, done = 1): WikiBoardRelease {
  return { id, label: id, startDate: start, endDate: end, cards, done };
}

const kd = (id: string, date: string): WikiBoardKeyDate => ({ id, title: id, date, note: null, imported: false });

const build = (over: Partial<Parameters<typeof buildSchedule>[0]> = {}) =>
  buildSchedule({ cards: [], releases: [], keyDates: [], today: TODAY, mode: "upcoming", weeks: 4, ...over });

describe("the weeks", () => {
  it("Upcoming starts on this week's Monday and runs forward", () => {
    const s = build();
    expect(mondayOnOrBefore(TODAY)).toBe(MONDAY);
    expect(s.weeks.map((w) => w.monday)).toEqual([MONDAY, MONDAY + 7, MONDAY + 14, MONDAY + 21]);
    expect(s.weeks[0].isCurrent).toBe(true);
    expect(s.weeks.slice(1).every((w) => !w.isCurrent)).toBe(true);
  });

  it("Past starts on last week and runs back, newest first", () => {
    const s = build({ mode: "past", weeks: 3 });
    expect(s.weeks.map((w) => w.monday)).toEqual([MONDAY - 7, MONDAY - 14, MONDAY - 21]);
    expect(s.weeks.some((w) => w.isCurrent)).toBe(false);
  });

  it("labels a week across months, and adds the year only when it isn't this one", () => {
    expect(weekLabel(MONDAY, 2026)).toBe("16 – 22 Nov");
    expect(weekLabel(dayOf("2026-12-28"), 2026)).toBe("28 Dec – 3 Jan 2027");
  });
});

describe("due and overdue", () => {
  it("puts a card in the week it's due", () => {
    const s = build({ cards: [card("a", { dueDate: "2026-11-27T12:00:00.000Z" })] });
    expect(s.weeks[1].due.map((d) => d.card.id)).toEqual(["a"]);
    expect(s.weeks[0].due).toEqual([]);
  });

  it("pins a late, unfinished card above the weeks once, not in its week", () => {
    const late = card("late", { dueDate: "2026-11-16T12:00:00.000Z" });
    const s = build({ cards: [late] });
    expect(s.overdue.map((d) => d.card.id)).toEqual(["late"]);
    expect(s.weeks[0].due).toEqual([]);
  });

  it("a finished card due in the past is not overdue", () => {
    const s = build({ cards: [card("done", { dueDate: "2026-11-16T12:00:00.000Z", status: "DONE" })] });
    expect(s.overdue).toEqual([]);
    expect(s.weeks[0].due.map((d) => d.card.id)).toEqual(["done"]);
  });

  it("due today is not overdue", () => {
    const s = build({ cards: [card("today", { dueDate: "2026-11-18T12:00:00.000Z" })] });
    expect(s.overdue).toEqual([]);
    expect(s.weeks[0].due.map((d) => d.card.id)).toEqual(["today"]);
  });
});

describe("releases", () => {
  it("shows a release once in each week it runs, with its % done", () => {
    const s = build({ releases: [release("v2", "2026-11-18", "2026-12-03", 4, 1)] });
    const inWeeks = s.weeks.map((w) => w.releases.map((r) => r.release.id));
    expect(inWeeks).toEqual([["v2"], ["v2"], ["v2"], []]);
    expect(s.weeks[0].releases[0]).toMatchObject({ startsThisWeek: true, endsThisWeek: false, percent: 25 });
    expect(s.weeks[1].releases[0]).toMatchObject({ startsThisWeek: false, endsThisWeek: false });
    expect(s.weeks[2].releases[0]).toMatchObject({ startsThisWeek: false, endsThisWeek: true });
  });

  it("a release with no cards has no % (not 0%)", () => {
    expect(releaseInWeek(release("v", "2026-11-16", "2026-11-20", 0, 0), MONDAY)?.percent).toBeNull();
  });

  it("a release with one date shows only in that date's week", () => {
    expect(releaseInWeek(release("v", null, "2026-11-20"), MONDAY)).toMatchObject({ endsThisWeek: true });
    expect(releaseInWeek(release("v", null, "2026-11-20"), MONDAY + 7)).toBeNull();
    expect(releaseInWeek(release("v", null, null), MONDAY)).toBeNull();
  });
});

describe("what happened", () => {
  it("logs each dated stage and the finish in its week", () => {
    const c = card("rate", { status: "DONE", stageHistory: [{ label: "In Development", date: "2026-11-03" }], doneAt: "2026-11-11T09:00:00.000Z" });
    const s = build({ cards: [c], mode: "past", weeks: 3 });
    expect(s.weeks[0].happened.map((e) => e.label)).toEqual(["Done"]);
    expect(s.weeks[1].happened.map((e) => e.label)).toEqual(["In Development"]);
  });

  it("doesn't add Done when a stage was recorded that same day", () => {
    const c = card("live", { stageHistory: [{ label: "Live Features", date: "2026-11-11" }], doneAt: "2026-11-11T17:00:00.000Z" });
    expect(cardEvents(c).map((e) => e.label)).toEqual(["Live Features"]);
  });

  it("a dev task never makes an event, whatever it carries", () => {
    const dev = card("dev", { isCard: false, itemType: null, stageHistory: [{ label: "In Development", date: "2026-11-10" }], doneAt: "2026-11-12T00:00:00.000Z" });
    expect(cardEvents(dev)).toEqual([]);
    expect(build({ cards: [dev], mode: "past", weeks: 2 }).weeks.flatMap((w) => w.happened)).toEqual([]);
  });

  it("a card the client added is theirs, so it does", () => {
    const mine = card("mine", { isCard: false, itemType: null, addedByClient: true, doneAt: "2026-11-12T00:00:00.000Z" });
    expect(cardEvents(mine).map((e) => e.label)).toEqual(["Done"]);
  });

  it("a stage dated after today is a plan, not something that happened", () => {
    const c = card("future", { stageHistory: [{ label: "Live Features", date: "2026-11-20" }] });
    expect(build({ cards: [c] }).weeks[0].happened).toEqual([]);
  });
});

describe("key dates", () => {
  it("sit in their week", () => {
    const s = build({ keyDates: [kd("Mini Major", "2026-11-25")] });
    expect(s.weeks[1].keyDates.map((k) => k.keyDate.id)).toEqual(["Mini Major"]);
  });
});

describe("the No date yet tray", () => {
  it("lists the client's undated cards that aren't finished, and nothing else", () => {
    const s = build({
      cards: [
        card("undated"),
        card("dated", { dueDate: "2026-11-20T12:00:00.000Z" }),
        card("finished", { status: "DONE" }),
        card("dev", { isCard: false, itemType: null }),
      ],
    });
    expect(s.undated.map((c) => c.id)).toEqual(["undated"]);
  });
});

describe("more", () => {
  it("says there's more when something is dated past the last week shown", () => {
    expect(build({ keyDates: [kd("later", "2027-03-01")] }).hasMore).toBe(true);
    expect(build({ keyDates: [kd("soon", "2026-11-20")] }).hasMore).toBe(false);
  });

  it("in Past, when something is dated before the first week shown", () => {
    expect(build({ mode: "past", weeks: 2, keyDates: [kd("old", "2026-01-05")] }).hasMore).toBe(true);
  });
});

describe("quiet weeks", () => {
  const week = (monday: number, empty: boolean, isCurrent = false): ScheduleWeek => ({
    monday,
    isCurrent,
    releases: [],
    due: [],
    happened: [],
    keyDates: [],
    empty,
  });

  it("folds a run of empty weeks into one line, and keeps this week on its own", () => {
    const rows = scheduleRows([week(1, true, true), week(8, true), week(15, true), week(22, false), week(29, true)]);
    expect(rows.map((r) => (r.kind === "week" ? `week:${r.week.monday}` : `quiet:${r.weeks.length}`))).toEqual([
      "week:1",
      "quiet:2",
      "week:22",
      "quiet:1",
    ]);
  });
});
