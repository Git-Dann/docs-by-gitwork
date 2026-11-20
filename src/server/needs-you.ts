/**
 * Reads every watcher for HQ's "Needs you" list (rules in src/lib/needs-you.ts).
 *
 * Each source is gated by the permission that already gates its own page, and scoped the way
 * that page is scoped, so the list can never show someone a thing they couldn't open. Sources are
 * read independently: one that fails is reported by name, never turned into "nothing to do".
 */

import { prisma } from "@/lib/prisma";
import { isAtLeast, isExternalRole, isSuperAdmin } from "@/types/auth";
import { canSeeAllClients, canViewMonitors, type EffectiveUser } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { resolveWorkspaceModules, workspaceHasModule } from "@/lib/workspace-modules";
import { loadMonitorBoard } from "@/server/wiki-monitor-board";
import { monitorState } from "@/lib/monitor-board";
import { isClientVisibleEnvironment } from "@/lib/monitor-environment";
import { getForemanReport } from "@/server/foreman/queries";
import { getClientQueueSummaries } from "@/server/support";
import { getPulseProjects } from "@/server/pulse";
import {
  careItems,
  docItems,
  foremanItems,
  monitorItems,
  pulseItems,
  rankItems,
  requestItems,
  type NeedsYouDTO,
  type NeedsYouItem,
  type NeedsYouSource,
} from "@/lib/needs-you";

function hasPermission(user: EffectiveUser, id: string): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes(id);
}

export async function loadNeedsYou(user: EffectiveUser, now: Date = new Date()): Promise<NeedsYouDTO> {
  const workspaceId = user.workspaceId;
  // A business without a module has none of its data, and its own Super Admin is refused the
  // module's pages, so its source is never read either.
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { modulesRestricted: true, enabledModules: true },
  });
  const modules = resolveWorkspaceModules(ws);
  const has = (id: string) => hasPermission(user, id) && workspaceHasModule(id, modules);
  const external = isExternalRole(user.role);
  const seesAll = canSeeAllClients(user);
  const scope = seesAll ? null : hasPermission(user, "clients") ? await assignedClientIds(user) : [];

  const readers: Partial<Record<NeedsYouSource, () => Promise<NeedsYouItem[]>>> = {};

  if (!external && canViewMonitors(user) && workspaceHasModule("clients", modules)) {
    readers.monitors = async () => {
      const board = await loadMonitorBoard(workspaceId, null, now);
      return monitorItems(
        board.clients.flatMap((c) =>
          c.monitors.map((m) => ({
            clientName: c.name,
            clientSlug: c.slug,
            monitorId: m.id,
            name: m.name,
            state: monitorState(m),
            production: isClientVisibleEnvironment(m.environment),
            downSince: m.downSince,
            error: m.error,
          })),
        ),
        now,
      );
    };
  }

  // Foreman's routes are Admin and above; so is its list here.
  if (isAtLeast(user.role, "ADMIN")) {
    readers.foreman = async () => {
      const report = await getForemanReport(workspaceId);
      return report ? foremanItems(report.findings) : [];
    };
  }

  if (!external && has("support")) {
    readers.care = async () => {
      const summaries = await getClientQueueSummaries(workspaceId);
      const ids = Object.keys(summaries);
      if (ids.length === 0) return [];
      const clients = await prisma.supportClient.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true },
      });
      return careItems(
        clients.map((c) => ({
          supportClientId: c.id,
          clientName: c.name,
          awaiting: summaries[c.id]?.awaiting ?? 0,
          oldestAwaitingAt: summaries[c.id]?.oldestAwaitingAt ?? null,
        })),
        now,
      );
    };
  }

  if (!external && has("clients") && (scope === null || scope.length > 0)) {
    readers.requests = async () => {
      const rows = await prisma.clientWikiIntakeItem.groupBy({
        by: ["wikiId"],
        where: {
          status: "NEW",
          wiki: { client: { workspaceId, hidden: false, ...(scope ? { id: { in: scope } } : {}) } },
        },
        _count: { _all: true },
        _min: { createdAt: true },
      });
      if (rows.length === 0) return [];
      const wikis = await prisma.clientWiki.findMany({
        where: { id: { in: rows.map((r) => r.wikiId) } },
        select: { id: true, client: { select: { name: true, slug: true } } },
      });
      const byId = new Map(wikis.map((w) => [w.id, w.client]));
      return requestItems(
        rows.flatMap((r) => {
          const c = byId.get(r.wikiId);
          if (!c || !r._min.createdAt) return [];
          return [{ clientName: c.name, clientSlug: c.slug, newCount: r._count._all, oldestAt: r._min.createdAt.toISOString() }];
        }),
        now,
      );
    };
  }

  // Docs and Pulse lists aren't scoped per client, so only people who see every client get them.
  if (!external && seesAll && has("proposals")) {
    readers.docs = async () => {
      const docs = await prisma.document.findMany({
        where: {
          workspaceId,
          status: "SENT",
          isShared: true,
          acceptedAt: null,
          declinedAt: null,
          sharedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) },
        },
        orderBy: { sharedAt: "asc" },
        take: 30,
        select: { id: true, title: true, sharedAt: true, firstViewedAt: true, client: { select: { name: true } } },
      });
      return docItems(
        docs.map((d) => ({
          id: d.id,
          title: d.title,
          clientName: d.client?.name ?? null,
          sharedAt: d.sharedAt?.toISOString() ?? null,
          firstViewedAt: d.firstViewedAt?.toISOString() ?? null,
        })),
        now,
      );
    };
  }

  if (!external && seesAll && has("pulse")) {
    readers.pulse = async () => {
      const projects = await getPulseProjects(workspaceId);
      return pulseItems(
        projects.map((p) => ({
          key: p.key,
          name: p.name,
          reasons: p.attention,
          urgent: p.urgentFindings ?? 0,
          href: `/app/pulse/projects/${p.slug}`,
        })),
      );
    };
  }

  const entries = Object.entries(readers) as Array<[NeedsYouSource, () => Promise<NeedsYouItem[]>]>;
  const results = await Promise.allSettled(entries.map(([, read]) => read()));
  const items: NeedsYouItem[] = [];
  const checked: NeedsYouSource[] = [];
  const failed: NeedsYouSource[] = [];
  results.forEach((r, i) => {
    const source = entries[i][0];
    if (r.status === "fulfilled") {
      checked.push(source);
      items.push(...r.value);
    } else {
      failed.push(source);
      console.error(`[needs-you] ${source} could not be read`, r.reason);
    }
  });

  return { items: rankItems(items), checked, failed, readAt: now.toISOString() };
}
