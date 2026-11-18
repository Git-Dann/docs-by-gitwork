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
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { assertClientInScope, moveTaskForClient } from "@/server/tasks";
import {
  assertWithinBoardCardQuota,
  assertWithinBoardFeedbackQuota,
  countClientCards,
  shouldNotifyBoardCards,
} from "@/server/wiki-board-limit";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { boardLanes, laneKeyFor, parseBoardColumns, type BoardLane } from "@/lib/tasks/board-columns";
import { layoutBoard } from "@/lib/wiki-board-layout";
import { cardProgress, isProductCard } from "@/lib/tasks/product-cards";
import { releaseLabel, sortReleases } from "@/lib/tasks/releases";
import {
  cardDescription,
  clientCanAddToStage,
  clientMayActOn,
  clientMoveRefusal,
  deriveSignOff,
  feedbackRefusal,
  shortPersonName,
  SIGN_OFF_LABELS,
  type ClientCardType,
  type FeedbackKind,
} from "@/lib/wiki-board";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type {
  WikiBoardCard,
  WikiBoardFeedback,
  WikiBoardSection,
} from "@/types/wiki-board";

export const EMPTY_BOARD: WikiBoardSection = { enabled: false, showAllTasks: false, lanes: [], releases: [], areas: [] };

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
  status: true,
  boardColumnId: true,
  orderKey: true,
  priority: true,
  dueDate: true,
  updatedAt: true,
  completedAt: true,
  // No `description` here. A dev task's description holds internal notes, so it is never
  // loaded for the board at all; cards' descriptions are read separately (`descriptionsFor`).
  itemType: true,
  tier: true,
  area: true,
  releaseId: true,
  metadata: true,
  assignee: { select: { name: true, email: true } },
  assignees: { select: { name: true, email: true } },
  subtasks: {
    where: { archivedAt: null },
    orderBy: { orderKey: "asc" },
    select: { title: true, status: true },
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

/** Image attachment ids for the same cards `descriptionsFor` covers, oldest first. One query. */
async function imagesFor(rows: TaskRow[]): Promise<Map<string, string[]>> {
  const ids = rows.filter((r) => clientMayActOn({ isCard: isProductCard(r), addedByClient: addedByClient(r.metadata) })).map((r) => r.id);
  if (!ids.length) return new Map();
  const found = await prisma.taskAttachment.findMany({
    where: { taskId: { in: ids } },
    select: { id: true, taskId: true },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, string[]>();
  for (const a of found) out.set(a.taskId, [...(out.get(a.taskId) ?? []), a.id]);
  return out;
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
    priority: row.priority as TaskPriority,
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
    subtasks: row.subtasks.map((s) => ({ title: s.title, done: s.status === "DONE" })),
    images: ctx.images.get(row.id) ?? [],
    stageHistory: stageHistoryOf(row.metadata),
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
          where: { taskId: { in: ids } },
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
    images,
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
  return { ...laid, showAllTasks: wiki.boardShowAllTasks };
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
  return {
    enabled: true,
    showAllTasks: section.showAllTasks,
    releases: section.releases,
    areas: section.areas,
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
            if (clientMayActOn(c)) return [publicCard(c)];
            return section.showAllTasks ? [titleOnlyCard(c)] : [];
          }),
        }))
        .filter((g) => g.cards.length > 0),
    })),
  };
}

function publicCard(c: WikiBoardCard): WikiBoardCard {
  return {
    id: c.id,
    title: c.title,
    itemType: c.itemType,
    tier: c.tier,
    area: c.area,
    priority: c.priority,
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
    subtasks: c.subtasks,
    images: c.images,
    stageHistory: c.stageHistory,
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
    priority: c.priority,
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
    stageHistory: [],
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

/** The card, on this client, live and top-level, or a 404. A card from another client never matches. */
async function loadOwnTask(clientId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId, parentId: null, archivedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      workspaceId: true,
      assigneeId: true,
      itemType: true,
      metadata: true,
      assignees: { select: { id: true } },
      client: { select: { slug: true, name: true, taskBoardColumns: true } },
    },
  });
  if (!task) throw new BoardError("Not found", 404);
  return task;
}

