// Bearer-token auth for /api/mcp. Bridges OAuth access tokens (issued by
// /api/oauth/token) onto the same EffectiveUser shape every server module
// already understands — so per-user scoping (ClientAssignment / canManage…)
// applies automatically.

import { prisma } from "@/lib/prisma";
import { validateAccessToken } from "@/server/oauth";
import { findActiveMembershipIn, findHomeMembership } from "@/server/auth/home-membership";
import {
  normalizeMatrix,
  normalizeOverrides,
  resolveEffectivePermissions,
} from "@/types/auth";
import { canConnectMcp, type EffectiveUser } from "@/server/auth/effective-user";

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

  // The workspace this connection was approved in. Every call resolves the person there and
  // only there, so a token can never read another workspace the person also belongs to.
  const connection = await prisma.mcpConnection.findUnique({
    where: { userId_oauthClientId: { userId: validated.user.id, oauthClientId: validated.oauthClientId } },
    select: { workspaceId: true, revokedAt: true },
  });
  if (!connection || connection.revokedAt) return null;
  return resolveMcpActor(validated.user.id, connection.workspaceId);
}

/**
 * The person behind an MCP token, re-checked on EVERY call and every refresh — not just when
 * they first connected. Null when they've been archived or removed, or no longer hold
 * `mcp.connect`. Before this, both were only checked at /api/oauth/authorize, so an archived
 * member (or one whose MCP permission was taken away) kept working MCP access for as long as
 * Claude kept refreshing — 30 days at a time.
 */
export async function resolveMcpActor(userId: string, workspaceId: string): Promise<EffectiveUser | null> {
  const user = await resolveEffectiveUserById(userId, workspaceId, { onlyThisWorkspace: true });
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
  preferredWorkspaceId?: string | null,
  opts: { onlyThisWorkspace?: boolean } = {},
): Promise<EffectiveUser | null> {
  // Same membership rule as every sign-in path (src/server/auth/home-membership.ts): an
  // ACTIVE membership only — an archived member has no access anywhere in Foundry (§57),
  // MCP included. MCP tokens are not bound to a workspace yet, so this is Gitwork for every
  // Gitwork member, else the person's own.
  // A credential bound to one workspace (an MCP connection) resolves only there.
  const membership =
    opts.onlyThisWorkspace && preferredWorkspaceId
      ? await findActiveMembershipIn(userId, preferredWorkspaceId)
      : await findHomeMembership(userId, preferredWorkspaceId);
  if (!membership) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) return null;

  const matrix = normalizeMatrix(membership.workspace?.rolePermissions);
  const overrides = normalizeOverrides(membership.permissionOverrides);
  const permissions = resolveEffectivePermissions(membership.role, matrix, overrides);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: membership.role,
    permissions,
    workspaceId: membership.workspaceId,
    membershipId: membership.id,
  };
}
