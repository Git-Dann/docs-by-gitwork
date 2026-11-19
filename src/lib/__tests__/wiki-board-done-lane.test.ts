/**
 * A Done column's older cards (CLAUDE.md §126.5): paging in the board's own order, merging what
 * was read with what the board sent, and what's still left out.
 */
import { describe, expect, it } from "vitest";
import {
  DONE_PAGE_MAX,
  byRecency,
  doneLanePage,
  laneKindsToRead,
  laneLeftOut,
  layoutBoard,
  mergeBoardCards,
} from "@/lib/wiki-board-layout";
import { parseDoneLaneQuery } from "@/lib/wiki-board-lane-query";
import { BOARD_LIMITS } from "@/lib/wiki-board";
import type { WikiBoardCard, WikiBoardLane } from "@/types/wiki-board";

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
    status: "DONE",
    laneKey: "DONE",
    orderKey: 0,
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** n finished cards, card i finished i days after 1 Jan, so the highest number is the newest. */
function finished(n: number, prefix = "c", over: Partial<WikiBoardCard> = {}) {
  const cards = Array.from({ length: n }, (_, i) => card(`${prefix}${i + 1}`, over));
  const completedAt = new Map(cards.map((c, i) => [c.id, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()] as const));
  return { cards, completedAt };
}

describe("one page of a Done column", () => {
  it("pages newest first until the end, with every card exactly once", () => {
    const { cards, completedAt } = finished(77);
    const seen: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page = doneLanePage({ cards, laneKey: "DONE", kind: "cards", completedAt, offset, limit: 30 });
      expect(page.total).toBe(77);
      seen.push(...page.cards.map((c) => c.id));
      offset = page.nextOffset;
    }
    expect(seen).toHaveLength(77);
    expect(new Set(seen).size).toBe(77);
    expect(seen[0]).toBe("c77");
    expect(seen[76]).toBe("c1");
  });

  it("starts with exactly the cards the board already shows", () => {
    const { cards, completedAt } = finished(77);
    const board = layoutBoard({ cards, columns: [], releases: [], completedAt });
    const done = board.lanes.find((l) => l.key === "DONE")!;
    const shown = done.groups.flatMap((g) => g.cards.map((c) => c.id)).sort();
    const first = doneLanePage({ cards, laneKey: "DONE", kind: "cards", completedAt, offset: 0, limit: BOARD_LIMITS.doneLaneCards });
    expect(first.cards.map((c) => c.id).sort()).toEqual(shown);
    expect(done.hidden.cards).toBe(77 - BOARD_LIMITS.doneLaneCards);
  });

  it("keeps product cards and the team's other tasks apart", () => {
    const a = finished(3, "c");
    const b = finished(2, "d", { isCard: false, itemType: null });
    const completedAt = new Map([...a.completedAt, ...b.completedAt]);
    const cards = [...a.cards, ...b.cards];
    expect(doneLanePage({ cards, laneKey: "DONE", kind: "cards", completedAt, offset: 0, limit: 100 }).cards.map((c) => c.id)).toEqual(["c3", "c2", "c1"]);
    expect(doneLanePage({ cards, laneKey: "DONE", kind: "other", completedAt, offset: 0, limit: 100 }).total).toBe(2);
  });

  it("only reads the column it was asked for", () => {
    const { cards, completedAt } = finished(3);
    const elsewhere = card("x", { laneKey: "col_live" });
    expect(doneLanePage({ cards: [...cards, elsewhere], laneKey: "col_live", kind: "cards", completedAt, offset: 0, limit: 100 }).cards.map((c) => c.id)).toEqual(["x"]);
  });

  it("orders ties by id, so two reads agree on where a page ends", () => {
    const cards = [card("b"), card("a"), card("c")];
    const same = new Map(cards.map((c) => [c.id, "2026-02-01T00:00:00.000Z"] as const));
    expect(byRecency(cards, same).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("never carries more than the page maximum", () => {
    const { cards, completedAt } = finished(250);
    const page = doneLanePage({ cards, laneKey: "DONE", kind: "cards", completedAt, offset: 0, limit: 10_000 });
    expect(page.cards).toHaveLength(DONE_PAGE_MAX);
    expect(page.nextOffset).toBe(DONE_PAGE_MAX);
  });
});

describe("the cards on screen", () => {
  it("adds the older cards once, and the board's own copy wins", () => {
    const shown = [card("a", { title: "fresh" }), card("b")];
    const older = [card("a", { title: "stale" }), card("c"), card("c")];
    const merged = mergeBoardCards(shown, older);
    expect(merged.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(merged[0].title).toBe("fresh");
  });
});

describe("what a Done column still leaves out", () => {
  const lane: WikiBoardLane = {
    key: "DONE",
    label: "Done",
    stage: "DONE",
    columnId: null,
    canAdd: false,
    total: { cards: 77, other: 60 },
    hidden: { cards: 27, other: 10 },
    groups: [],
  };
  it("counts the other tasks only where this view shows them", () => {
    expect(laneLeftOut(lane, false, false)).toBe(27);
    expect(laneLeftOut(lane, true, false)).toBe(37);
  });
  it("is nothing once the column's older cards have been read", () => {
    expect(laneLeftOut(lane, true, true)).toBe(0);
  });
  it("reads the team's other tasks only for someone who may see them", () => {
    expect(laneKindsToRead(lane, false)).toEqual(["cards"]);
    expect(laneKindsToRead(lane, true)).toEqual(["cards", "other"]);
    expect(laneKindsToRead({ ...lane, stage: "DOING" }, true)).toEqual([]);
  });
});

describe("the page query", () => {
  it("defaults to the first page of product cards", () => {
    expect(parseDoneLaneQuery(new URLSearchParams())).toEqual({ kind: "cards", offset: 0, limit: DONE_PAGE_MAX });
  });
  it("refuses a bad kind, a huge page or an unknown parameter instead of guessing", () => {
    expect(() => parseDoneLaneQuery(new URLSearchParams("kind=all"))).toThrow();
    expect(() => parseDoneLaneQuery(new URLSearchParams(`limit=${DONE_PAGE_MAX + 1}`))).toThrow();
    expect(() => parseDoneLaneQuery(new URLSearchParams("audience=team"))).toThrow();
  });
});
