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
import type { EffectiveUser } from "@/server/auth/effective-user";

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

  // Resolve the user's membership in the default workspace. Mirrors
  // requireAuthedUser's lookup — same field-gating math, same role.
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: validated.user.id,
      workspace: { slug: DEFAULT_WORKSPACE_SLUG },
    },
    include: { workspace: { select: { rolePermissions: true } } },
  });
  if (!membership) return null;

  const matrix = normalizeMatrix(membership.workspace?.rolePermissions);
  const overrides = normalizeOverrides(membership.permissionOverrides);
  const permissions = resolveEffectivePermissions(membership.role, matrix, overrides);

  return {
    id: validated.user.id,
    email: validated.user.email,
    name: validated.user.name,
    avatarUrl: validated.user.avatarUrl,
    role: membership.role,
    permissions,
    workspaceId: membership.workspaceId,
    membershipId: membership.id,
  };
}
