/**
 * The client's Board in their wiki: their product cards on the team's own task board, grouped by
 * release. Rules are in src/lib/wiki-board.ts; who may write is decided in wiki-board-access.ts.
 *
 * Reads ride down in the wiki DTO (`loadWikiBoard`), cut down for the client by `forPublicBoard`.
 * Every write goes to the same Task rows the team works from: a card a client adds is a real
 * task on the board at once, and a move is a real status change. Nothing is copied, so nothing
 * can be lost between the two.
 */

import { stageHistoryOf } from "@/lib/wiki-board-stage-history";
import type { Prisma } from "@prisma/client";
import { bytesForPrisma } from "@/lib/prisma-bytes";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { assertClientInScope, moveTaskForClient } from "@/server/tasks";
import {
  assertWithinBoardCardQuota,
  assertWithinBoardFeedbackQuota,
  consumeBoardQuota,
  countClientCards,
  pruneBoardQuota,
  shouldNotifyBoardCards,
  shouldNotifyCardChange,
} from "@/server/wiki-board-limit";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { boardLanes, laneKeyFor, parseBoardColumns, type BoardLane } from "@/lib/tasks/board-columns";
import { layoutBoard } from "@/lib/wiki-board-layout";
import { BOARD_LIST_MAX, cardProgress, isProductCard } from "@/lib/tasks/product-cards";
import { releaseLabel, sortReleases } from "@/lib/tasks/releases";
import {
  BOARD_LIMITS,
  cardDescription,
  clientCanAddToStage,
  clientMayActOn,
  deriveSignOff,
  FEEDBACK_KINDS,
  feedbackRefusal,
  isAddressableSubItem,
  shortPersonName,
  SIGN_OFF_LABELS,
  type BoardEditType,
  type ClientCardType,
  type FeedbackKind,
} from "@/lib/wiki-board";
import {
  changeSentence,
  checkBoardImages,
  dependsOnRefusal,
  describeCardChanges,
  imagesSentence,
  splitCardDescription,
  subItemParentRefusal,
  type CardFields,
} from "@/lib/wiki-board-edit";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type {
  WikiBoardCard,
  WikiBoardDeletedCard,
  WikiBoardFeedback,
  WikiBoardKeyDate,
  WikiBoardSection,
} from "@/types/wiki-board";

export const EMPTY_BOARD: WikiBoardSection = { enabled: false, showAllTasks: false, lanes: [], releases: [], areas: [], keyDates: [] };

/** A write the board refuses, with a sentence the client can act on. */
export class BoardError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Who is writing, resolved from their sign-in, never from the request body. */
export interface BoardWriter {
  wikiId: string;
  clientId: string;
  clientSlug: string;
  /** What to show on what they wrote. */
  name: string;
  /** A client user signed in to their wiki. */
  wikiUserId: string | null;
  /** A Gitwork team member (on the client's page, or the team's own routes). */
  userId: string | null;
}

const TASK_SELECT = {
  id: true,
  title: true,
  parentId: true,
  status: true,
  boardColumnId: true,
  orderKey: true,
  priority: true,
  estimateHours: true,
  dueDate: true,
  updatedAt: true,
  completedAt: true,
  // No `description` here. A dev task's description holds internal notes, so it is never
  // loaded for the board at all; cards' descriptions are read separately (`descriptionsFor`).
  itemType: true,
  tier: true,
  area: true,
  boardList: true,
  releaseId: true,
  metadata: true,
  assignee: { select: { name: true, email: true } },
  assignees: { select: { name: true, email: true } },
  subtasks: {
    where: { archivedAt: null },
    orderBy: { orderKey: "asc" },
    select: { id: true, title: true, status: true, itemType: true },
  },
} as const satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Descriptions for the cards on the board: product cards and cards the client added, and nothing
 * else. One query for the lot.
 */
async function descriptionsFor(rows: TaskRow[]): Promise<Map<string, string | null>> {
  const ids = rows.filter((r) => clientMayActOn({ isCard: isProductCard(r), addedByClient: addedByClient(r.metadata) })).map((r) => r.id);
  if (!ids.length) return new Map();
  const found = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } });
  return new Map(found.map((r) => [r.id, r.description]));
}

/**
 * Image attachments for the same cards `descriptionsFor` covers, oldest first, in one query: the
 * live ones (`images`) and the ones taken off the card (`removed`, the team's copy only, so they
 * can be put back). A removed image is never served as a live one.
 */
async function imagesFor(rows: TaskRow[]): Promise<{
  live: Map<string, string[]>;
  removed: Map<string, WikiBoardCard["removedImages"]>;
}> {
  const ids = rows.filter((r) => clientMayActOn({ isCard: isProductCard(r), addedByClient: addedByClient(r.metadata) })).map((r) => r.id);
  const live = new Map<string, string[]>();
  const removed = new Map<string, WikiBoardCard["removedImages"]>();
  if (!ids.length) return { live, removed };
  const found = await prisma.taskAttachment.findMany({
    where: { taskId: { in: ids } },
    select: { id: true, taskId: true, removedAt: true, removedByName: true },
    orderBy: { createdAt: "asc" },
  });
  for (const a of found) {
    if (a.removedAt) {
      removed.set(a.taskId, [
        ...(removed.get(a.taskId) ?? []),
        { id: a.id, removedAt: a.removedAt.toISOString(), removedByName: a.removedByName },
      ]);
    } else {
      live.set(a.taskId, [...(live.get(a.taskId) ?? []), a.id]);
    }
  }
  return { live, removed };
}

/** Only images still on the card: a removed one is kept for the team to restore, never shown. */
const LIVE_IMAGE = { removedAt: null } as const;

/** The card ids a card depends on (`metadata.dependsOn`), as stored. Anything malformed is ignored. */
export function dependsOnIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const list = (metadata as Record<string, unknown>).dependsOn;
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string").slice(0, 50) : [];
}

function metaObject(metadata: unknown): Prisma.JsonObject {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Prisma.JsonObject) } : {};
}

function addedByClient(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && "createdByClient" in (metadata as Record<string, unknown>));
}

/** First name + initial. An email is never shown: the part before "@" stands in for a missing name. */
function peopleOf(row: TaskRow): string[] {
  const list = row.assignees.length ? row.assignees : row.assignee ? [row.assignee] : [];
  return list
    .map((u) => shortPersonName(u.name?.trim() || u.email.split("@")[0]))
    .filter((n): n is string => Boolean(n));
}

interface CardContext {
  columns: ReturnType<typeof parseBoardColumns>;
  releaseById: Map<string, { id: string; label: string }>;
  feedback: Map<string, Array<{ kind: string; createdAt: Date }>>;
  progress: Map<string, TaskStatus[]>;
  /** Cards' descriptions only (`descriptionsFor`); a dev task has none here. */
  descriptions: Map<string, string | null>;
  /** Cards' image attachment ids only (`imagesFor`); a dev task has none here. */
  images: Map<string, string[]>;
  /** Images taken off a card, for the team's Restore. Never in the client's copy. */
  removedImages: Map<string, WikiBoardCard["removedImages"]>;
  /** Titles of the live top-level tasks a card depends on, for its "Depends on" list. */
  titles: Map<string, string>;
}

