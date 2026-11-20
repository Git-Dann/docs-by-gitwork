/**
 * What the wiki needs to know about a client's Board without the Board itself: whether it has
 * anything on it (which decides if it's offered to the client) and the dashboard card's figures.
 * The wiki sends this, and the Board page loads its cards on its own (CLAUDE.md §140). Pure.
 */
import type { WikiBoardSection, WikiBoardSummary } from "@/types/wiki-board";

export function summariseBoard(board: Pick<WikiBoardSection, "lanes">): WikiBoardSummary {
  const cards = board.lanes.flatMap((l) => l.groups.flatMap((g) => g.cards)).filter((c) => c.isCard);
  return {
    items: board.lanes.reduce((n, l) => n + l.total.cards + l.total.other, 0),
    cards: cards.length,
    waiting: cards.filter((c) => c.status === "IN_REVIEW" && !c.signOff).length,
    approved: cards.filter((c) => c.signOff === "approved").length,
    changes: cards.filter((c) => c.signOff === "changes_requested").length,
  };
}

/** The summary, whether the wiki sent the whole Board or only its summary. */
export function boardSummaryOf(board: Pick<WikiBoardSection, "lanes" | "summary">): WikiBoardSummary {
  return board.summary ?? summariseBoard(board);
}

/** The Board as the wiki sends it: on/off and the summary, no cards. */
export function liteBoard(board: WikiBoardSection): WikiBoardSection {
  return {
    enabled: board.enabled,
    showAllTasks: board.showAllTasks,
    lanes: [],
    releases: [],
    areas: [],
    keyDates: [],
    summary: summariseBoard(board),
  };
}
