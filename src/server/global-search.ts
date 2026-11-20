/**
 * ⌘K search across tasks, client requests, meetings, Care conversations and people (rules in
 * src/lib/global-search.ts). Each group is searched only when the person can open what it finds,
 * scoped exactly like its own page: tasks, requests and meetings to the clients they can see; Care
 * to `support`; people to Staff. A business without a module is never searched for it.
 *
 * Groups are searched independently. One that fails is named, never shown as "no results" (§35).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isExternalRole, isSuperAdmin } from "@/types/auth";
import { canSeeAllClients, type EffectiveUser } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { resolveWorkspaceModules, workspaceHasModule } from "@/lib/workspace-modules";
import { careHref } from "@/lib/care-links";
import { orderHits, searchTerms, SEARCH_PER_GROUP, type SearchGroup, type SearchHit, type SearchResponse } from "@/lib/global-search";

function has(user: EffectiveUser, id: string): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes(id);
}

const ci = (term: string) => ({ contains: term, mode: "insensitive" as const });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const TASK_STATUS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  DOING: "Doing",
  IN_REVIEW: "In review",
  UI_DONE: "UI done",
  DONE: "Done",
};

export async function globalSearch(user: EffectiveUser, query: string): Promise<SearchResponse> {
  const terms = searchTerms(query);
  if (terms.length === 0) return { query, hits: [], failed: [] };
  const workspaceId = user.workspaceId;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { modulesRestricted: true, enabledModules: true } });
  const modules = resolveWorkspaceModules(ws);
  const external = isExternalRole(user.role);
  const take = SEARCH_PER_GROUP;

  const canClients = has(user, "clients") && workspaceHasModule("clients", modules);
  // Null = every client in the workspace; otherwise only these.
  const scope = canClients ? (canSeeAllClients(user) ? null : await assignedClientIds(user)) : [];
  const clientFilter = scope === null ? {} : { id: { in: scope } };
  const inScope = canClients && (scope === null || scope.length > 0);

  const searchers: Partial<Record<SearchGroup, () => Promise<SearchHit[]>>> = {};

  if (inScope) {
    searchers.Tasks = async () => {
      const where: Prisma.TaskWhereInput = {
        workspaceId,
        archivedAt: null,
        client: clientFilter,
        AND: terms.map((t) => ({ title: ci(t) })),
      };
      const rows = await prisma.task.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take,
        select: { id: true, title: true, status: true, client: { select: { name: true, slug: true } } },
      });
      return rows.map((r) => ({
        id: `task:${r.id}`,
        group: "Tasks" as const,
        title: r.title,
        hint: `${r.client.name} · ${TASK_STATUS[r.status] ?? r.status}`,
        href: `/app/portal/${r.client.slug}/tasks?task=${r.id}`,
      }));
    };

    searchers.Requests = async () => {
      const rows = await prisma.clientWikiIntakeItem.findMany({
        where: {
          wiki: { client: { workspaceId, ...clientFilter } },
          AND: terms.map((t) => ({ OR: [{ title: ci(t) }, { description: ci(t) }] })),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, title: true, status: true, createdAt: true, wiki: { select: { client: { select: { name: true, slug: true } } } } },
      });
      return rows.map((r) => ({
        id: `request:${r.id}`,
        group: "Requests" as const,
        title: r.title,
        hint: `${r.wiki.client.name} · ${r.status === "CLOSED" ? "Dealt with" : r.status === "PROMOTED" ? "On the board" : "Open"} · ${day(r.createdAt)}`,
        href: `/app/portal/${r.wiki.client.slug}/wiki#intake`,
      }));
    };

    searchers.Meetings = async () => {
      const rows = await prisma.meeting.findMany({
        where: {
          workspaceId,
          client: { ...clientFilter },
          AND: terms.map((t) => ({ OR: [{ title: ci(t) }, { summary: ci(t) }] })),
        },
        orderBy: { startedAt: { sort: "desc", nulls: "last" } },
        take,
        select: { id: true, title: true, startedAt: true, client: { select: { name: true, slug: true } } },
      });
      return rows.flatMap((r) =>
        r.client
          ? [
              {
                id: `meeting:${r.id}`,
                group: "Meetings" as const,
                title: r.title,
                hint: [r.client.name, r.startedAt ? day(r.startedAt) : null].filter(Boolean).join(" · "),
                href: `/app/portal/${r.client.slug}`,
              },
            ]
          : [],
      );
    };
  }

  if (!external && has(user, "support") && workspaceHasModule("support", modules)) {
    searchers.Care = async () => {
      const rows = await prisma.supportConversation.findMany({
        where: {
          client: { workspaceId },
          AND: terms.map((t) => ({ OR: [{ subject: ci(t) }, { customerLabel: ci(t) }, { preview: ci(t) }] })),
        },
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        take,
        select: { id: true, subject: true, customerLabel: true, clientId: true, client: { select: { name: true } } },
      });
      return rows.map((r) => ({
        id: `care:${r.id}`,
        group: "Care" as const,
        title: r.subject || "(no subject)",
        hint: `${r.client.name} · ${r.customerLabel}`,
        href: careHref({ clientId: r.clientId, conversationId: r.id }),
      }));
    };
  }

  if (!external && has(user, "codeclear") && workspaceHasModule("codeclear", modules)) {
    searchers.People = async () => {
      const rows = await prisma.candidate.findMany({
        where: {
          workspaceId,
          archivedAt: null,
          origin: { not: "EXTERNAL" },
          AND: terms.map((t) => ({ OR: [{ name: ci(t) }, { jobTitle: ci(t) }] })),
        },
        orderBy: { name: "asc" },
        take,
        select: { id: true, name: true, jobTitle: true },
      });
      return rows.map((r) => ({
        id: `person:${r.id}`,
        group: "People" as const,
        title: r.name,
        hint: r.jobTitle ?? "Staff",
        href: `/app/staff/${r.id}`,
      }));
    };
  }

  const entries = Object.entries(searchers) as Array<[SearchGroup, () => Promise<SearchHit[]>]>;
  const settled = await Promise.allSettled(entries.map(([, run]) => run()));
  const hits: SearchHit[] = [];
  const failed: SearchGroup[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") hits.push(...s.value);
    else {
      console.error(`[search] ${entries[i][0]} failed`, s.reason);
      failed.push(entries[i][0]);
    }
  });
  return { query, hits: orderHits(hits), failed };
}