function toCard(row: TaskRow, ctx: CardContext): WikiBoardCard {
  const status = row.status as TaskStatus;
  const entries = ctx.feedback.get(row.id) ?? [];
  const isCard = isProductCard(row);
  return {
    id: row.id,
    title: row.title,
    itemType: row.itemType,
    tier: row.tier,
    area: row.area,
    list: row.boardList,
    priority: row.priority as TaskPriority,
    estimateHours: row.estimateHours ?? null,
    status,
    laneKey: laneKeyFor({ status, boardColumnId: row.boardColumnId }, ctx.columns),
    orderKey: row.orderKey,
    release: row.releaseId ? (ctx.releaseById.get(row.releaseId) ?? null) : null,
    progress: isCard ? cardProgress(ctx.progress.get(row.id) ?? []) : null,
    dueDate: row.dueDate?.toISOString() ?? null,
    people: peopleOf(row),
    signOff: deriveSignOff(entries),
    feedbackCount: entries.length,
    description: ctx.descriptions.get(row.id) ?? null,
    subtasks: row.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      done: s.status === "DONE",
      isItem: isAddressableSubItem(row, s.itemType),
    })),
    images: ctx.images.get(row.id) ?? [],
    removedImages: ctx.removedImages.get(row.id) ?? [],
    stageHistory: stageHistoryOf(row.metadata),
    // When it was finished, for the Schedule's log. The client's own cards only: a dev task's
    // dates are the team's.
    doneAt: status === "DONE" && clientMayActOn({ isCard, addedByClient: addedByClient(row.metadata) })
      ? (row.completedAt?.toISOString() ?? null)
      : null,
    dependsOn: dependsOnIds(row.metadata)
      .filter((id) => ctx.titles.has(id))
      .map((id) => ({ id, title: ctx.titles.get(id)! })),
    isCard,
    addedByClient: addedByClient(row.metadata),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every feedback entry and linked-task status for these tasks: two queries, however many tasks. */
async function cardContext(
  workspaceId: string,
  clientId: string,
  columns: CardContext["columns"],
  rows: TaskRow[],
): Promise<CardContext & { releases: Array<{ id: string; label: string; startDate: Date | null; endDate: Date | null }> }> {
  const ids = rows.map((r) => r.id);
  const cardIds = rows.filter((r) => isProductCard(r)).map((r) => r.id);
  const [releaseRows, feedbackRows, linked, descriptions, images] = await Promise.all([
    prisma.clientRelease.findMany({
      where: { clientId },
      select: { id: true, version: true, name: true, startDate: true, endDate: true, orderKey: true },
    }),
    ids.length
      ? prisma.taskClientFeedback.findMany({
          // Change entries are a record of edits, not feedback: they don't count or sign off.
          where: { taskId: { in: ids }, kind: { in: [...FEEDBACK_KINDS] } },
          select: { taskId: true, kind: true, createdAt: true },
        })
      : Promise.resolve([]),
    cardIds.length
      ? prisma.task.groupBy({
          by: ["productCardId", "status"],
          where: { workspaceId, productCardId: { in: cardIds }, archivedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    descriptionsFor(rows),
    imagesFor(rows),
  ]);
  const titles = new Map(rows.map((r) => [r.id, r.title]));
  const missing = [...new Set(rows.flatMap((r) => dependsOnIds(r.metadata)))].filter((id) => !titles.has(id));
  if (missing.length) {
    const found = await prisma.task.findMany({
      where: { id: { in: missing }, clientId, parentId: null, archivedAt: null },
      select: { id: true, title: true },
    });
    for (const t of found) titles.set(t.id, t.title);
  }
  const releases = sortReleases(releaseRows).map((r) => ({
    id: r.id,
    label: releaseLabel(r),
    startDate: r.startDate,
    endDate: r.endDate,
  }));
  const feedback = new Map<string, Array<{ kind: string; createdAt: Date }>>();
  for (const f of feedbackRows) {
    const list = feedback.get(f.taskId) ?? [];
    list.push(f);
    feedback.set(f.taskId, list);
  }
  const progress = new Map<string, TaskStatus[]>();
  for (const row of linked) {
    if (!row.productCardId) continue;
    const list = progress.get(row.productCardId) ?? [];
    for (let i = 0; i < row._count._all; i++) list.push(row.status as TaskStatus);
    progress.set(row.productCardId, list);
  }
  return {
    columns,
    releases,
    releaseById: new Map(releases.map((r) => [r.id, { id: r.id, label: r.label }])),
    feedback,
    progress,
    descriptions,
    images: images.live,
    removedImages: images.removed,
    titles,
  };
}

/**
 * The board, the TEAM copy. Top-level, live tasks only: archived work and subtasks stay off it
 * (a subtask shows inside its card). Done lanes send their newest 50 product cards and newest 50
 * other tasks, with counts for the rest, so a long-running client's board stays a board.
 */
export async function loadWikiBoard(clientId: string): Promise<WikiBoardSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      boardEnabled: true,
      boardShowAllTasks: true,
      client: { select: { workspaceId: true, taskBoardColumns: true } },
    },
  });
  if (!wiki?.boardEnabled) return EMPTY_BOARD;
  const columns = parseBoardColumns(wiki.client.taskBoardColumns);
  const rows = await prisma.task.findMany({
    where: { clientId, parentId: null, archivedAt: null },
    select: TASK_SELECT,
  });
  const ctx = await cardContext(wiki.client.workspaceId, clientId, columns, rows);
  const completedAt = new Map(rows.map((r) => [r.id, r.completedAt?.toISOString() ?? null]));
  const laid = layoutBoard({
    cards: rows.map((r) => toCard(r, ctx)),
    columns,
    releases: ctx.releases.map((r) => ({
      id: r.id,
      label: r.label,
      startDate: r.startDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
    })),
    completedAt,
  });
  const [deleted, keyDates] = await Promise.all([listDeletedBoardCards(clientId), loadBoardKeyDates(clientId)]);
  return { ...laid, showAllTasks: wiki.boardShowAllTasks, keyDates, deleted: deleted.cards, deletedTotal: deleted.total };
}

/** The most key dates the Schedule carries for one client. */
export const KEY_DATES_MAX = 500;

/** The client's live key dates, oldest first (src/server/wiki-board-key-dates.ts writes them). */
export async function loadBoardKeyDates(clientId: string): Promise<WikiBoardKeyDate[]> {
  const rows = await prisma.wikiBoardKeyDate.findMany({
    where: { clientId, archivedAt: null },
    orderBy: [{ date: "asc" }, { title: "asc" }],
    take: KEY_DATES_MAX,
    select: { id: true, title: true, date: true, note: true, externalRef: true },
  });
  return rows.map(keyDateDTO);
}

export function keyDateDTO(row: { id: string; title: string; date: Date; note: string | null; externalRef: string | null }): WikiBoardKeyDate {
  return { id: row.id, title: row.title, date: row.date.toISOString().slice(0, 10), note: row.note, imported: Boolean(row.externalRef) };
}

/**
 * The most deleted cards the team's list carries. Client deletes are capped per wiki (30 an hour,
 * 100 a day), so this is far more than a day's worth; past it the list says how many there are.
 */
export const DELETED_LIST_MAX = 1000;

/** Cards deleted from the board (soft), newest first: the team's "put it back" list, and how many in all. */
export async function listDeletedBoardCards(clientId: string): Promise<{ cards: WikiBoardDeletedCard[]; total: number }> {
  const ids = await prisma.$queryRaw<Array<{ id: string; total: bigint }>>`
    SELECT "id", count(*) OVER () AS total FROM "Task"
    WHERE "clientId" = ${clientId} AND ("parentId" IS NULL OR "itemType" = 'subitem') AND "archivedAt" IS NOT NULL
      AND "metadata" ? 'deletedFromBoard'
    ORDER BY "archivedAt" DESC
    LIMIT ${DELETED_LIST_MAX}`;
  if (!ids.length) return { cards: [], total: 0 };
  const total = Number(ids[0].total ?? ids.length);
  const rows = await prisma.task.findMany({
    where: { id: { in: ids.map((r) => r.id) }, clientId },
    orderBy: { archivedAt: "desc" },
    select: { id: true, title: true, itemType: true, archivedAt: true, metadata: true },
  });
  const cards = rows.flatMap((r) => {
    const marker = metaObject(r.metadata).deletedFromBoard;
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) return [];
    const by = (marker as Record<string, unknown>).name;
    return [
      {
        id: r.id,
        title: r.title,
        itemType: r.itemType,
        deletedBy: typeof by === "string" && by ? by : "Someone",
        deletedAt: (r.archivedAt ?? new Date()).toISOString(),
      },
    ];
  });
  return { cards, total: Math.max(total, cards.length) };
}

