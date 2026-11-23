/**
 * Reads every watcher for HQ's "Needs you" inbox (rules in src/lib/needs-you.ts).
 *
 * Each source is gated by the permission that already gates its own page, and scoped the way
 * that page is scoped, so the list can never show someone a thing they couldn't open. The actions
 * on an item are only the ones that person's own page would offer (the routes check again).
 * Sources are read independently: one that fails is reported by name, never turned into
 * "nothing to do". The person's own snoozes and dismissals are applied last (§151).
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
import { SOURCE_LABEL as COMMITMENT_SOURCE_LABEL, SUGGESTION_TTL_DAYS, type CommitmentSource } from "@/lib/commitments";
import { pruneHolds, readHolds } from "@/server/needs-you-state";
import {
  MAX_REQUEST_ITEMS,
  applyHolds,
  careItems,
  commitmentItems,
  docItems,
  foremanItems,
  monitorItems,
  pulseItems,
  rankItems,
  requestItems,
  type NeedsYouCaps,
  type NeedsYouDTO,
  type NeedsYouItem,
  type NeedsYouSource,
} from "@/lib/needs-you";

function hasPermission(user: EffectiveUser, id: string): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes(id);
}

export async function loadNeedsYou(
  user: EffectiveUser,
  now: Date = new Date(),
  opts: { viewingAs?: boolean } = {},
): Promise<NeedsYouDTO> {
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
  // What this person's own pages would let them do: open a client (Portal's rule, which the
  // incident and request routes check), and Admin-only actions (Foreman, Create task).
  const caps: NeedsYouCaps = {
    // The Monitors page's own rule: Portal access, then every client or the assigned ones.
    openableClientIds: has("clients") ? scope : [],
    admin: isAtLeast(user.role, "ADMIN"),
  };

  const readers: Partial<Record<NeedsYouSource, () => Promise<NeedsYouItem[]>>> = {};

  if (!external && canViewMonitors(user) && workspaceHasModule("clients", modules)) {
    readers.monitors = async () => {
      const board = await loadMonitorBoard(workspaceId, null, now);
      const incidents = new Map(board.incidents.map((i) => [i.monitorId, { id: i.id, acknowledged: Boolean(i.acknowledgedAt) }]));
      return monitorItems(
        board.clients.flatMap((c) =>
          c.monitors.map((m) => ({
            clientId: c.clientId,
            clientName: c.name,
            clientSlug: c.slug,
            monitorId: m.id,
            name: m.name,
            state: monitorState(m),
            production: isClientVisibleEnvironment(m.environment),
            downSince: m.downSince,
            error: m.error,
            incident: incidents.get(m.id) ?? null,
          })),
        ),
        now,
        caps,
      );
    };
  }

  // Foreman's routes are Admin and above; so is its list here.
  if (isAtLeast(user.role, "ADMIN")) {
    readers.foreman = async () => {
      const report = await getForemanReport(workspaceId);
      return report ? foremanItems(report.findings, caps) : [];
    };
  }

  // Commitments are private: only the person's own suggestions, never while viewing as someone.
  if (!external && !opts.viewingAs && has("backstage")) {
    readers.commitments = async () => {
      const rows = await prisma.commitment.findMany({
        where: {
          userId: user.id,
          workspaceId,
          state: "suggested",
          createdAt: { gte: new Date(now.getTime() - SUGGESTION_TTL_DAYS * 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, title: true, quote: true, counterpart: true, source: true, createdAt: true },
      });
      return commitmentItems(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          quote: r.quote,
          counterpart: r.counterpart,
          sourceLabel: COMMITMENT_SOURCE_LABEL[r.source as CommitmentSource] ?? "your messages",
          createdAt: r.createdAt.toISOString(),
        })),
        now,
      );
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
      // One item per request, oldest first, capped so one busy client can't fill the inbox.
      const rows = await prisma.clientWikiIntakeItem.findMany({
        where: {
          status: "NEW",
          wiki: { client: { workspaceId, hidden: false, ...(scope ? { id: { in: scope } } : {}) } },
        },
        orderBy: { createdAt: "asc" },
        take: MAX_REQUEST_ITEMS,
        select: {
          id: true,
          title: true,
          type: true,
          requestedBy: true,
          createdAt: true,
          wiki: { select: { client: { select: { id: true, name: true, slug: true } } } },
        },
      });
      return requestItems(
        rows.map((r) => ({
          requestId: r.id,
          clientId: r.wiki.client.id,
          clientName: r.wiki.client.name,
          clientSlug: r.wiki.client.slug,
          title: r.title,
          type: r.type,
          requestedBy: r.requestedBy,
          createdAt: r.createdAt.toISOString(),
        })),
        now,
        caps,
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

  // The person's own snoozes and dismissals. If they can't be read the items still show, all of
  // them open: a snoozed item reappearing is better than the whole inbox failing.
  let held = items;
  try {
    const rows = await readHolds(user);
    held = applyHolds(items, rows, now);
    await pruneHolds(user, rows, items, checked, now);
  } catch (err) {
    console.error("[needs-you] snoozes could not be read", err);
  }

  return { items: rankItems(held), checked, failed, readAt: now.toISOString() };
}
