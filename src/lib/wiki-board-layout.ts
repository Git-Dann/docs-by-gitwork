/**
 * Cards → the client's Board: columns in the board's order, cards grouped by release inside each,
 * Done columns capped. Pure, so the server and the demo build the board the same way.
 */

import { boardLanes, type BoardColumnDef } from "@/lib/tasks/board-columns";
import { BOARD_LIMITS, clientCanAddToStage } from "@/lib/wiki-board";
import type { WikiBoardCard, WikiBoardGroup, WikiBoardLane, WikiBoardRelease, WikiBoardSection } from "@/types/wiki-board";

/** Newest first, for capping a Done column: when it went live, else when it last changed. */
function recency(c: WikiBoardCard, completedAt: ReadonlyMap<string, string | null>): number {
  return new Date(completedAt.get(c.id) ?? c.updatedAt).getTime();
}

/** Cards under each release heading, in the releases' order, then "No release" last. */
export function groupByRelease(cards: WikiBoardCard[], releases: readonly WikiBoardRelease[]): WikiBoardGroup[] {
  const known = new Set(releases.map((r) => r.id));
  const groups: WikiBoardGroup[] = [];
  for (const r of releases) {
    const list = cards.filter((c) => c.release?.id === r.id);
    if (list.length) {
      groups.push({ releaseId: r.id, label: r.label, startDate: r.startDate, endDate: r.endDate, cards: list.sort((a, b) => a.orderKey - b.orderKey) });
    }
  }
  const loose = cards.filter((c) => !c.release || !known.has(c.release.id));
  if (loose.length) {
    groups.push({ releaseId: null, label: "No release", startDate: null, endDate: null, cards: loose.sort((a, b) => a.orderKey - b.orderKey) });
  }
  return groups;
}

/**
 * A Done column sends its newest 50 product cards and newest 50 other tasks, with counts for the
 * rest, so a long-running client's board stays a board. Other columns send everything.
 */
export function layoutBoard(input: {
  cards: WikiBoardCard[];
  columns: readonly BoardColumnDef[];
  releases: WikiBoardRelease[];
  completedAt: ReadonlyMap<string, string | null>;
}): WikiBoardSection {
  const { cards, columns, releases, completedAt } = input;
  const lanes: WikiBoardLane[] = boardLanes(columns).map((lane) => {
    const inLane = cards.filter((c) => c.laneKey === lane.key);
    const own = inLane.filter((c) => c.isCard);
    const other = inLane.filter((c) => !c.isCard);
    const cap = (list: WikiBoardCard[]) =>
      lane.stage === "DONE"
        ? [...list].sort((a, b) => recency(b, completedAt) - recency(a, completedAt)).slice(0, BOARD_LIMITS.doneLaneCards)
        : list;
    const shownCards = cap(own);
    const shownOther = cap(other);
    return {
      key: lane.key,
      label: lane.label,
      stage: lane.stage,
      columnId: lane.columnId,
      canAdd: clientCanAddToStage(lane.stage),
      total: { cards: own.length, other: other.length },
      hidden: { cards: own.length - shownCards.length, other: other.length - shownOther.length },
      groups: groupByRelease([...shownCards, ...shownOther], releases),
    };
  });
  const areas = [...new Set(cards.map((c) => c.area?.trim()).filter((a): a is string => Boolean(a)))].sort((a, b) =>
    a.localeCompare(b),
  );
  // Whether the client sees the team's dev tasks too is the wiki's setting, applied by the
  // loader; the layout itself is the same either way.
  return { enabled: true, showAllTasks: false, lanes, releases, areas };
}