/**
 * The client's copy. Product cards, and cards the client added, go with every client-safe field.
 * The team's plain dev tasks don't go at all, unless the team switched on `showAllTasks`; even
 * then they go as a title, a column and who's on it, and the client can't act on them (the write
 * routes check the same rule). A dev task's description is never loaded for the board in the
 * first place (`descriptionsFor`), so it can't leak through here by mistake.
 *
 * Every field is copied by name rather than spread, so one added to the card later stays on the
 * server until someone decides the client should see it.
 */
export function forPublicBoard(section: WikiBoardSection): WikiBoardSection {
  if (!section.enabled) return EMPTY_BOARD;
  // A card's "depends on" only names cards the client can see themselves.
  const visible = new Set(section.lanes.flatMap((l) => l.groups.flatMap((g) => g.cards.filter(clientMayActOn).map((c) => c.id))));
  return {
    enabled: true,
    showAllTasks: section.showAllTasks,
    releases: section.releases,
    areas: section.areas,
    // Copied field by field, like the cards: a field added later stays on the server until
    // someone decides the client should see it.
    keyDates: (section.keyDates ?? []).map((k) => ({ id: k.id, title: k.title, date: k.date, note: k.note, imported: k.imported })),
    lanes: section.lanes.map((l) => ({
      key: l.key,
      label: l.label,
      stage: l.stage,
      columnId: l.columnId,
      canAdd: l.canAdd,
      // With dev tasks hidden, the client isn't told how many there are either.
      total: section.showAllTasks ? l.total : { cards: l.total.cards, other: 0 },
      hidden: section.showAllTasks ? l.hidden : { cards: l.hidden.cards, other: 0 },
      groups: l.groups
        .map((g) => ({
          releaseId: g.releaseId,
          label: g.label,
          startDate: g.startDate,
          endDate: g.endDate,
          cards: g.cards.flatMap((c) => {
            if (clientMayActOn(c)) return [publicCard(c, visible)];
            return section.showAllTasks ? [titleOnlyCard(c)] : [];
          }),
        }))
        .filter((g) => g.cards.length > 0),
    })),
  };
}

function publicCard(c: WikiBoardCard, visible: ReadonlySet<string>): WikiBoardCard {
  return {
    id: c.id,
    title: c.title,
    itemType: c.itemType,
    tier: c.tier,
    area: c.area,
    list: c.list,
    priority: c.priority,
    estimateHours: c.estimateHours,
    status: c.status,
    laneKey: c.laneKey,
    orderKey: c.orderKey,
    release: c.release,
    progress: c.progress,
    dueDate: c.dueDate,
    people: c.people,
    signOff: c.signOff,
    feedbackCount: c.feedbackCount,
    description: c.description,
    // A checklist item or a dev subtask reaches the client as its words and tick only: the id is
    // for opening a sub-item, and only a real sub-item opens.
    subtasks: c.subtasks.map((t) => (t.isItem ? t : { id: null, title: t.title, done: t.done, isItem: false })),
    images: c.images,
    removedImages: [],
    stageHistory: c.stageHistory,
    doneAt: c.doneAt,
    dependsOn: c.dependsOn.filter((d) => visible.has(d.id)),
    isCard: c.isCard,
    addedByClient: c.addedByClient,
    updatedAt: c.updatedAt,
  };
}

/** A team dev task, when the team shows them: where it is and who's on it, nothing else. */
function titleOnlyCard(c: WikiBoardCard): WikiBoardCard {
  return {
    id: c.id,
    title: c.title,
    itemType: null,
    tier: null,
    area: null,
    list: null,
    priority: c.priority,
    estimateHours: null,
    status: c.status,
    laneKey: c.laneKey,
    orderKey: c.orderKey,
    release: c.release,
    progress: null,
    dueDate: null,
    people: c.people,
    signOff: null,
    feedbackCount: 0,
    description: null,
    subtasks: [],
    images: [],
    removedImages: [],
    stageHistory: [],
    doneAt: null,
    dependsOn: [],
    isCard: false,
    addedByClient: false,
    updatedAt: c.updatedAt,
  };
}

/**
 * A link shared for ONE section carries the Board only when that section IS the Board. The
 * Board holds the client's whole plan, so a Changelog or Sheets link mustn't ship it in the page
 * data. ⚠️ Known gap (Nov 2026): other sections are not cut down this way; a per-section link
 * still sends the rest of the wiki DTO, behind the wiki login. Only the Board is scoped here.
 */
export function scopeBoardToSection<T extends { board: WikiBoardSection }>(dto: T, onlySection: string | null): T {
  if (!onlySection || onlySection === "board") return dto;
  return { ...dto, board: EMPTY_BOARD };
}

/** "The client has at least one card to look at" — the share page's predicate for the section. */
export function boardHasCards(section: WikiBoardSection): boolean {
  return section.lanes.some((l) => l.total.cards + l.total.other > 0);
}

/* ─────────────────────────────────────────────────────────── writes ── */

/**
 * What a board write may address: a live top-level task, or a product SUB-ITEM (itemType
 * "subitem") whose parent is a live top-level FEATURE card on the same client. Any other child
 * task — a dev task's subtask, a checklist item under a card — is a 404, the same answer as a task
 * that doesn't exist. Checked in code rather than in the query, so the rule reads in one place.
 */
async function assertAddressable(clientId: string, task: { parentId: string | null; itemType: string | null }): Promise<void> {
  if (!task.parentId) return;
  if (task.itemType !== "subitem") throw new BoardError("Not found", 404);
  const parent = await prisma.task.findFirst({
    where: { id: task.parentId, clientId, parentId: null, archivedAt: null },
    select: { itemType: true },
  });
  if (!parent || !isAddressableSubItem({ parentId: null, itemType: parent.itemType }, task.itemType)) {
    throw new BoardError("Not found", 404);
  }
}

/** The card (or a product sub-item, `assertAddressable`), on this client and live, or a 404. */
async function loadOwnTask(clientId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId, archivedAt: null },
    select: {
      id: true,
      parentId: true,
      title: true,
      status: true,
      boardColumnId: true,
      workspaceId: true,
      assigneeId: true,
      itemType: true,
      metadata: true,
      assignees: { select: { id: true } },
      client: { select: { slug: true, name: true, taskBoardColumns: true } },
    },
  });
  if (!task) throw new BoardError("Not found", 404);
  await assertAddressable(clientId, task);
  return task;
}

/**
 * One card (or sub-item) to open in the card popup: the same checks as a write — on this client,
 * live, addressable, and for the client one they may act on — and the copy the reader may see.
 */
export async function readBoardCard(writer: BoardWriter, taskId: string): Promise<WikiBoardCard> {
  const task = await loadOwnTask(writer.clientId, taskId);
  assertClientMayAct(writer, task);
  return cardFor(writer, task.id);
}

