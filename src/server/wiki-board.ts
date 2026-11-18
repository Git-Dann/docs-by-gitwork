/**
 * The client's Board in their wiki: their product cards on the team's own task board, grouped by
 * release. Rules are in src/lib/wiki-board.ts; who may write is decided in wiki-board-access.ts.
 *
 * Reads ride down in the wiki DTO (`loadWikiBoard`), cut down for the client by `forPublicBoard`.
 * Every write goes to the same Task rows the team works from: a card a client adds is a real
 * task on the board at once, and a move is a real status change. Nothing is copied, so nothing
 * can be lost between the two.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { assertClientInScope, moveTaskForClient } from "@/server/tasks";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { boardLanes, laneKeyFor, parseBoardColumns, type BoardLane } from "@/lib/tasks/board-columns";
import { layoutBoard } from "@/lib/wiki-board-layout";
import { cardProgress, isProductCard } from "@/lib/tasks/product-cards";
import { releaseLabel, sortReleases } from "@/lib/tasks/releases";
import {
  cardDescription,
  clientCanAddToStage,
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

export const EMPTY_BOARD: WikiBoardSection = { enabled: false, lanes: [], releases: [], areas: [] };

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
  description: true,
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
    description: row.description,
    subtasks: row.subtasks.map((s) => ({ title: s.title, done: s.status === "DONE" })),
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
  const [releaseRows, feedbackRows, linked] = await Promise.all([
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
    select: { boardEnabled: true, client: { select: { workspaceId: true, taskBoardColumns: true } } },
  });
  if (!wiki?.boardEnabled) return EMPTY_BOARD;
  const columns = parseBoardColumns(wiki.client.taskBoardColumns);
  const rows = await prisma.task.findMany({
    where: { clientId, parentId: null, archivedAt: null },
    select: TASK_SELECT,
  });
  const ctx = await cardContext(wiki.client.workspaceId, clientId, columns, rows);
  const completedAt = new Map(rows.map((r) => [r.id, r.completedAt?.toISOString() ?? null]));
  return layoutBoard({
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
}

/**
 * The client's copy. Everything on a card is already client-safe by construction (the loader
 * selects no emails, ids of people, internal notes or money), so this only drops the section
 * when it is off. Kept as a function so a field added later has one obvious place to be cut.
 */
export function forPublicBoard(section: WikiBoardSection): WikiBoardSection {
  if (!section.enabled) return EMPTY_BOARD;
  return {
    ...section,
    lanes: section.lanes.map((l) => ({
      ...l,
      groups: l.groups.map((g) => ({
        ...g,
        cards: g.cards.map((c) => ({
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
          isCard: c.isCard,
          addedByClient: c.addedByClient,
          updatedAt: c.updatedAt,
        })),
      })),
    })),
  };
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
      assignees: { select: { id: true } },
      client: { select: { slug: true, name: true, taskBoardColumns: true } },
    },
  });
  if (!task) throw new BoardError("Not found", 404);
  return task;
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
  const lane = laneFor(task.client.taskBoardColumns, input.laneKey);
  const refusal = clientMoveRefusal(task.status as TaskStatus, lane.stage);
  if (refusal) throw new BoardError(refusal, 403);
  await moveTaskForClient(task.id, {
    status: lane.stage,
    orderKey: input.orderKey,
    boardColumnId: lane.columnId,
    movedBy: writer.name,
  });
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
      metadata: {
        createdByClient: {
          wikiUserId: writer.wikiUserId,
          name: writer.name,
          at: new Date().toISOString(),
        },
      },
    },
    select: { id: true },
  });
  if (writer.wikiUserId) {
    const title = (n: number) => `${client.name} added ${n === 1 ? "a card" : `${n} cards`} to their board`;
    dispatchNotification({
      event: "tasks.client_request",
      workspaceId: client.workspaceId,
      target: { kind: "clientTeam" },
      clientId: client.id,
      title: title(1),
      titleForCount: title,
      body: input.title.trim(),
      actionUrl: `/app/portal/${client.slug}/tasks?task=${task.id}`,
      groupKey: `tasks.client_request:${client.id}`,
      count: 1,
    });
  }
  return loadBoardCard(client.id, task.id);
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

export async function listBoardFeedback(clientId: string, taskId: string): Promise<WikiBoardFeedback[]> {
  await loadOwnTask(clientId, taskId);
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
  const fromTeam = Boolean(writer.userId) && !writer.wikiUserId;
  if (fromTeam && input.kind !== "comment") {
    throw new BoardError("Only the client can approve a card or ask for changes. Reply with a comment instead.", 403);
  }
  const refusal = feedbackRefusal(input.kind, input.body);
  if (refusal) throw new BoardError(refusal, 400);
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

export async function setWikiBoardEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, boardEnabled: enabled },
    update: { boardEnabled: enabled },
    select: { id: true },
  });
}
