/**
 * The Platform console's view of every business on Foundry, and the one change it can
 * make so far: which modules a business has, and whether it may use Gitwork's AI keys.
 *
 * ⚠️ This module reads ACROSS workspaces on purpose. It is the only place that should,
 * and Phase 2 of docs/multi-tenant-roadmap.md adds a sweep that allow-lists this
 * folder by name, so the exception stays explicit. Every caller must have passed
 * requirePlatformAdmin first; nothing here checks it again.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { recordAuditEntry } from "@/server/audit-log";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import type { PlatformAuditItem, PlatformWorkspace, PlatformWorkspaceUpdate } from "@/lib/platform-types";
import { planWorkspaceUpdate } from "@/lib/platform-rules";
export { PlatformInputError, planWorkspaceUpdate } from "@/lib/platform-rules";

/** Every platform action is recorded under this prefix, in the target workspace's audit log. */
export const PLATFORM_AUDIT_PREFIX = "platform.";

export async function listPlatformWorkspaces(): Promise<PlatformWorkspace[]> {
  const rows = await prisma.workspace.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      modulesRestricted: true,
      enabledModules: true,
      platformAiKeysAllowed: true,
      _count: { select: { members: { where: { ...ACTIVE_MEMBER } } } },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    createdAt: w.createdAt.toISOString(),
    isHome: w.slug === DEFAULT_WORKSPACE_SLUG,
    activeMembers: w._count.members,
    modulesRestricted: w.modulesRestricted,
    enabledModules: w.enabledModules,
    platformAiKeysAllowed: w.platformAiKeysAllowed,
  }));
}

export async function updatePlatformWorkspace(
  actorId: string,
  workspaceId: string,
  input: PlatformWorkspaceUpdate,
): Promise<PlatformWorkspace> {
  const current = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, modulesRestricted: true, enabledModules: true, platformAiKeysAllowed: true },
  });
  if (!current) throw Object.assign(new Error("Workspace not found"), { status: 404 });

  const { changed, before, next } = planWorkspaceUpdate(current, input);
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
  const all = await listPlatformWorkspaces();
  return all.find((w) => w.id === workspaceId)!;
}

export async function listPlatformAudit(limit = 50): Promise<PlatformAuditItem[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: { startsWith: PLATFORM_AUDIT_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: limit,
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
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    workspaceName: r.workspace?.name ?? "—",
    actorName: r.actor?.name ?? r.actor?.email ?? "Someone",
    createdAt: r.createdAt.toISOString(),
    before: r.before,
    after: r.after,
  }));
}