/** A client user, as opposed to a Gitwork team member writing on the client's page. */
export function isClientWriter(writer: BoardWriter): boolean {
  return Boolean(writer.wikiUserId) || !writer.userId;
}

type Tx = Prisma.TransactionClient;

/**
 * Run a write in one transaction. For a client writer it first takes the board's per-wiki lock,
 * so the quota count, the hits it records and the write they pay for are serialised: parallel
 * requests can't all pass the same count, and a write that fails takes its hits with it.
 * `pg_advisory_xact_lock` returns void, so it goes through `$executeRaw` (see
 * void-advisory-lock.test.ts).
 */
export async function withBoardLock<T>(writer: BoardWriter, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      if (isClientWriter(writer)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`board-write:${writer.wikiId}`}))`;
      return fn(tx);
    },
    { timeout: 20_000 },
  );
}

/**
 * The client may only move, comment on or sign off their product cards and the cards they added.
 * A team dev task is a 404 to them, the same answer as a task that doesn't exist, so a guessed
 * id tells them nothing. The team, on the client's page, may act on anything here.
 */
function assertClientMayAct(writer: BoardWriter, task: { itemType: string | null; metadata: unknown }): void {
  if (!isClientWriter(writer)) return;
  if (!clientMayActOn({ isCard: isProductCard(task), addedByClient: addedByClient(task.metadata) })) {
    throw new BoardError("Not found", 404);
  }
}

/**
 * One card as the board shows it, after a write, so the writer can place it without a refetch.
 * `forClient` returns the CLIENT's copy, exactly as their page would carry it (`publicCard`): its
 * "depends on" names only cards the client may act on, never a team dev task, whichever way the
 * team set "Client sees". Every write a client makes answers with this copy.
 */
export async function loadBoardCard(clientId: string, taskId: string, forClient = false): Promise<WikiBoardCard> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: { ...TASK_SELECT, workspaceId: true, client: { select: { taskBoardColumns: true } } },
  });
  if (!row) throw new BoardError("Not found", 404);
  const columns = parseBoardColumns(row.client.taskBoardColumns);
  const ctx = await cardContext(row.workspaceId, clientId, columns, [row]);
  const card = toCard(row, ctx);
  if (!forClient) return card;
  if (!clientMayActOn(card)) return titleOnlyCard(card);
  const depIds = card.dependsOn.map((d) => d.id);
  const deps = depIds.length
    ? await prisma.task.findMany({
        where: { id: { in: depIds }, clientId, parentId: null, archivedAt: null },
        select: { id: true, itemType: true, metadata: true },
      })
    : [];
  const visible = new Set(
    deps.filter((d) => clientMayActOn({ isCard: isProductCard(d), addedByClient: addedByClient(d.metadata) })).map((d) => d.id),
  );
  return publicCard(card, visible);
}

/** The card after a write, in the copy the writer is allowed to see. */
function cardFor(writer: BoardWriter, taskId: string): Promise<WikiBoardCard> {
  return loadBoardCard(writer.clientId, taskId, isClientWriter(writer));
}

function laneFor(columnsRaw: unknown, laneKey: string): BoardLane {
  const lane = boardLanes(parseBoardColumns(columnsRaw)).find((l) => l.key === laneKey);
  if (!lane) throw new BoardError("That column isn't on the board any more. Refresh and try again.", 409);
  return lane;
}

export async function moveBoardCard(
  writer: BoardWriter,
  taskId: string,
  input: { laneKey: string; orderKey: number },
): Promise<WikiBoardCard> {
  const task = await loadOwnTask(writer.clientId, taskId);
  assertClientMayAct(writer, task);
  const lane = laneFor(task.client.taskBoardColumns, input.laneKey);
  const fromLane = laneKeyFor({ status: task.status as TaskStatus, boardColumnId: task.boardColumnId }, parseBoardColumns(task.client.taskBoardColumns));
  if (isClientWriter(writer)) {
    await withBoardLock(writer, (tx) => consumeBoardQuota(tx, writer.wikiId, "move"));
    pruneBoardQuota(writer.wikiId);
  }
  // The client may move a card anywhere, Done included (Dan, Nov 2026). The write itself still
  // re-checks the card is where we read it: on this client, live, in the status we saw. If
  // someone else moved or archived it in between, the move lands on nothing.
  const moved = await moveTaskForClient(task.id, {
    status: lane.stage,
    orderKey: input.orderKey,
    boardColumnId: lane.columnId,
    movedBy: writer.name,
    expect: { clientId: writer.clientId, fromStatus: task.status as TaskStatus },
  });
  if (!moved) throw new BoardError("This card has just changed. Refresh to see where it is now.", 409);
  // A move to another column is recorded on the card, so a card the client marked Live says so.
  // The assignees were already told by moveTaskForClient, so this entry notifies nobody.
  if (fromLane !== lane.key) await writeChange(prisma, writer, task, `${writer.name} moved this to ${lane.label}.`);
  return cardFor(writer, task.id);
}

/** The card fields a create or an edit may set. Assignees are not here, on purpose. */
export interface BoardCardInput {
  title: string;
  itemType: ClientCardType;
  laneKey: string;
  /** Required for a sub-item: the feature card it belongs under. */
  parentId?: string | null;
  releaseId?: string | null;
  tier?: string | null;
  area?: string | null;
  /** The named list it belongs to (the Table view groups by it). */
  list?: string | null;
  priority?: TaskPriority;
  estimateHours?: number | null;
  /** YYYY-MM-DD. */
  dueDate?: string | null;
  description?: string | null;
  links?: string[];
  dependsOn?: string[];
}

export type BoardCardPatch = Partial<Omit<BoardCardInput, "laneKey" | "parentId" | "itemType">> & { itemType?: BoardEditType };

/** A release on this client, or a 400. Null clears it. */
async function ownRelease(clientId: string, releaseId: string | null | undefined): Promise<string | null> {
  if (!releaseId) return null;
  const release = await prisma.clientRelease.findFirst({ where: { id: releaseId, clientId }, select: { id: true } });
  if (!release) throw new BoardError("That release isn't on this board.", 400);
  return release.id;
}

/**
 * The "depends on" list, checked: every id a live top-level card on this client, and one the
 * writer could see. A client may only point at cards they can see (not the team's dev tasks).
 */
async function ownDependsOn(writer: BoardWriter, selfId: string | null, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await prisma.task.findMany({
    where: { id: { in: unique }, clientId: writer.clientId, parentId: null, archivedAt: null },
    select: { id: true, itemType: true, metadata: true },
  });
  const usable = rows.filter(
    (r) => !isClientWriter(writer) || clientMayActOn({ isCard: isProductCard(r), addedByClient: addedByClient(r.metadata) }),
  );
  const refusal = dependsOnRefusal(selfId, unique, new Set(usable.map((r) => r.id)));
  if (refusal) throw new BoardError(refusal, 400);
  return unique;
}

function dueDateValue(day: string | null | undefined): Date | null {
  return day ? new Date(`${day.slice(0, 10)}T12:00:00.000Z`) : null;
}

function cleanArea(area: string | null | undefined): string | null {
  const a = area?.trim().replace(/\s+/g, " ") ?? "";
  return a ? a.slice(0, BOARD_LIMITS.area) : null;
}

function cleanList(list: string | null | undefined): string | null {
  const a = list?.trim().replace(/\s+/g, " ") ?? "";
  return a ? a.slice(0, BOARD_LIST_MAX) : null;
}

export async function createBoardCard(writer: BoardWriter, input: BoardCardInput): Promise<WikiBoardCard> {
  const client = await prisma.workspaceClient.findUnique({
    where: { id: writer.clientId },
    select: { id: true, workspaceId: true, slug: true, name: true, taskBoardColumns: true },
  });
  if (!client) throw new BoardError("Not found", 404);
  const lane = laneFor(client.taskBoardColumns, input.laneKey);
  if (!clientCanAddToStage(lane.stage)) {
    throw new BoardError("New cards go in an early column, such as Backlog or To do. Move them on from there.", 403);
  }
  let parentId: string | null = null;
  if (input.itemType === "subitem") {
    const parent = input.parentId
      ? await prisma.task.findFirst({
          where: { id: input.parentId, clientId: client.id, archivedAt: null },
          select: { id: true, itemType: true, parentId: true },
        })
      : null;
    const refusal = subItemParentRefusal(parent);
    if (refusal) throw new BoardError(refusal, 400);
    parentId = parent!.id;
  }
  const releaseId = await ownRelease(client.id, input.releaseId);
  const dependsOn = await ownDependsOn(writer, null, input.dependsOn ?? []);
  const top = await prisma.task.findFirst({
    where: { clientId: client.id, status: lane.stage },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const meta: Prisma.JsonObject = {};
  // Only a client's card is marked as theirs: the marker is what the board's limits count and
  // what lets the client act on a card that isn't a product card.
  if (isClientWriter(writer)) meta.createdByClient = { wikiUserId: writer.wikiUserId, name: writer.name, at: new Date().toISOString() };
  if (dependsOn.length) meta.dependsOn = dependsOn;
  // The count and the card land under the per-wiki lock, so parallel adds can't all pass it.
  const task = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await assertWithinBoardCardQuota(client.id, tx);
    return tx.task.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      createdById: writer.userId,
      title: input.title.trim(),
      description: cardDescription(input.description, input.links ?? []),
      status: lane.stage,
      boardColumnId: lane.columnId,
      priority: input.priority ?? "MEDIUM",
      itemType: input.itemType,
      tier: input.tier ?? null,
      area: cleanArea(input.area),
      boardList: cleanList(input.list),
      estimateHours: input.estimateHours ?? null,
      dueDate: dueDateValue(input.dueDate),
      releaseId,
      parentId,
      orderKey: (top?.orderKey ?? 0) + 1,
      ...(Object.keys(meta).length ? { metadata: meta } : {}),
    },
    select: { id: true },
    });
  });
  if (isClientWriter(writer)) await notifyClientCards(writer.wikiId, client, input.title.trim());
  // A sub-item lives inside its feature card, so the card to place is the parent.
  return cardFor(writer, parentId ?? task.id);
}

/** Everything an edit compares and writes, for one card. */
async function loadEditableTask(writer: BoardWriter, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: writer.clientId, archivedAt: null },
    select: {
      id: true,
      parentId: true,
      title: true,
      status: true,
      workspaceId: true,
      itemType: true,
      tier: true,
      area: true,
      boardList: true,
      priority: true,
      estimateHours: true,
      dueDate: true,
      releaseId: true,
      description: true,
      metadata: true,
      assigneeId: true,
      assignees: { select: { id: true } },
      client: { select: { slug: true, name: true, workspaceId: true } },
    },
  });
  if (!task) throw new BoardError("Not found", 404);
  await assertAddressable(writer.clientId, task);
  assertClientMayAct(writer, task);
  return task;
}

type EditableTask = Awaited<ReturnType<typeof loadEditableTask>>;

function fieldsOf(task: EditableTask): CardFields {
  const { body, links } = splitCardDescription(task.description);
  return {
    title: task.title,
    itemType: task.itemType,
    tier: task.tier,
    area: task.area,
    list: task.boardList,
    priority: task.priority as TaskPriority,
    estimateHours: task.estimateHours ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    releaseId: task.releaseId,
    description: body || null,
    links,
    dependsOn: dependsOnIds(task.metadata),
  };
}

type ChangedTask = {
  id: string;
  title: string;
  workspaceId: string;
  assigneeId: string | null;
  assignees: Array<{ id: string }>;
  client: { slug: string };
};

/**
 * Write one entry in the card's thread recording what happened. `previous` (a client's edit only)
 * keeps the title / description it replaced, for the team. Returns whether the team should be
 * told: a client's change, at most once per card per 10 minutes (`notifyChange`, after commit).
 */
async function writeChange(
  db: Pick<Tx, "taskClientFeedback">,
  writer: BoardWriter,
  task: ChangedTask,
  body: string,
  previous?: { title?: string | null; description?: string | null },
): Promise<boolean> {
  const fromClient = isClientWriter(writer);
  const now = new Date();
  const last = fromClient
    ? await db.taskClientFeedback.findFirst({
        where: { taskId: task.id, kind: "change", authorUserId: null, createdAt: { lt: now } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : null;
  await db.taskClientFeedback.create({
    data: {
      taskId: task.id,
      wikiId: writer.wikiId,
      kind: "change",
      body,
      authorWikiUserId: writer.wikiUserId,
      authorUserId: fromClient ? null : writer.userId,
      authorName: writer.name,
      ...(fromClient && previous && Object.keys(previous).length ? { previous } : {}),
    },
    select: { id: true },
  });
  return fromClient && shouldNotifyCardChange(last?.createdAt ?? null, now);
}

/** Tell the card's assignees (or the client's team) about a client's change. */
function notifyChange(writer: BoardWriter, task: ChangedTask, body: string): void {
  const assigneeIds = task.assignees.length ? task.assignees.map((a) => a.id) : task.assigneeId ? [task.assigneeId] : [];
  dispatchNotification({
    event: "tasks.client_feedback",
    workspaceId: task.workspaceId,
    target: assigneeIds.length ? { kind: "users", userIds: assigneeIds } : { kind: "clientTeam" },
    clientId: writer.clientId,
    title: `${writer.name} changed “${task.title}”`,
    body: body.slice(0, 280),
    actionUrl: `/app/portal/${task.client.slug}/tasks?task=${task.id}`,
    groupKey: `tasks.client_change:${task.id}`,
    metadata: { taskId: task.id, kind: "change" },
  });
}

/**
 * The card's "depends on" entries the client can't see (the team's dev tasks, live on this
 * client). A client's edit sends only what they could see, so these are kept rather than dropped.
 */
async function hiddenDependsOn(clientId: string, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await prisma.task.findMany({
    where: { id: { in: [...ids] }, clientId, parentId: null, archivedAt: null },
    select: { id: true, itemType: true, metadata: true },
  });
  const hidden = new Set(
    rows.filter((r) => !clientMayActOn({ isCard: isProductCard(r), addedByClient: addedByClient(r.metadata) })).map((r) => r.id),
  );
  return ids.filter((id) => hidden.has(id));
}

/**
 * Edit a card's fields. The client may change everything here on any card they can see; the
 * schema has no assignee field, so who works on a card stays the team's to decide. The write is a
 * compare-and-set on the client, the card still being live, so a card deleted meanwhile is a 409.
 */
export async function updateBoardCard(writer: BoardWriter, taskId: string, patch: BoardCardPatch): Promise<WikiBoardCard> {
  const task = await loadEditableTask(writer, taskId);
  // A sub-item lives inside its feature card; turning it into a top-level type would strand it.
  if (task.parentId && patch.itemType !== undefined && patch.itemType !== task.itemType) {
    throw new BoardError("A sub-item stays a sub-item. Add a new card if this should stand on its own.", 400);
  }
  const before = fieldsOf(task);
  let dependsOn = before.dependsOn;
  if (patch.dependsOn !== undefined) {
    const submitted = await ownDependsOn(writer, task.id, patch.dependsOn);
    // A client edits only what they can see: dependencies the team set on its dev tasks stay.
    const kept = isClientWriter(writer) ? await hiddenDependsOn(writer.clientId, before.dependsOn) : [];
    dependsOn = [...submitted, ...kept.filter((id) => !submitted.includes(id))];
  }
  const after: CardFields = {
    title: patch.title !== undefined ? patch.title.trim() : before.title,
    itemType: patch.itemType !== undefined ? patch.itemType : before.itemType,
    tier: patch.tier !== undefined ? patch.tier : before.tier,
    area: patch.area !== undefined ? cleanArea(patch.area) : before.area,
    list: patch.list !== undefined ? cleanList(patch.list) : before.list,
    priority: patch.priority ?? before.priority,
    estimateHours: patch.estimateHours !== undefined ? patch.estimateHours : before.estimateHours,
    dueDate: patch.dueDate !== undefined ? (patch.dueDate ? patch.dueDate.slice(0, 10) : null) : before.dueDate,
    releaseId: patch.releaseId !== undefined ? await ownRelease(writer.clientId, patch.releaseId) : before.releaseId,
    description: patch.description !== undefined ? patch.description?.trim() || null : before.description,
    links: patch.links !== undefined ? patch.links : before.links,
    dependsOn,
  };
  if (!after.title) throw new BoardError("Give the card a title.", 400);
  const releases = after.releaseId
    ? await prisma.clientRelease.findMany({ where: { id: after.releaseId, clientId: writer.clientId }, select: { id: true, version: true, name: true } })
    : [];
  const phrases = describeCardChanges(before, after, (id) => {
    const r = releases.find((x) => x.id === id);
    return r ? releaseLabel(r) : null;
  });
  if (!phrases.length) return cardFor(writer, task.id);

  const meta = metaObject(task.metadata);
  if (after.dependsOn.length) meta.dependsOn = after.dependsOn;
  else delete meta.dependsOn;
  // What a client's edit replaced, kept for the team (never sent to the client).
  const previous: { title?: string | null; description?: string | null } = {};
  if (after.title !== before.title) previous.title = before.title;
  if ((after.description ?? null) !== (before.description ?? null)) previous.description = before.description;
  const sentence = changeSentence(writer.name, phrases);
  const notify = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "edit");
    const { count } = await tx.task.updateMany({
    where: { id: task.id, clientId: writer.clientId, parentId: task.parentId, archivedAt: null },
    data: {
      title: after.title,
      itemType: after.itemType,
      tier: after.tier,
      area: after.area,
      boardList: after.list,
      priority: after.priority,
      estimateHours: after.estimateHours,
      dueDate: dueDateValue(after.dueDate),
      releaseId: after.releaseId,
      description: cardDescription(after.description, after.links),
      metadata: meta,
    },
    });
    if (count === 0) throw new BoardError("This card has just been deleted or moved off the board. Refresh to see the board now.", 409);
    return writeChange(tx, writer, task, sentence, previous);
  });
  if (isClientWriter(writer)) pruneBoardQuota(writer.wikiId);
  if (notify) notifyChange(writer, task, sentence);
  return cardFor(writer, task.id);
}

/**
 * Delete a card (soft: archivedAt). The client may delete any card they can see; the team's dev
 * tasks are never theirs to delete. A product card's linked dev tasks are NOT deleted: the link is
 * cleared and each gets a note saying why, and the ids are kept on the card so restoring it can
 * link them again.
 */
export async function deleteBoardCard(writer: BoardWriter, taskId: string): Promise<void> {
  const task = await loadEditableTask(writer, taskId);
  // The archive, the unlink, the notes on the dev tasks and the entry in the thread land together
  // or not at all, so a failure can't leave a card deleted with its dev tasks half unlinked.
  const linked = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "delete");
    const linked = await tx.task.findMany({
      where: { productCardId: task.id, clientId: writer.clientId },
      select: { id: true },
      take: 500,
    });
    const meta = metaObject(task.metadata);
    meta.deletedFromBoard = {
      name: writer.name,
      side: isClientWriter(writer) ? "client" : "team",
      wikiUserId: writer.wikiUserId,
      userId: writer.userId,
      at: new Date().toISOString(),
      linkedTaskIds: linked.map((l) => l.id),
    };
    const { count } = await tx.task.updateMany({
      where: { id: task.id, clientId: writer.clientId, parentId: task.parentId, archivedAt: null },
      data: { archivedAt: new Date(), metadata: meta },
    });
    if (count === 0) throw new BoardError("This card has already been deleted. Refresh to see the board now.", 409);
    if (linked.length) {
      await tx.task.updateMany({
        where: { id: { in: linked.map((l) => l.id) }, clientId: writer.clientId, productCardId: task.id },
        data: { productCardId: null },
      });
      await tx.taskComment.createMany({
        data: linked.map((l) => ({
          taskId: l.id,
          authorId: writer.userId,
          body: `${writer.name} deleted the card “${task.title}” from the client's board, so this task is no longer linked to it. Restoring the card links it again.`,
        })),
      });
    }
    // The delete has its own notification below, so this entry notifies nobody.
    await writeChange(tx, writer, task, `${writer.name} deleted this card.`);
    return linked;
  });
  if (isClientWriter(writer)) {
    pruneBoardQuota(writer.wikiId);
    dispatchNotification({
      event: "tasks.client_request",
      workspaceId: task.workspaceId,
      target: { kind: "clientTeam" },
      clientId: writer.clientId,
      title: `${writer.name} deleted “${task.title}” from their board`,
      body: linked.length ? `${linked.length} linked dev task${linked.length === 1 ? " was" : "s were"} unlinked, not deleted.` : undefined,
      actionUrl: `/app/portal/${task.client.slug}/wiki#board`,
      groupKey: `tasks.client_delete:${writer.clientId}`,
    });
  }
}

