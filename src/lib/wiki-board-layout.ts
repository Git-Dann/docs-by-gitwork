/**
 * Cards → the client's Board: columns in the board's order, cards grouped by release inside each,
 * Done columns capped. Pure, so the server and the demo build the board the same way.
 */

import { boardLanes, type BoardColumnDef } from "@/lib/tasks/board-columns";
import { BOARD_LIMITS, clientCanAddToStage, clientMayActOn } from "@/lib/wiki-board";
import type { WikiBoardCard, WikiBoardGroup, WikiBoardLane, WikiBoardRelease, WikiBoardSection } from "@/types/wiki-board";

/** Newest first, for capping a Done column: when it went live, else when it last changed. */
function recency(c: WikiBoardCard, completedAt: ReadonlyMap<string, string | null>): number {
  return new Date(completedAt.get(c.id) ?? c.updatedAt).getTime();
}

/**
 * A Done column's cards in the order it shows them: newest first, ties by id so two reads always
 * agree on the order (a page boundary can't skip or repeat a card that finished at the same time).
 */
export function byRecency(cards: readonly WikiBoardCard[], completedAt: ReadonlyMap<string, string | null>): WikiBoardCard[] {
  return [...cards].sort((a, b) => recency(b, completedAt) - recency(a, completedAt) || a.id.localeCompare(b.id));
}

/** Which half of a Done column a page reads: product cards, or the team's other tasks. */
export type DoneLaneKind = "cards" | "other";

/** The most cards one page of a Done column carries. */
export const DONE_PAGE_MAX = 100;

export interface DoneLanePage {
  cards: WikiBoardCard[];
  /** Everything of this kind in the column. */
  total: number;
  /** Where the next page starts, or null when this was the last. */
  nextOffset: number | null;
}

/**
 * One page of a Done column, newest first, from the same ordering the board caps by, so page one
 * starts with the cards the board already shows. The board sends only the newest
 * `BOARD_LIMITS.doneLaneCards`; this is how the rest is read when someone asks for it.
 */
export function doneLanePage(input: {
  cards: readonly WikiBoardCard[];
  laneKey: string;
  kind: DoneLaneKind;
  completedAt: ReadonlyMap<string, string | null>;
  offset: number;
  limit: number;
}): DoneLanePage {
  const offset = Math.max(0, Math.floor(input.offset));
  const limit = Math.min(DONE_PAGE_MAX, Math.max(1, Math.floor(input.limit)));
  const inLane = input.cards.filter((c) => c.laneKey === input.laneKey && (input.kind === "cards" ? c.isCard : !c.isCard));
  const sorted = byRecency(inLane, input.completedAt);
  const page = sorted.slice(offset, offset + limit);
  const end = offset + page.length;
  return { cards: page, total: sorted.length, nextOffset: end < sorted.length ? end : null };
}

/** Cards under each release heading, in the releases' order, then "No release" last. */
export function groupByRelease(
  cards: WikiBoardCard[],
  releases: ReadonlyArray<Omit<WikiBoardRelease, "cards" | "done">>,
): WikiBoardGroup[] {
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
/** How many of the client's cards each release holds, and how many are done (src/types/wiki-board.ts). */
export function countReleaseCards(
  cards: readonly WikiBoardCard[],
  releases: ReadonlyArray<Omit<WikiBoardRelease, "cards" | "done">>,
): WikiBoardRelease[] {
  return releases.map((r) => {
    const own = cards.filter((c) => c.release?.id === r.id && clientMayActOn(c));
    return { ...r, cards: own.length, done: own.filter((c) => c.status === "DONE").length };
  });
}

export function layoutBoard(input: {
  cards: WikiBoardCard[];
  columns: readonly BoardColumnDef[];
  releases: ReadonlyArray<Omit<WikiBoardRelease, "cards" | "done">>;
  completedAt: ReadonlyMap<string, string | null>;
}): WikiBoardSection {
  const { cards, columns, completedAt } = input;
  const releases = countReleaseCards(cards, input.releases);
  const lanes: WikiBoardLane[] = boardLanes(columns).map((lane) => {
    const inLane = cards.filter((c) => c.laneKey === lane.key);
    const own = inLane.filter((c) => c.isCard);
    const other = inLane.filter((c) => !c.isCard);
    const cap = (list: WikiBoardCard[]) =>
      lane.stage === "DONE" ? byRecency(list, completedAt).slice(0, BOARD_LIMITS.doneLaneCards) : list;
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
  return { enabled: true, showAllTasks: false, lanes, releases, areas, keyDates: [] };
}

/**
 * The cards on screen: the board's own, plus the older Done cards read since. The board's copy of
 * a card wins (it's the freshest read), and nothing appears twice.
 */
export function mergeBoardCards(shown: readonly WikiBoardCard[], older: readonly WikiBoardCard[]): WikiBoardCard[] {
  const seen = new Set(shown.map((c) => c.id));
  return [...shown, ...older.filter((c) => !seen.has(c.id) && seen.add(c.id))];
}

/**
 * What a Done column still leaves out for this viewer: its product cards, plus the team's other
 * tasks when this view counts them. Zero once the column's older cards have been read.
 */
export function laneLeftOut(lane: WikiBoardLane, countOther: boolean, loaded: boolean): number {
  if (loaded || lane.stage !== "DONE") return 0;
  return lane.hidden.cards + (countOther ? lane.hidden.other : 0);
}

/**
 * Which kinds of a Done column to read for a viewer: product cards when any are left out, and the
 * team's other tasks only when the viewer may see them (the team, or a client while the team
 * shows them). Empty when the column sends everything already.
 */
export function laneKindsToRead(lane: WikiBoardLane, mayseeOther: boolean): DoneLaneKind[] {
  if (lane.stage !== "DONE") return [];
  const kinds: DoneLaneKind[] = [];
  if (lane.hidden.cards > 0) kinds.push("cards");
  if (mayseeOther && lane.hidden.other > 0) kinds.push("other");
  return kinds;
}
