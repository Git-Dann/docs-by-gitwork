/**
 * The Platform console's view of every business on Foundry, and the one change it can
 * make so far: which modules a business has, and whether it may use Gitwork's AI keys.
 *
 * ⚠️ This module reads ACROSS workspaces on purpose. It is the only place that should,
 * and Phase 2 of docs/multi-tenant-roadmap.md adds a sweep that allow-lists this
 * folder by name, so the exception stays explicit. Every caller must have passed
 * requirePlatformAdmin first; nothing here checks it again.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { recordAuditEntry } from "@/server/audit-log";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import type {
  PlatformAuditItem,
  PlatformAuditPage,
  PlatformWorkspace,
  PlatformWorkspacePage,
  PlatformWorkspaceUpdate,
} from "@/lib/platform-types";
import { planWorkspaceUpdate, type PlatformWorkspaceQuery } from "@/lib/platform-rules";
export { PlatformConflictError, PlatformInputError, planWorkspaceUpdate } from "@/lib/platform-rules";

/** Every platform action is recorded under this prefix, in the target workspace's audit log. */
export const PLATFORM_AUDIT_PREFIX = "platform.";

const WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  modulesRestricted: true,
  enabledModules: true,
  platformAiKeysAllowed: true,
  _count: { select: { members: { where: { ...ACTIVE_MEMBER } } } },
} as const satisfies Prisma.WorkspaceSelect;

type WorkspaceRow = Prisma.WorkspaceGetPayload<{ select: typeof WORKSPACE_SELECT }>;

function toPlatformWorkspace(w: WorkspaceRow): PlatformWorkspace {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    isHome: w.slug === DEFAULT_WORKSPACE_SLUG,
    activeMembers: w._count.members,
    modulesRestricted: w.modulesRestricted,
    enabledModules: w.enabledModules,
    platformAiKeysAllowed: w.platformAiKeysAllowed,
  };
}

/** Pure: the query as a Prisma filter. Exported for tests. */
export function platformWorkspaceWhere(q: Pick<PlatformWorkspaceQuery, "q" | "modules" | "ai">): Prisma.WorkspaceWhereInput {
  const and: Prisma.WorkspaceWhereInput[] = [];
  if (q.q) {
    and.push({
      OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q, mode: "insensitive" } }],
    });
  }
  if (q.modules === "every") and.push({ modulesRestricted: false });
  if (q.modules === "chosen") and.push({ modulesRestricted: true });
  if (q.ai === "gitwork") and.push({ platformAiKeysAllowed: true });
  if (q.ai === "own") and.push({ platformAiKeysAllowed: false });
  return and.length ? { AND: and } : {};
}

/**
 * One page of businesses. Counting, sorting and paging happen in the database, so the
 * console costs the same with five businesses or five thousand. The page is clamped to
 * the last one, so a narrowing filter never lands on an empty page.
 */
export async function listPlatformWorkspaces(q: PlatformWorkspaceQuery): Promise<PlatformWorkspacePage> {
  const where = platformWorkspaceWhere(q);
  const total = await prisma.workspace.count({ where });
  const pages = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, pages - 1);
  // Members sorts on every membership (Prisma can't order by a filtered count); the
  // column shows active members. Close enough to order a list, and stated here.
  const orderBy: Prisma.WorkspaceOrderByWithRelationInput[] =
    q.sort === "name"
      ? [{ name: q.dir }, { id: "asc" }]
      : q.sort === "members"
        ? [{ members: { _count: q.dir } }, { id: "asc" }]
        : [{ createdAt: q.dir }, { id: "asc" }];
  const rows = await prisma.workspace.findMany({
    where,
    orderBy,
    skip: page * q.pageSize,
    take: q.pageSize,
    select: WORKSPACE_SELECT,
  });
  return { workspaces: rows.map(toPlatformWorkspace), total, page, pageSize: q.pageSize };
}

export async function getPlatformWorkspace(id: string): Promise<PlatformWorkspace | null> {
  const row = await prisma.workspace.findUnique({ where: { id }, select: WORKSPACE_SELECT });
  return row ? toPlatformWorkspace(row) : null;
}

export async function updatePlatformWorkspace(
  actorId: string,
  workspaceId: string,
  input: PlatformWorkspaceUpdate,
): Promise<PlatformWorkspace> {
  const current = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, updatedAt: true, modulesRestricted: true, enabledModules: true, platformAiKeysAllowed: true },
  });
  if (!current) throw Object.assign(new Error("Workspace not found"), { status: 404 });

  const { changed, before, next } = planWorkspaceUpdate({ ...current, updatedAt: current.updatedAt.toISOString() }, input);
  if (changed) {
    await prisma.workspace.update({ where: { id: workspaceId }, data: next });
    await recordAuditEntry({
      workspaceId,
      actorId,
      action: "platform.workspace.settings_changed",
      target: `workspace.${current.slug}`,
      before,
      after: next,
    });
  }
  return (await getPlatformWorkspace(workspaceId))!;
}

export async function listPlatformAudit(q: { page: number; pageSize: number; workspaceId: string | null }): Promise<PlatformAuditPage> {
  const where: Prisma.AuditLogWhereInput = {
    action: { startsWith: PLATFORM_AUDIT_PREFIX },
    ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
  };
  const total = await prisma.auditLog.count({ where });
  const pages = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, pages - 1);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * q.pageSize,
    take: q.pageSize,
    select: {
      id: true,
      action: true,
      createdAt: true,
      before: true,
      after: true,
      workspace: { select: { name: true } },
      actor: { select: { name: true, email: true } },
    },
  });
  return {
    entries: rows.map(
      (r): PlatformAuditItem => ({
        id: r.id,
        action: r.action,
        workspaceName: r.workspace?.name ?? "—",
        actorName: r.actor?.name ?? r.actor?.email ?? "Someone",
        createdAt: r.createdAt.toISOString(),
        before: r.before,
        after: r.after,
      }),
    ),
    total,
    page,
    pageSize: q.pageSize,
  };
}
