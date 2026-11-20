import { describe, expect, it } from "vitest";
import { boardSummaryOf, liteBoard, summariseBoard } from "@/lib/wiki-board-summary";
import type { WikiBoardSection } from "@/types/wiki-board";

const card = (over: Record<string, unknown>) => ({ isCard: true, status: "TODO", signOff: null, ...over });
const board = {
  enabled: true,
  showAllTasks: false,
  releases: [],
  areas: [],
  keyDates: [],
  lanes: [
    { total: { cards: 3, other: 2 }, groups: [{ cards: [card({ status: "IN_REVIEW" }), card({ signOff: "approved" }), card({ isCard: false })] }] },
    { total: { cards: 40, other: 0 }, groups: [{ cards: [card({ signOff: "changes_requested" })] }] },
  ],
} as unknown as WikiBoardSection;

describe("the Board summary the wiki sends instead of the cards", () => {
  it("counts everything on the board from the column totals, and the dashboard's figures from the cards", () => {
    expect(summariseBoard(board)).toEqual({ items: 45, cards: 3, waiting: 1, approved: 1, changes: 1 });
  });

  it("a light board keeps on/off and the summary, and carries no cards", () => {
    const lite = liteBoard(board);
    expect(lite.lanes).toEqual([]);
    expect(lite.enabled).toBe(true);
    expect(lite.summary).toEqual(summariseBoard(board));
    expect(boardSummaryOf(lite)).toEqual(summariseBoard(board));
  });

  it("works on a full board that has no summary", () => {
    expect(boardSummaryOf(board).items).toBe(45);
  });
});