/** A client user, as opposed to a Gitwork team member writing on the client's page. */
function isClientWriter(writer: BoardWriter): boolean {
  return Boolean(writer.wikiUserId) || !writer.userId;
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

/** One card as the board shows it, after a write, so the client can place it without a refetch. */
export async function loadBoardCard(clientId: string, taskId: string): Promise<WikiBoardCard> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: { ...TASK_SELECT, workspaceId: true, client: { select: { taskBoardColumns: true } } },
  });
  if (!row) throw new BoardError("Not found", 404);
  const columns = parseBoardColumns(row.client.taskBoardColumns);
  const ctx = await cardContext(row.workspaceId, clientId, columns, [row]);
  return toCard(row, ctx);
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
  const refusal = clientMoveRefusal(task.status as TaskStatus, lane.stage);
  if (refusal) throw new BoardError(refusal, 403);
  // The write itself re-checks the card is still where the rule above saw it: on this client,
  // live, and in the status we read. If the team marked it Done, or archived it, in between, the
  // move lands on nothing rather than reopening it.
  const moved = await moveTaskForClient(task.id, {
    status: lane.stage,
    orderKey: input.orderKey,
    boardColumnId: lane.columnId,
    movedBy: writer.name,
    expect: { clientId: writer.clientId, fromStatus: task.status as TaskStatus },
  });
  if (!moved) throw new BoardError("This card has just changed. Refresh to see where it is now.", 409);
  return loadBoardCard(writer.clientId, task.id);
}

export async function createBoardCard(
  writer: BoardWriter,
  input: {
    title: string;
    itemType: ClientCardType;
    laneKey: string;
    releaseId?: string | null;
    priority?: TaskPriority;
    description?: string | null;
    links?: string[];
  },
): Promise<WikiBoardCard> {
  const client = await prisma.workspaceClient.findUnique({
    where: { id: writer.clientId },
    select: { id: true, workspaceId: true, slug: true, name: true, taskBoardColumns: true },
  });
  if (!client) throw new BoardError("Not found", 404);
  if (isClientWriter(writer)) await assertWithinBoardCardQuota(client.id);
  const lane = laneFor(client.taskBoardColumns, input.laneKey);
  if (!clientCanAddToStage(lane.stage)) {
    throw new BoardError("New cards go in an early column, such as Backlog or To do. Gitwork moves them on from there.", 403);
  }
  let releaseId: string | null = null;
  if (input.releaseId) {
    const release = await prisma.clientRelease.findFirst({
      where: { id: input.releaseId, clientId: client.id },
      select: { id: true },
    });
    if (!release) throw new BoardError("That release isn't on this board.", 400);
    releaseId = release.id;
  }
  const top = await prisma.task.findFirst({
    where: { clientId: client.id, status: lane.stage },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const task = await prisma.task.create({
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
      releaseId,
      orderKey: (top?.orderKey ?? 0) + 1,
      // Only a client's card is marked as theirs: the marker is what the board's limits count
      // and what lets the client act on a card that isn't a product card.
      ...(isClientWriter(writer)
        ? { metadata: { createdByClient: { wikiUserId: writer.wikiUserId, name: writer.name, at: new Date().toISOString() } } }
        : {}),
    },
    select: { id: true },
  });
  if (isClientWriter(writer)) await notifyClientCards(writer.wikiId, client, input.title.trim());
  return loadBoardCard(client.id, task.id);
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

function feedbackRowToDTO(row: {
  id: string;
  kind: string;
  body: string | null;
  authorName: string;
  authorWikiUserId: string | null;
  authorUserId: string | null;
  createdAt: Date;
}): WikiBoardFeedback {
  return {
    id: row.id,
    kind: row.kind as WikiBoardFeedback["kind"],
    body: row.body,
    authorName: row.authorName,
    // Anything not written by a team member is the client's, including a client user since removed.
    side: row.authorUserId ? "team" : "client",
    createdAt: row.createdAt.toISOString(),
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
    where: { id: attachmentId, taskId: task.id },
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
  return rows.map(feedbackRowToDTO);
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
  return rows.map(feedbackRowToDTO);
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
