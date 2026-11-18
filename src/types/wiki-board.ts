/**
 * The client's Board in their wiki (src/lib/wiki-board.ts, src/server/wiki-board.ts).
 *
 * Every field here can reach the client, so it is a deliberate allow-list: no emails, no user
 * ids, no internal notes, no money. People on a card are first name + initial only.
 */

import type { CardProgress } from "@/lib/tasks/product-cards";
import type { SignOff } from "@/lib/wiki-board";
import type { TaskPriority, TaskStatus } from "@/types/tasks";

export interface WikiBoardCard {
  id: string;
  title: string;
  itemType: string | null;
  tier: string | null;
  area: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  /** The lane the card sits in (a board column id, or the status). Derived, never stored. */
  laneKey: string;
  orderKey: number;
  release: { id: string; label: string } | null;
  /** Linked dev tasks, for a product card. Null when none are linked. */
  progress: CardProgress | null;
  dueDate: string | null;
  /** "Hassaan B." — never emails or full names. */
  people: string[];
  signOff: SignOff;
  feedbackCount: number;
  description: string | null;
  subtasks: Array<{ title: string; done: boolean }>;
  /** A product card (has an item type). The board shows cards by default; dev tasks on request. */
  isCard: boolean;
  /** Added by the client from their board. */
  addedByClient: boolean;
  updatedAt: string;
}

export interface WikiBoardGroup {
  /** Null = cards with no release. */
  releaseId: string | null;
  label: string;
  startDate: string | null;
  endDate: string | null;
  cards: WikiBoardCard[];
}

export interface WikiBoardLane {
  key: string;
  label: string;
  stage: TaskStatus;
  columnId: string | null;
  /** The client may add a card here (Backlog and To do stages). */
  canAdd: boolean;
  /** Everything in the lane, including any left out (a Done lane is capped). */
  total: { cards: number; other: number };
  /** Left out of this view: a Done lane sends its newest 50 cards and newest 50 other tasks. */
  hidden: { cards: number; other: number };
  groups: WikiBoardGroup[];
}

export interface WikiBoardRelease {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
}

export interface WikiBoardSection {
  enabled: boolean;
  lanes: WikiBoardLane[];
  /** Every release the client has, in order: for filters and the Add card form. */
  releases: WikiBoardRelease[];
  /** Product areas in use, for the filter. */
  areas: string[];
}

export interface WikiBoardFeedback {
  id: string;
  kind: "comment" | "approved" | "changes_requested";
  body: string | null;
  authorName: string;
  /** Who it came from: shown as "Client" or "Gitwork". */
  side: "client" | "team";
  createdAt: string;
}

/** What the board needs to place a card a client just made or moved, without a refetch. */
export interface WikiBoardMoveResult {
  card: WikiBoardCard;
}
