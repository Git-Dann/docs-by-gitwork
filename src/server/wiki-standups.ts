/**
 * Loading each developer's AM/PM standup for one client — the data behind the
 * wiki overview's "Daily updates" card.
 *
 * ⚠️ Two sources, and which is which matters:
 *
 *   `DailyUpdate` — the EVENT. `amPushedAt` / `pmPushedAt` prove a dev actually
 *     sent an update, and `involvedClientIds` says it covered this client. A dev
 *     with neither stamp is not reported, because deriving a standup from the
 *     live board and showing it to a client puts words in someone's mouth.
 *   `Task`        — the CONTENT, partitioned by the SAME rule the Slack standup
 *     uses, so the wiki and the Slack post can never describe one day
 *     differently.
 *
 * Scoped to the client throughout: a dev's tasks for OTHER clients are never
 * read, so one client's wiki cannot show another's work.
 */
import { prisma } from "@/lib/prisma";
import type { DevStandup, StandupDay, StandupTask } from "@/lib/wiki-standups";

/** UTC midnight of the day `at` falls in — the same work-day key the standup uses. */
export function utcWorkDate(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function nextUtcDay(d: Date): Date {
  return new Date(d.getTime() + 86_400_000);
}

/**
 * The standups pushed for this client on `workDate`.
 *
 * Returns an empty `devs` list rather than throwing when nothing was pushed —
 * the wiki loader wraps every section in `settle()`, and a quiet day must read
 * as a quiet day, not as a broken section.
 */
export async function loadClientStandups(
  clientId: string,
  now = new Date(),
): Promise<StandupDay> {
  const workDate = utcWorkDate(now);
  const dayEnd = nextUtcDay(workDate);

  const updates = await prisma.dailyUpdate.findMany({
    where: { workDate, involvedClientIds: { has: clientId } },
    select: {
      userId: true,
      amPushedAt: true,
      pmPushedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const pushed = updates.filter((u) => u.amPushedAt || u.pmPushedAt);
  if (pushed.length === 0) return { workDate: workDate.toISOString(), devs: [] };

  const userIds = pushed.map((u) => u.userId);

  // This client's live tasks for those devs only. `archivedAt: null` matches the
  // board; a subtask is included because the standup reports them too.
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

  const parentIds = [...new Set(tasks.map((t) => t.parentId).filter((v): v is string => Boolean(v)))];
  const parents = parentIds.length
    ? await prisma.task.findMany({ where: { id: { in: parentIds } }, select: { id: true, title: true } })
    : [];
  const parentTitleById = new Map(parents.map((p) => [p.id, p.title]));

  const toTask = (t: (typeof tasks)[number]): StandupTask => ({
    id: t.id,
    title: t.title,
    parentTitle: t.parentId ? (parentTitleById.get(t.parentId) ?? null) : null,
  });

  const devs: DevStandup[] = pushed.map((u) => {
    // ⚠️ Honour the legacy single `assigneeId` as well as the join — §13.7 keeps
    // it as a fallback, and reading only the join drops every task assigned
    // before multi-assignee shipped.
    const mine = tasks.filter(
      (t) => t.assignees.some((a) => a.id === u.userId) || t.assigneeId === u.userId,
    );
    return {
      userId: u.userId,
      name: u.user?.name?.trim() || u.user?.email?.trim() || "A developer",
      amPushedAt: u.amPushedAt?.toISOString() ?? null,
      pmPushedAt: u.pmPushedAt?.toISOString() ?? null,
      // The same split as `partition()` in tasks-standup.ts.
      inProgress: mine.filter((t) => t.status === "DOING").map(toTask),
      inReview: mine
        .filter((t) => t.status === "IN_REVIEW" || t.status === "UI_DONE")
        .map(toTask),
      doneToday: mine
        .filter(
          (t) =>
            t.status === "DONE" &&
            t.completedAt != null &&
            t.completedAt >= workDate &&
            t.completedAt < dayEnd,
        )
        .map(toTask),
    };
  });

  return { workDate: workDate.toISOString(), devs };
}