/** The team puts a deleted card back, and relinks the dev tasks it had, where they're still free. */
export async function restoreBoardCard(writer: BoardWriter, taskId: string): Promise<WikiBoardCard> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: writer.clientId, archivedAt: { not: null } },
    select: {
      id: true,
      title: true,
      parentId: true,
      itemType: true,
      metadata: true,
      workspaceId: true,
      assigneeId: true,
      assignees: { select: { id: true } },
      client: { select: { slug: true } },
    },
  });
  // A sub-item comes back only under a live feature card; restore the card first.
  if (task) await assertAddressable(writer.clientId, task);
  const meta = metaObject(task?.metadata);
  const marker = meta.deletedFromBoard;
  if (!task || !marker || typeof marker !== "object" || Array.isArray(marker)) throw new BoardError("Not found", 404);
  const linkedIds = Array.isArray((marker as Prisma.JsonObject).linkedTaskIds)
    ? ((marker as Prisma.JsonObject).linkedTaskIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  delete meta.deletedFromBoard;
  await withBoardLock(writer, async (tx) => {
    const { count } = await tx.task.updateMany({
      where: { id: task.id, clientId: writer.clientId, archivedAt: { not: null } },
      data: { archivedAt: null, metadata: meta },
    });
    if (count === 0) throw new BoardError("This card has already been restored.", 409);
    if (linkedIds.length) {
      await tx.task.updateMany({
        where: { id: { in: linkedIds }, clientId: writer.clientId, productCardId: null, archivedAt: null },
        data: { productCardId: task.id },
      });
    }
    await writeChange(tx, writer, task, `${writer.name} restored this card.`);
  });
  // A sub-item lives inside its feature card, so the card to place is the parent.
  return cardFor(writer, task.parentId ?? task.id);
}

