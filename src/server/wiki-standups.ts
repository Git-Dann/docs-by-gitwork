/**
 * Loading each developer's AM/PM standup for one client — the data behind the
 * wiki overview's "Daily updates" card, today and the last two weeks.
 *
 * ⚠️ Three sources, and which is which matters:
 *
 *   `DailyUpdate` — the EVENT. `amPushedAt` / `pmPushedAt` prove a dev actually
 *     sent an update, and `involvedClientIds` says it covered this client. A dev
 *     with neither stamp is not reported, because deriving a standup from the
 *     live board and showing it to a client puts words in someone's mouth.
 *   `amSnapshot` / `pmSnapshot` — what the update SAID, saved at push time. A
 *     past day is shown from these, because the board has moved on since.
 *   `Task` — today's content for an update pushed before snapshots existed,
 *     and "Done that day" for an old day with no snapshot. Never "in progress"
 *     for a past day: what was in progress THEN cannot be read off the board NOW.
 *
 * Scoped to the client throughout: a dev's tasks for OTHER clients are never
 * read, so one client's wiki cannot show another's work.
 */
import { prisma } from "@/lib/prisma";
import {
  STANDUP_HISTORY_DAYS,
  groupTasksForDay,
  snapshotForClient,
  type DevStandup,
  type StandupDay,
  type StandupFeed,
  type StandupSourceTask,
} from "@/lib/wiki-standups";

const DAY_MS = 86_400_000;

/** UTC midnight of the day `at` falls in — the same work-day key the standup uses. */
export function utcWorkDate(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Today's standups for this client, plus every earlier day in the window that
 * had one.
 *
 * Returns an empty feed rather than throwing when nothing was pushed — the wiki
 * loader wraps every section in `settle()`, and a quiet day must read as a quiet
 * day, not as a broken section.
 */
export async function loadClientStandups(clientId: string, now = new Date()): Promise<StandupFeed> {
  const today = utcWorkDate(now);
  const from = new Date(today.getTime() - STANDUP_HISTORY_DAYS * DAY_MS);
  const empty: StandupFeed = {
    today: { workDate: today.toISOString(), devs: [] },
    history: [],
  };

  const updates = await prisma.dailyUpdate.findMany({
    where: {
      workDate: { gte: from, lte: today },
      involvedClientIds: { has: clientId },
      OR: [{ amPushedAt: { not: null } }, { pmPushedAt: { not: null } }],
    },
    select: {
      userId: true,
      workDate: true,
      amPushedAt: true,
      pmPushedAt: true,
      amSnapshot: true,
      pmSnapshot: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (updates.length === 0) return empty;

  // The board is only needed for rows with no snapshot. Rows pushed since
  // snapshots shipped never touch it.
  const needBoard = updates.filter((u) => !snapshotForClient(u, clientId));
  const tasksByUser = new Map<string, StandupSourceTask[]>();
  if (needBoard.length > 0) {
    const userIds = [...new Set(needBoard.map((u) => u.userId))];
    const tasks = await prisma.task.findMany({
      where: {
        clientId,
        archivedAt: null,
        OR: [{ assignees: { some: { id: { in: userIds } } } }, { assigneeId: { in: userIds } }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        completedAt: true,
        parentId: true,
        assigneeId: true,
        assignees: { select: { id: true } },
      },
    });
    const parentIds = [
      ...new Set(tasks.map((t) => t.parentId).filter((v): v is string => Boolean(v))),
    ];
    const parents = parentIds.length
      ? await prisma.task.findMany({
          where: { id: { in: parentIds } },
          select: { id: true, title: true },
        })
      : [];
    const parentTitle = new Map(parents.map((p) => [p.id, p.title]));
    for (const uid of userIds) {
      // ⚠️ Honour the legacy single `assigneeId` as well as the join — §13.7
      // keeps it as a fallback, and reading only the join drops every task
      // assigned before multi-assignee shipped.
      tasksByUser.set(
        uid,
        tasks
          .filter((t) => t.assignees.some((a) => a.id === uid) || t.assigneeId === uid)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            completedAt: t.completedAt,
            parentTitle: t.parentId ? (parentTitle.get(t.parentId) ?? null) : null,
          })),
      );
    }
  }

  const byDay = new Map<string, DevStandup[]>();
  for (const u of updates) {
    const isToday = u.workDate.getTime() === today.getTime();
    const snap = snapshotForClient(u, clientId);
    let groups;
    let source: DevStandup["source"];
    if (snap) {
      groups = snap;
      source = "reported";
    } else {
      const live = groupTasksForDay(tasksByUser.get(u.userId) ?? [], u.workDate);
      if (isToday) {
        groups = live;
        source = "live";
      } else {
        groups = { inProgress: [], inReview: [], doneToday: live.doneToday };
        source = "history";
      }
    }
    const key = u.workDate.toISOString();
    const list = byDay.get(key) ?? [];
    list.push({
      userId: u.userId,
      name: u.user?.name?.trim() || u.user?.email?.trim() || "A developer",
      amPushedAt: u.amPushedAt?.toISOString() ?? null,
      pmPushedAt: u.pmPushedAt?.toISOString() ?? null,
      ...groups,
      source,
    });
    byDay.set(key, list);
  }

  const todayKey = today.toISOString();
  const history: StandupDay[] = [...byDay.entries()]
    .filter(([key]) => key !== todayKey)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([workDate, devs]) => ({ workDate, devs }));

  return {
    today: { workDate: todayKey, devs: byDay.get(todayKey) ?? [] },
    history,
  };
}
