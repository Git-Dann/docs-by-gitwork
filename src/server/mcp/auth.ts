// Bearer-token auth for /api/mcp. Bridges OAuth access tokens (issued by
// /api/oauth/token) onto the same EffectiveUser shape every server module
// already understands — so per-user scoping (ClientAssignment / canManage…)
// applies automatically.

import { prisma } from "@/lib/prisma";
import { validateAccessToken } from "@/server/oauth";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import {
  normalizeMatrix,
  normalizeOverrides,
  resolveEffectivePermissions,
} from "@/types/auth";
import { canConnectMcp, type EffectiveUser } from "@/server/auth/effective-user";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";

/**
 * Extract a bearer token from the Authorization header and resolve it to an
 * EffectiveUser. Returns null on any failure — callers respond with 401.
 *
 * This is the security perimeter for the in-app MCP route. Anything past
 * this function trusts the EffectiveUser the same way requireAuthedUser
 * callers do.
 */
export async function validateMcpBearer(req: Request): Promise<EffectiveUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const validated = await validateAccessToken(token);
  if (!validated) return null;

  return resolveMcpActor(validated.user.id);
}

/**
 * The person behind an MCP token, re-checked on EVERY call and every refresh — not just when
 * they first connected. Null when they've been archived or removed, or no longer hold
 * `mcp.connect`. Before this, both were only checked at /api/oauth/authorize, so an archived
 * member (or one whose MCP permission was taken away) kept working MCP access for as long as
 * Claude kept refreshing — 30 days at a time.
 */
export async function resolveMcpActor(userId: string): Promise<EffectiveUser | null> {
  const user = await resolveEffectiveUserById(userId);
  if (!user || !canConnectMcp(user)) return null;
  return user;
}

/**
 * Resolve a user id (from a bearer token or a NextAuth session) to the same
 * EffectiveUser shape every server module understands — membership in the
 * default workspace + role + matrix/override-resolved permissions. Returns null
 * when the user has no ACTIVE membership (none, or archived). Shared by the MCP bearer path and the OAuth
 * consent/authorize flow so both apply identical per-user scoping.
 */
export async function resolveEffectiveUserById(
  userId: string,
): Promise<EffectiveUser | null> {
  // Resolve the user's membership in the default workspace. Mirrors
  // requireAuthedUser's lookup — same field-gating math, same role.
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: { slug: DEFAULT_WORKSPACE_SLUG },
      // An archived member has no access anywhere in Foundry (§57), MCP included.
      ...ACTIVE_MEMBER,
    },
    include: {
      workspace: { select: { rolePermissions: true } },
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
  });
  if (!membership) return null;

  const matrix = normalizeMatrix(membership.workspace?.rolePermissions);
  const overrides = normalizeOverrides(membership.permissionOverrides);
  const permissions = resolveEffectivePermissions(membership.role, matrix, overrides);

  return {
    id: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    avatarUrl: membership.user.avatarUrl,
    role: membership.role,
    permissions,
    workspaceId: membership.workspaceId,
    membershipId: membership.id,
  };
}