/**
 * Decode every image and make its thumbnail before anything is stored, so one bad file stores
 * nothing. An image declaring more than `imagePixels` (width × height) is refused from its header
 * before it is decoded at all, so a small file can't make libvips allocate gigabytes.
 */
async function prepareBoardImages(
  files: Array<{ name: string; bytes: Uint8Array }>,
): Promise<Array<{ name: string; bytes: Buffer; thumb: Buffer }>> {
  const sharp = (await import("sharp")).default;
  const out: Array<{ name: string; bytes: Buffer; thumb: Buffer }> = [];
  for (const f of files) {
    const name = f.name || "That image";
    const bytes = Buffer.from(f.bytes);
    try {
      // The header alone: metadata() reads the size without decoding any pixels, so it needs no
      // pixel limit (sharp's default would refuse a huge header with a less useful message).
      const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
      if (!meta.width || !meta.height) throw new BoardError(`“${name}” couldn't be read as an image.`, 400);
      if (meta.width * meta.height > BOARD_LIMITS.imagePixels) {
        throw new BoardError(`“${name}” is ${meta.width} × ${meta.height} pixels, more than the board takes. Resize it and try again.`, 400);
      }
      const thumb = await sharp(bytes, { limitInputPixels: BOARD_LIMITS.imagePixels, failOn: "error" })
        .rotate()
        .resize(320, 320, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer();
      out.push({ name: f.name, bytes, thumb });
    } catch (err) {
      if (err instanceof BoardError) throw err;
      throw new BoardError(`“${name}” couldn't be read as an image.`, 400);
    }
  }
  return out;
}

/**
 * Add screenshots to a card. Each is checked by its bytes (PNG, JPEG, GIF or WebP; never SVG),
 * capped at 10 MB, 10 a card and `uploadRequestBytes` a request, and decoded in full before any is
 * stored. Then, under the per-wiki lock, the card's room is re-counted, the client's quota is taken,
 * and the attachments and the thread entry are written in one transaction: all or nothing.
 */
export async function addBoardCardImages(
  writer: BoardWriter,
  taskId: string,
  files: Array<{ name: string; bytes: Uint8Array }>,
): Promise<WikiBoardCard> {
  const task = await loadEditableTask(writer, taskId);
  const offered = files.map((f) => ({ name: f.name, size: f.bytes.byteLength, head: f.bytes.subarray(0, 16) }));
  const existing = await prisma.taskAttachment.count({ where: { taskId: task.id, ...LIVE_IMAGE } });
  const checked = checkBoardImages(existing, offered);
  if (!checked.ok) throw new BoardError(checked.error, 400);
  const prepared = await prepareBoardImages(files);
  const sentence = imagesSentence(writer.name, files.length);
  const notify = await withBoardLock(writer, async (tx) => {
    // Counted again under the lock: a parallel upload may have filled the card meanwhile.
    const now = await tx.taskAttachment.count({ where: { taskId: task.id, ...LIVE_IMAGE } });
    const recheck = checkBoardImages(now, offered);
    if (!recheck.ok) throw new BoardError(recheck.error, 400);
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "upload", files.length);
    for (let i = 0; i < prepared.length; i++) {
      await tx.taskAttachment.create({
        data: {
          taskId: task.id,
          uploadedById: writer.userId,
          image: bytesForPrisma(prepared[i].bytes),
          thumb: bytesForPrisma(prepared[i].thumb),
          mime: checked.mimes[i],
          filename: prepared[i].name.slice(0, 200) || null,
        },
        select: { id: true },
      });
    }
    return writeChange(tx, writer, task, sentence);
  });
  if (isClientWriter(writer)) pruneBoardQuota(writer.wikiId);
  if (notify) notifyChange(writer, task, sentence);
  return cardFor(writer, task.id);
}

