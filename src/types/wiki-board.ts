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
  /**
   * The named list the card belongs to (`Task.boardList`), e.g. "QA review: 20 Oct 2026": the
   * Table view groups by it. What Sheets used to hold lives here now (§127). Null = no list.
   */
  list: string | null;
  priority: TaskPriority;
  /** Hours estimated for the card, or null. */
  estimateHours: number | null;
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
  /**
   * Its child tasks, in order. `isItem` marks a product SUB-ITEM (itemType "subitem" under a
   * top-level feature card): those open in the card popup and are edited there. The rest are the
   * team's checklist items, listed only; in the client's copy those carry no id (null).
   */
  subtasks: Array<{ id: string | null; title: string; done: boolean; isItem: boolean }>;
  /**
   * The card's image attachments (ids), oldest first: screenshots from the client's planning tool
   * or added by the team. Cards the client may act on only; a dev task's are never sent.
   */
  images: string[];
  /**
   * Images taken off the card (by the client or the team), newest last, so the team can put one
   * back. The TEAM's copy only: always empty in the client's.
   */
  removedImages: Array<{ id: string; removedAt: string; removedByName: string | null }>;
  /**
   * When the card entered each stage on the client's own planning tool (imported), oldest first.
   * Empty for cards made in Foundry. Cards the client may act on only.
   */
  stageHistory: Array<{ label: string; date: string }>;
  /**
   * When the card was finished (`task.completedAt`), for the Schedule's "what happened" log.
   * Cards the client may act on only; null for a dev task and anything not done.
   */
  doneAt: string | null;
  /**
   * Other cards on this board this one depends on (`task.metadata.dependsOn`), with their titles.
   * The client's copy keeps only cards the client can see.
   */
  dependsOn: Array<{ id: string; title: string }>;
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
  /** The changelog version it ships as ("2.0.4"), or null (§161). Client-safe: a version number. */
  changelogVersion?: string | null;
  /**
   * The client's cards in this release, and how many are done. Counted from every card, before a
   * Done column is capped, so the timeline's "% done" isn't understated. Cards the client sees
   * (product cards and cards they added) only, never the team's dev tasks.
   */
  cards: number;
  done: number;
}

export interface WikiBoardSection {
  enabled: boolean;
  /**
   * The team chose to show the client its plain dev tasks as well as product cards. Off by
   * default. Even on, the client gets a dev task's title, column and people, read-only.
   */
  showAllTasks: boolean;
  lanes: WikiBoardLane[];
  /** Every release the client has, in order: for filters and the Add card form. */
  releases: WikiBoardRelease[];
  /** Product areas in use, for the filter. */
  areas: string[];
  /**
   * The client's key dates (content drops, launches, events) for the Schedule, oldest first.
   * Client-facing: both copies carry them.
   */
  keyDates: WikiBoardKeyDate[];
  /**
   * TEAM copy only: cards the client deleted (soft), newest first, so the team can put one back.
   * Never sent to the client.
   */
  deleted?: WikiBoardDeletedCard[];
  /** TEAM copy only: how many deleted cards there are in all, when `deleted` holds only the newest. */
  deletedTotal?: number;
  /**
   * Set when the wiki sent only the summary (no lanes): the Board page loads its cards on its
   * own. Read it through `boardSummaryOf`, which also works on a full Board.
   */
  summary?: WikiBoardSummary;
}

/** A Board's figures for the dashboard card and the client-section check (src/lib/wiki-board-summary.ts). */
export interface WikiBoardSummary {
  /** Everything on the Board, cards and other tasks, across every column (incl. ones not drawn). */
  items: number;
  /** Product cards drawn on the Board. */
  cards: number;
  waiting: number;
  approved: number;
  changes: number;
}

/** A dated event on the client's Schedule that isn't a card: a content drop, a launch, an event. */
export interface WikiBoardKeyDate {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  note: string | null;
  /** Imported from the client's planning tool (it can still be edited or deleted here). */
  imported: boolean;
}

export interface WikiBoardDeletedCard {
  id: string;
  title: string;
  itemType: string | null;
  deletedBy: string;
  deletedAt: string;
}

export interface WikiBoardFeedback {
  id: string;
  /** "change": written by the board when someone edits, moves, deletes or restores the card. */
  kind: "comment" | "approved" | "changes_requested" | "change";
  body: string | null;
  authorName: string;
  /** Who it came from: shown as "Client" or "Gitwork". */
  side: "client" | "team";
  createdAt: string;
  /**
   * TEAM reads only: on a client's edit, the title and/or description as they were before it,
   * so the team can see what was replaced. Never in what the client's page receives.
   */
  previous?: { title?: string | null; description?: string | null };
}

/** What the board needs to place a card a client just made or moved, without a refetch. */
export interface WikiBoardMoveResult {
  card: WikiBoardCard;
}
