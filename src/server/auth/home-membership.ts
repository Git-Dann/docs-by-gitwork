/**
 * Which workspace a person is signed in to (multi-tenant Phase 2, the sign-in switch).
 *
 * Every sign-in path (web, iOS, desktop, guest password, MCP) and every request read the
 * membership through here, instead of looking it up by the Gitwork slug. The rule:
 *
 *   1. the workspace the caller's token already names, if that membership is still active;
 *   2. otherwise Gitwork, if they are an active member of it (so every Gitwork user keeps
 *      exactly the workspace they had before this change);
 *   3. otherwise their oldest active membership.
 *
 * An archived membership is never chosen. Someone with no active membership anywhere has
 * no workspace, and callers refuse them (see `RevokedAccessError`).
 *
 * `chooseMembership` is pure and unit-tested; `findHomeMembership` is the database read.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { isActiveMember } from "@/server/auth/member-status";

export interface MembershipCandidate {
  workspaceId: string;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  workspace: { slug: string };
}

export function chooseMembership<M extends MembershipCandidate>(
  memberships: readonly M[],
  preferredWorkspaceId?: string | null,
): M | null {
  const active = memberships.filter((m) => isActiveMember(m));
  if (active.length === 0) return null;
  if (preferredWorkspaceId) {
    const preferred = active.find((m) => m.workspaceId === preferredWorkspaceId);
    if (preferred) return preferred;
  }
  const home = active.find((m) => m.workspace.slug === DEFAULT_WORKSPACE_SLUG);
  if (home) return home;
  return [...active].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
}

/**
 * The caller's membership: the one their token names when it is still active, else the
 * rule above. Returns the row's id, workspace, role and lifecycle fields.
 */
export async function findHomeMembership(userId: string, preferredWorkspaceId?: string | null) {
  // includes-archived: chooseMembership decides, and must see archived rows to skip them.
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      id: true,
      workspaceId: true,
      role: true,
      permissions: true,
      permissionOverrides: true,
      archivedAt: true,
      createdAt: true,
      workspace: { select: { slug: true, rolePermissions: true, modulesRestricted: true, enabledModules: true } },
    },
  });
  return chooseMembership(memberships, preferredWorkspaceId);
}

/** `findHomeMembership` for a page that starts from the web session (id, or email for old tokens). */
export async function findSessionMembership(
  sessionUser: { id?: string | null; email?: string | null; workspaceId?: string | null } | null | undefined,
) {
  if (!sessionUser) return null;
  const userId =
    sessionUser.id ||
    (sessionUser.email
      ? (await prisma.user.findUnique({ where: { email: sessionUser.email }, select: { id: true } }))?.id
      : undefined);
  if (!userId) return null;
  return findHomeMembership(userId, sessionUser.workspaceId ?? null);
}