/**
 * Take a screenshot off a card. The image must be on THIS card and still on it, and the card on
 * this client and one the writer may act on (a team dev task is a 404 to the client). It is not
 * deleted: `removedAt` is set and every reader skips it, so the team can put it back
 * (`restoreBoardCardImage`), as with every other removal on the board. The client's removals come
 * out of the same quota as deleting a card (30 an hour, 100 a day), under the per-wiki lock, and
 * the removal is written in the card's thread.
 */
export async function removeBoardCardImage(writer: BoardWriter, taskId: string, attachmentId: string): Promise<WikiBoardCard> {
  const task = await loadEditableTask(writer, taskId);
  const sentence = `${writer.name} removed a screenshot.`;
  const notify = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "delete");
    const { count } = await tx.taskAttachment.updateMany({
      where: { id: attachmentId, taskId: task.id, ...LIVE_IMAGE },
      data: { removedAt: new Date(), removedByName: writer.name.slice(0, 120) },
    });
    if (count === 0) throw new BoardError("That screenshot isn't on this card any more. Refresh to see the card now.", 404);
    return writeChange(tx, writer, task, sentence);
  });
  if (isClientWriter(writer)) pruneBoardQuota(writer.wikiId);
  if (notify) notifyChange(writer, task, sentence);
  return cardFor(writer, task.id);
}

/**
 * The team puts a removed screenshot back on its card. Team only: the client takes things off, the
 * team decides what comes back, the same split as restoring a card. The card's room is counted
 * again, so a restore can't push a card past its 10 screenshots.
 */
export async function restoreBoardCardImage(writer: BoardWriter, taskId: string, attachmentId: string): Promise<WikiBoardCard> {
  if (isClientWriter(writer)) throw new BoardError("Not found", 404);
  const task = await loadEditableTask(writer, taskId);
  const sentence = `${writer.name} put a removed screenshot back.`;
  const notify = await withBoardLock(writer, async (tx) => {
    const live = await tx.taskAttachment.count({ where: { taskId: task.id, ...LIVE_IMAGE } });
    if (live >= BOARD_LIMITS.images) {
      throw new BoardError(`This card already has ${BOARD_LIMITS.images} screenshots. Remove one before putting another back.`, 400);
    }
    const { count } = await tx.taskAttachment.updateMany({
      where: { id: attachmentId, taskId: task.id, removedAt: { not: null } },
      data: { removedAt: null, removedByName: null },
    });
    if (count === 0) throw new BoardError("That screenshot isn't waiting to be put back. Refresh to see the card now.", 404);
    return writeChange(tx, writer, task, sentence);
  });
  if (notify) notifyChange(writer, task, sentence);
  return cardFor(writer, task.id);
}

/**
 * Tell the client's team that the client added cards: at most once per wiki per 10 minutes, with
 * how many arrived, so a client adding twenty cards is one notification, not twenty. The window is
 * claimed with a conditional update, so two cards added at once can't both send. A failure here
 * never fails the card, which is already saved.
 */
async function notifyClientCards(
  wikiId: string,
  client: { id: string; workspaceId: string; slug: string; name: string },
  latestTitle: string,
): Promise<void> {
  try {
    const now = new Date();
    const wiki = await prisma.clientWiki.findUnique({ where: { id: wikiId }, select: { boardClientNotifiedAt: true } });
    if (!wiki || !shouldNotifyBoardCards(wiki.boardClientNotifiedAt, now)) return;
    const claimed = await prisma.clientWiki.updateMany({
      where: { id: wikiId, boardClientNotifiedAt: wiki.boardClientNotifiedAt },
      data: { boardClientNotifiedAt: now },
    });
    if (claimed.count === 0) return;
    const since = wiki.boardClientNotifiedAt ?? new Date(now.getTime() - 10 * 60 * 1000);
    const count = Math.max(1, await countClientCards(client.id, since));
    dispatchNotification({
      event: "tasks.client_request",
      workspaceId: client.workspaceId,
      target: { kind: "clientTeam" },
      clientId: client.id,
      title: `${client.name} added ${count === 1 ? "a card" : `${count} cards`} to their board`,
      body: count === 1 ? latestTitle : `Latest: ${latestTitle}`,
      actionUrl: `/app/portal/${client.slug}/tasks`,
      groupKey: `tasks.client_request:${client.id}`,
      count,
    });
  } catch (err) {
    console.error("[wiki-board] client-card notification failed", err);
  }
}

