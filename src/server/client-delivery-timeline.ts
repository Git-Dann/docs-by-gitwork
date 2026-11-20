/**
 * Loads a client's delivery timeline (rules in src/lib/client-delivery-timeline.ts). Internal only:
 * it names the people on each piece of work, so it is never part of any client-facing DTO.
 *
 * Every source is read independently. One that fails is named in `failed` rather than turning
 * into "nothing happened" (CLAUDE.md §35).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  firstNames,
  findTidyUps,
  firstSentence,
  groupByWeek,
  outageLength,
  weekStart,
  type DeliveryItem,
  type DeliveryState,
  type LoadedTimeline,
  type OpenTask,
  type WaitingItem,
} from "@/lib/client-delivery-timeline";
import { releaseLabel } from "@/lib/tasks/releases";

export const TIMELINE_WEEKS_MAX = 26;

type Named = { name: string | null };

function people(t: { assignees: Named[]; assignee: Named | null }): string[] {
  const list = t.assignees.length ? t.assignees : t.assignee ? [t.assignee] : [];
  return firstNames(list.map((p) => p.name));
}

function group(t: { release: { version: string; name: string | null } | null; featureBlock: { name: string } | null }): string | null {
  if (t.release) return releaseLabel(t.release);
  return t.featureBlock?.name ?? null;
}

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  blockedAt: true,
  blockedReason: true,
  blockedResponse: true,
  updatedAt: true,
  createdAt: true,
  assignees: { select: { name: true } },
  assignee: { select: { name: true } },
  release: { select: { version: true, name: true } },
  featureBlock: { select: { name: true } },
} as const satisfies Prisma.TaskSelect;

export type { LoadedTimeline } from "@/lib/client-delivery-timeline";

export async function loadDeliveryTimeline(
  workspaceId: string,
  clientId: string,
  opts: { weeks?: number; now?: Date } = {},
): Promise<LoadedTimeline | null> {
  const now = opts.now ?? new Date();
  const weeks = Math.min(Math.max(opts.weeks ?? 8, 1), TIMELINE_WEEKS_MAX);
  const from = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * 86_400_000));

  const client = await prisma.workspaceClient.findFirst({
    where: { id: clientId, workspaceId },
    select: {
      name: true,
      slug: true,
      primaryContactName: true,
      primaryContactEmail: true,
      wiki: { select: { id: true, wikiUsers: { select: { name: true, email: true }, orderBy: { createdAt: "asc" }, take: 6 } } },
    },
  });
  if (!client) return null;
  const slug = client.slug;
  const wikiId = client.wiki?.id ?? null;
  const taskHref = (id: string) => `/app/portal/${slug}/tasks?task=${id}`;
  const base = { clientId, archivedAt: null, parentId: null } as const;

  const failed: string[] = [];
  const read = async <T,>(name: string, run: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      console.error(`[delivery-timeline] ${name} failed`, err);
      failed.push(name);
      return empty;
    }
  };

  const [done, started, blocked, open, changelog, requests, meetings, incidents, documents, releases] = await Promise.all([
    read("tasks", () => prisma.task.findMany({ where: { ...base, completedAt: { gte: from } }, select: TASK_SELECT, take: 400 }), []),
    read("tasks", () =>
      prisma.task.findMany({ where: { ...base, startedAt: { gte: from }, status: { not: "DONE" } }, select: TASK_SELECT, take: 200 }),
    []),
    read("blockers", () =>
      prisma.task.findMany({ where: { clientId, archivedAt: null, blockedReason: { not: null } }, select: TASK_SELECT, take: 100 }),
    []),
    read("tasks", () =>
      prisma.task.findMany({
        where: { ...base, status: { in: ["TODO", "DOING", "IN_REVIEW", "UI_DONE"] } },
        select: { ...TASK_SELECT, orderKey: true },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { orderKey: "asc" }],
        take: 200,
      }),
    []),
    wikiId
      ? read("releases", () =>
          prisma.clientChangelogEntry.findMany({
            where: { wikiId, OR: [{ releasedAt: { gte: from } }, { approvedAt: { gte: from } }, { createdAt: { gte: from } }] },
            select: { id: true, platform: true, version: true, title: true, status: true, releasedAt: true, approvedAt: true, approvedByName: true, createdAt: true },
            take: 100,
          }),
        [])
      : Promise.resolve([]),
    wikiId
      ? read("requests", () =>
          prisma.clientWikiIntakeItem.findMany({
            where: { wikiId, createdAt: { gte: from } },
            select: { id: true, title: true, type: true, requestedBy: true, createdAt: true },
            take: 200,
          }),
        [])
      : Promise.resolve([]),
    read("meetings", () =>
      prisma.meeting.findMany({
        where: { workspaceId, clientId, startedAt: { gte: from } },
        select: { id: true, title: true, startedAt: true, summary: true },
        take: 100,
      }),
    []),
    wikiId
      ? read("monitors", () =>
          prisma.wikiMonitorIncident.findMany({
            where: { wikiId, startedAt: { gte: from } },
            select: { id: true, kind: true, title: true, startedAt: true, resolvedAt: true, monitor: { select: { name: true, environment: true } } },
            take: 100,
          }),
        [])
      : Promise.resolve([]),
    read("documents", () =>
      prisma.document.findMany({
        where: { workspaceId, clientId, archivedAt: null, OR: [{ sharedAt: { gte: from } }, { acceptedAt: { gte: from } }] },
        select: { id: true, title: true, sharedAt: true, acceptedAt: true },
        take: 100,
      }),
    []),
    read("releases", () =>
      prisma.clientRelease.findMany({
        where: { clientId, OR: [{ endDate: { gte: now } }, { endDate: null }] },
        select: {
          version: true,
          name: true,
          endDate: true,
          tasks: { where: { archivedAt: null, parentId: null }, select: { status: true } },
        },
        take: 50,
      }),
    []),
  ]);

  const items: DeliveryItem[] = [];

  // A board tidy-up (many old, never-started tasks closed in one go) is one line, not "N done".
  const tidyBatches = findTidyUps(
    done.flatMap((t) =>
      t.completedAt
        ? [{ id: t.id, completedAt: t.completedAt.toISOString(), startedAt: t.startedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }]
        : [],
    ),
  );
  const tidied = new Set(tidyBatches.flat());
  for (const ids of tidyBatches) {
    const batch = done.filter((t) => ids.includes(t.id));
    const groups = [...new Set(batch.map(group).filter((g): g is string => Boolean(g)))];
    items.push({
      id: `tidy:${ids[0]}`,
      kind: "tidy",
      at: batch[0].completedAt!.toISOString(),
      title: `${batch.length} older tasks marked done together`,
      detail: `${groups.length ? `${groups.join(", ")}. ` : ""}Closed in one go and never started on the board, so not counted as work done this week.`,
      href: `/app/portal/${slug}/tasks`,
      people: [],
      group: null,
    });
  }

  for (const t of done) {
    if (!t.completedAt || tidied.has(t.id)) continue;
    items.push({ id: `done:${t.id}`, kind: "done", at: t.completedAt.toISOString(), title: t.title, detail: null, href: taskHref(t.id), people: people(t), group: group(t) });
  }
  for (const t of started) {
    if (!t.startedAt) continue;
    items.push({ id: `started:${t.id}`, kind: "started", at: t.startedAt.toISOString(), title: t.title, detail: null, href: taskHref(t.id), people: people(t), group: group(t) });
  }
  for (const t of blocked) {
    if (!t.blockedAt || t.blockedAt < from) continue;
    items.push({
      id: `blocked:${t.id}`,
      kind: "blocked",
      at: t.blockedAt.toISOString(),
      title: t.title,
      detail: t.blockedReason,
      href: taskHref(t.id),
      people: people(t),
      group: group(t),
    });
  }
  for (const c of changelog) {
    const at = c.releasedAt ?? c.approvedAt ?? c.createdAt;
    if (at < from) continue;
    items.push({
      id: `shipped:${c.id}`,
      kind: "shipped",
      at: at.toISOString(),
      title: `${c.version} on ${platformName(c.platform)}`,
      detail: c.status === "APPROVED" ? (c.approvedByName ? `Approved by ${c.approvedByName}` : "Approved") : "Waiting for approval",
      href: `/app/portal/${slug}/wiki#changelog`,
      people: [],
      group: c.title || null,
    });
  }
  for (const r of requests) {
    items.push({
      id: `request:${r.id}`,
      kind: "request",
      at: r.createdAt.toISOString(),
      title: r.title,
      detail: r.requestedBy ? `Raised by ${r.requestedBy}` : null,
      href: `/app/portal/${slug}/wiki#intake`,
      people: [],
      group: null,
    });
  }
  for (const m of meetings) {
    if (!m.startedAt) continue;
    items.push({
      id: `meeting:${m.id}`,
      kind: "meeting",
      at: m.startedAt.toISOString(),
      title: m.title,
      detail: firstSentence(m.summary),
      href: `/app/portal/${slug}`,
      people: [],
      group: null,
    });
  }
  for (const i of incidents) {
    const length = outageLength(i.startedAt.toISOString(), i.resolvedAt?.toISOString() ?? null);
    const env = i.monitor.environment !== "production" ? ` (${i.monitor.environment})` : "";
    items.push({
      id: `incident:${i.id}`,
      kind: "incident",
      at: i.startedAt.toISOString(),
      title: `${i.monitor.name}${env} ${i.kind === "down" ? "went down" : "was unstable"}`,
      detail: length ? `Back after ${length}` : "Still open",
      href: "/app/monitors",
      people: [],
      group: null,
    });
  }
  for (const d of documents) {
    if (d.acceptedAt && d.acceptedAt >= from) {
      items.push({ id: `doc-accepted:${d.id}`, kind: "document", at: d.acceptedAt.toISOString(), title: d.title, detail: "Accepted", href: `/app/docs/${d.id}`, people: [], group: null });
    }
    if (d.sharedAt && d.sharedAt >= from) {
      items.push({ id: `doc-sent:${d.id}`, kind: "document", at: d.sharedAt.toISOString(), title: d.title, detail: "Sent", href: `/app/docs/${d.id}`, people: [], group: null });
    }
  }

  const toOpen = (t: (typeof open)[number]): OpenTask => ({
    id: t.id,
    title: t.title,
    group: group(t),
    people: people(t),
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  });
  const waiting: WaitingItem[] = [];
  for (const t of blocked) {
    if (t.status === "DONE" || t.blockedResponse) continue;
    waiting.push({ id: `blocked:${t.id}`, title: t.title, need: t.blockedReason ?? "", since: t.blockedAt?.toISOString() ?? null, href: taskHref(t.id) });
  }
  for (const c of changelog) {
    if (c.status !== "PENDING") continue;
    waiting.push({
      id: `approve:${c.id}`,
      title: `${c.version} on ${platformName(c.platform)}`,
      need: "Approve the release",
      since: c.createdAt.toISOString(),
      href: `/app/portal/${slug}/wiki#changelog`,
    });
  }

  const upcoming = releases
    .map((r) => ({
      label: releaseLabel(r),
      endDate: r.endDate ? r.endDate.toISOString() : null,
      done: r.tasks.filter((t) => t.status === "DONE").length,
      total: r.tasks.length,
    }))
    .filter((r) => r.total > 0 && r.done < r.total)
    .sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999"));

  const state: DeliveryState = {
    inProgress: open.filter((t) => t.status !== "TODO").slice(0, 12).map(toOpen),
    upNext: open.filter((t) => t.status === "TODO").slice(0, 8).map(toOpen),
    waitingOnClient: waiting,
    nextRelease: upcoming[0] ?? null,
  };

  const contacts: Array<{ name: string; email: string | null }> = [];
  if (client.primaryContactName || client.primaryContactEmail) {
    contacts.push({ name: client.primaryContactName ?? "", email: client.primaryContactEmail });
  }
  for (const u of client.wiki?.wikiUsers ?? []) {
    if (contacts.some((c) => c.email && c.email.toLowerCase() === u.email.toLowerCase())) continue;
    contacts.push({ name: u.name ?? "", email: u.email });
  }

  return {
    clientName: client.name,
    contacts,
    weeks: groupByWeek(items, from, now),
    state,
    from: from.toISOString(),
    readAt: now.toISOString(),
    failed: [...new Set(failed)],
  };
}

const PLATFORM_NAME: Record<string, string> = { IOS: "iOS", ANDROID: "Android", FIRESTICK: "Fire TV", WEB: "web", ALL: "every platform" };

function platformName(p: string): string {
  return PLATFORM_NAME[p] ?? p.toLowerCase();
}
