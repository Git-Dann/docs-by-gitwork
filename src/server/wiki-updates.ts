/**
 * Updates in the client wiki (CLAUDE.md §147; rules in src/lib/wiki-updates.ts).
 *
 * The page's data is loaded on its own, never inside the wiki DTO (§140): the timeline reads ten
 * sources. The DTO carries only `WikiUpdatesSummary` (the flag, a count and the latest subject).
 *
 * Both sides get the CLIENT's copy of the timeline. The team's page shows exactly what the client
 * sees, plus the controls to publish and unpublish.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadDeliveryTimeline } from "@/server/client-delivery-timeline";
import {
  EMPTY_UPDATES_SUMMARY,
  firstNameOf,
  forClientTimeline,
  parseWeekStart,
  publishProblem,
  type PublishedUpdate,
  type UpdatesView,
  type WikiUpdatesSummary,
} from "@/lib/wiki-updates";

/** Weeks of "what happened" the page reads. */
export const UPDATES_WEEKS = 12;
/** Published updates shown, newest first. */
const PUBLISHED_MAX = 52;

export class UpdatesError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const UPDATE_SELECT = {
  id: true,
  weekStart: true,
  subject: true,
  body: true,
  publishedAt: true,
  publishedByName: true,
} as const satisfies Prisma.WikiWeeklyUpdateSelect;

type UpdateRow = Prisma.WikiWeeklyUpdateGetPayload<{ select: typeof UPDATE_SELECT }>;

function toPublished(r: UpdateRow): PublishedUpdate {
  return {
    id: r.id,
    weekStart: r.weekStart.toISOString().slice(0, 10),
    subject: r.subject,
    body: r.body,
    publishedAt: r.publishedAt.toISOString(),
    publishedBy: firstNameOf(r.publishedByName),
  };
}

/** The DTO's summary. */
export async function loadWikiUpdatesSummary(wikiId: string, enabled: boolean): Promise<WikiUpdatesSummary> {
  if (!enabled) return { ...EMPTY_UPDATES_SUMMARY };
  const [published, latest] = await Promise.all([
    prisma.wikiWeeklyUpdate.count({ where: { wikiId, archivedAt: null } }),
    prisma.wikiWeeklyUpdate.findFirst({
      where: { wikiId, archivedAt: null },
      orderBy: [{ weekStart: "desc" }, { publishedAt: "desc" }],
      select: { subject: true, weekStart: true, publishedAt: true },
    }),
  ]);
  return {
    enabled: true,
    published,
    latest: latest
      ? { subject: latest.subject, weekStart: latest.weekStart.toISOString().slice(0, 10), publishedAt: latest.publishedAt.toISOString() }
      : null,
  };
}

/** The page: the client's copy of the timeline and the published updates. */
export async function loadUpdatesView(
  workspaceId: string,
  clientId: string,
  wikiId: string,
  now = new Date(),
): Promise<UpdatesView | null> {
  const [timeline, rows] = await Promise.all([
    loadDeliveryTimeline(workspaceId, clientId, { weeks: UPDATES_WEEKS, now, audience: "client" }),
    prisma.wikiWeeklyUpdate.findMany({
      where: { wikiId, archivedAt: null },
      orderBy: [{ weekStart: "desc" }, { publishedAt: "desc" }],
      select: UPDATE_SELECT,
      take: PUBLISHED_MAX * 2,
    }),
  ]);
  if (!timeline) return null;
  // One per week: the newest wins if two were ever written (enforced in code, not by an index).
  const seen = new Set<string>();
  const published: PublishedUpdate[] = [];
  for (const r of rows) {
    const p = toPublished(r);
    if (seen.has(p.weekStart)) continue;
    seen.add(p.weekStart);
    published.push(p);
    if (published.length >= PUBLISHED_MAX) break;
  }
  return { ...forClientTimeline(timeline), published, failed: timeline.failed };
}

/**
 * Publish (or replace) the update for a week. Switches the section on, so publishing is the one
 * step that puts it in front of the client.
 */
export async function publishUpdate(
  clientId: string,
  input: { weekStart: string; subject: string; body: string },
  by: { userId: string | null; name: string },
  now = new Date(),
): Promise<PublishedUpdate> {
  const problem = publishProblem(input, now);
  if (problem) throw new UpdatesError(problem);
  const weekStart = new Date(`${parseWeekStart(input.weekStart)}T00:00:00Z`);
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, updatesEnabled: true },
    update: { updatesEnabled: true },
    select: { id: true },
  });
  const data = {
    subject: input.subject.trim(),
    body: input.body.replace(/\r\n/g, "\n").trimEnd(),
    publishedById: by.userId,
    publishedByName: by.name,
    publishedAt: now,
  };
  return prisma.$transaction(async (tx) => {
    const existing = await tx.wikiWeeklyUpdate.findMany({
      where: { wikiId: wiki.id, weekStart, archivedAt: null },
      select: { id: true },
      orderBy: { publishedAt: "desc" },
    });
    if (existing.length) {
      const [keep, ...extra] = existing;
      if (extra.length) {
        await tx.wikiWeeklyUpdate.updateMany({ where: { id: { in: extra.map((e) => e.id) } }, data: { archivedAt: now } });
      }
      return toPublished(await tx.wikiWeeklyUpdate.update({ where: { id: keep.id }, data, select: UPDATE_SELECT }));
    }
    return toPublished(await tx.wikiWeeklyUpdate.create({ data: { wikiId: wiki.id, weekStart, ...data }, select: UPDATE_SELECT }));
  });
}

/** Take an update off the client's wiki. Kept (archived), never deleted. */
export async function unpublishUpdate(clientId: string, id: string, now = new Date()): Promise<void> {
  const res = await prisma.wikiWeeklyUpdate.updateMany({
    where: { id, archivedAt: null, wiki: { clientId } },
    data: { archivedAt: now },
  });
  if (res.count === 0) throw new UpdatesError("Update not found", 404);
}

export async function setWikiUpdatesEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, updatesEnabled: enabled },
    update: { updatesEnabled: enabled },
  });
}