function previousOf(value: unknown): WikiBoardFeedback["previous"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const out: NonNullable<WikiBoardFeedback["previous"]> = {};
  if ("title" in v) out.title = typeof v.title === "string" ? v.title : null;
  if ("description" in v) out.description = typeof v.description === "string" ? v.description : null;
  return Object.keys(out).length ? out : undefined;
}

/** `forTeam` adds what a client's edit replaced; the client's own page never gets it. */
function feedbackRowToDTO(
  row: {
    id: string;
    kind: string;
    body: string | null;
    authorName: string;
    authorWikiUserId: string | null;
    authorUserId: string | null;
    createdAt: Date;
    previous?: unknown;
  },
  forTeam = false,
): WikiBoardFeedback {
  const previous = forTeam ? previousOf(row.previous) : undefined;
  return {
    id: row.id,
    kind: row.kind as WikiBoardFeedback["kind"],
    body: row.body,
    authorName: row.authorName,
    // Anything not written by a team member is the client's, including a client user since removed.
    side: row.authorUserId ? "team" : "client",
    createdAt: row.createdAt.toISOString(),
    ...(previous ? { previous } : {}),
  };
}

const FEEDBACK_SELECT = {
  id: true,
  kind: true,
  body: true,
  authorName: true,
  authorWikiUserId: true,
  authorUserId: true,
  createdAt: true,
  previous: true,
} as const satisfies Prisma.TaskClientFeedbackSelect;

/**
 * One of a card's images, for the client's Board. The same rule as the thread: only a card the
 * client may act on (a product card or one they added), only that card's own attachment.
 */
export async function boardCardImage(
  writer: BoardWriter,
  taskId: string,
  attachmentId: string,
  variant: "full" | "thumb",
): Promise<{ bytes: Buffer; mime: string }> {
  const task = await loadOwnTask(writer.clientId, taskId);
  assertClientMayAct(writer, task);
  const row = await prisma.taskAttachment.findFirst({
    // A removed screenshot is never served to the client; the team can still see it to decide
    // whether to put it back.
    where: { id: attachmentId, taskId: task.id, ...(isClientWriter(writer) ? LIVE_IMAGE : {}) },
    select: { image: true, thumb: true, mime: true },
  });
  if (!row) throw new BoardError("Not found", 404);
  if (variant === "thumb" && row.thumb) return { bytes: Buffer.from(row.thumb), mime: "image/jpeg" };
  return { bytes: Buffer.from(row.image), mime: row.mime };
}

export async function listBoardFeedback(writer: BoardWriter, taskId: string): Promise<WikiBoardFeedback[]> {
  const task = await loadOwnTask(writer.clientId, taskId);
  assertClientMayAct(writer, task);
  const rows = await prisma.taskClientFeedback.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: FEEDBACK_SELECT,
  });
  return rows.map((r) => feedbackRowToDTO(r, !isClientWriter(writer)));
}

/**
 * Add feedback, or sign a card off. The team's own routes may only comment: approving is the
 * client's to give. Client feedback tells the card's assignees, or the client's team when nobody
 * is on it, grouped per card so a run of comments is one notification.
 */
export async function addBoardFeedback(
  writer: BoardWriter,
  taskId: string,
  input: { kind: FeedbackKind; body?: string | null },
): Promise<WikiBoardFeedback> {
  const task = await loadOwnTask(writer.clientId, taskId);
  assertClientMayAct(writer, task);
  const fromTeam = Boolean(writer.userId) && !writer.wikiUserId;
  if (fromTeam && input.kind !== "comment") {
    throw new BoardError("Only the client can approve a card or ask for changes. Reply with a comment instead.", 403);
  }
  const refusal = feedbackRefusal(input.kind, input.body);
  if (refusal) throw new BoardError(refusal, 400);
  if (!fromTeam) await assertWithinBoardFeedbackQuota(writer.wikiId);
  const row = await prisma.taskClientFeedback.create({
    data: {
      taskId: task.id,
      wikiId: writer.wikiId,
      kind: input.kind,
      body: input.body?.trim() || null,
      authorWikiUserId: writer.wikiUserId,
      authorUserId: fromTeam ? writer.userId : null,
      authorName: writer.name,
    },
    select: FEEDBACK_SELECT,
  });

  if (!fromTeam) {
    const assigneeIds = task.assignees.length ? task.assignees.map((a) => a.id) : task.assigneeId ? [task.assigneeId] : [];
    const what =
      input.kind === "comment" ? "left feedback on" : `marked ${SIGN_OFF_LABELS[input.kind].toLowerCase()} on`;
    dispatchNotification({
      event: "tasks.client_feedback",
      workspaceId: task.workspaceId,
      target: assigneeIds.length ? { kind: "users", userIds: assigneeIds } : { kind: "clientTeam" },
      clientId: writer.clientId,
      title: `${writer.name} ${what} "${task.title}"`,
      body: input.body?.trim().slice(0, 280) || undefined,
      actionUrl: `/app/portal/${task.client.slug}/tasks?task=${task.id}`,
      groupKey: `tasks.client_feedback:${task.id}`,
      metadata: { taskId: task.id, kind: input.kind },
    });
  }
  return feedbackRowToDTO(row);
}

/* ───────────────────────────────────────────────────── team (internal) ── */

/**
 * The team reading a task's client feedback from the task drawer. Any task the person can see,
 * archived or a subtask included: it is the record of what the client said about it.
 */
export async function listTaskFeedbackForTeam(user: EffectiveUser, taskId: string): Promise<WikiBoardFeedback[]> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!task) throw new BoardError("Task not found", 404);
  await assertClientInScope(user, task.clientId);
  const rows = await prisma.taskClientFeedback.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: FEEDBACK_SELECT,
  });
  return rows.map((r) => feedbackRowToDTO(r, true));
}

/** The team replying to a client on a card. Shown to the client on their Board. */
export async function replyToTaskFeedback(user: EffectiveUser, taskId: string, body: string): Promise<WikiBoardFeedback> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: user.workspaceId },
    select: { clientId: true, client: { select: { slug: true, wiki: { select: { id: true } } } } },
  });
  if (!task) throw new BoardError("Task not found", 404);
  await assertClientInScope(user, task.clientId);
  const wikiId = task.client.wiki?.id;
  if (!wikiId) throw new BoardError("This client has no wiki, so there's nowhere for them to read a reply.", 409);
  return addBoardFeedback(
    {
      wikiId,
      clientId: task.clientId,
      clientSlug: task.client.slug,
      name: user.name?.trim() || user.email || "Gitwork",
      wikiUserId: null,
      userId: user.id,
    },
    taskId,
    { kind: "comment", body },
  );
}

/* ─────────────────────────────────────────────────────────── toggle ── */

/** Whether the client also sees the team's dev tasks on their Board (titles only, read-only). */
export async function setWikiBoardShowAllTasks(clientId: string, showAllTasks: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, boardShowAllTasks: showAllTasks },
    update: { boardShowAllTasks: showAllTasks },
    select: { id: true },
  });
}

export async function setWikiBoardEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, boardEnabled: enabled },
    update: { boardEnabled: enabled },
    select: { id: true },
  });
}
