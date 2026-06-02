import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getRequestUser } from "@/server/auth/request-user";
import {
  isSuperAdmin,
  normalizeMatrix,
  normalizeOverrides,
  resolveEffectivePermissions,
} from "@/types/auth";

export type EffectiveUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  permissions: string[];
  workspaceId: string;
  membershipId: string;
};

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Resolve the authenticated user for an API route. Bridges:
//   • Mobile JWT path (headers set by middleware after verifyMobileToken)
//   • Web NextAuth session
//
// Looks up the user's WorkspaceMember for the default workspace so callers
// get role + permissions + workspaceId in one go. Throws UnauthorizedError
// when no identity can be resolved — route handlers catch via fromError.
export async function requireAuthedUser(req: Request): Promise<EffectiveUser> {
  let userIdOrEmail: { id?: string; email?: string } = {};

  const mobileUser = getRequestUser(req);
  if (mobileUser) {
    userIdOrEmail = { id: mobileUser.id, email: mobileUser.email };
  } else {
    const session = await auth();
    const sessionUser = session?.user;
    if (sessionUser?.id || sessionUser?.email) {
      userIdOrEmail = {
        id: sessionUser.id ?? undefined,
        email: sessionUser.email ?? undefined,
      };
    }
  }

  if (!userIdOrEmail.id && !userIdOrEmail.email) {
    throw new UnauthorizedError();
  }

  const dbUser = await prisma.user.findFirst({
    where: userIdOrEmail.id
      ? { id: userIdOrEmail.id }
      : { email: userIdOrEmail.email! },
    include: {
      memberships: {
        where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
        take: 1,
        include: { workspace: { select: { rolePermissions: true } } },
      },
    },
  });

  if (!dbUser || dbUser.memberships.length === 0) {
    throw new UnauthorizedError("No workspace membership");
  }

  const membership = dbUser.memberships[0];
  // Resolve effective permissions LIVE from the role matrix + this member's
  // overrides — independent of the cached `permissions` column and the JWT. This
  // makes every server-side check (the can* helpers below, field gating) correct
  // the instant a Super Admin edits the matrix, with no re-login and no dependence
  // on migration timing.
  const matrix = normalizeMatrix(membership.workspace?.rolePermissions);
  const overrides = normalizeOverrides(membership.permissionOverrides);
  const permissions = resolveEffectivePermissions(membership.role, matrix, overrides);

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
    role: membership.role,
    permissions,
    workspaceId: membership.workspaceId,
    membershipId: membership.id,
  };
}

// All permission checks below follow one rule: SUPER_ADMIN bypasses; everyone else
// (including ADMIN) is governed by their resolved permissions, which come from the
// role matrix + per-person overrides. The default matrix grants ADMIN everything,
// so admins keep full access out of the box — but a Super Admin can now narrow any
// role, including Admin, via the Roles & Permissions matrix.
/**
 * Like requireAuthedUser but returns null instead of throwing when no per-user
 * identity can be resolved (e.g. an external API_KEY-only call with no session or
 * mobile JWT). Lets read routes apply field gating when a user is known, while
 * still serving trusted workspace-key callers.
 */
export async function getEffectiveUserOrNull(req: Request): Promise<EffectiveUser | null> {
  try {
    return await requireAuthedUser(req);
  } catch {
    return null;
  }
}

/**
 * Like requireAuthedUser, but for single-operator / legacy-bearer mobile callers:
 * when no per-user identity resolves — i.e. the app sent the shared workspace
 * bearer (API_KEY) rather than a per-user Foundry mobile JWT — fall back to the
 * default workspace owner instead of throwing 401. This keeps self-service
 * features (Backstage expenses) working today, while preserving correct
 * attribution the moment a real mobile JWT IS present (this only changes the
 * otherwise-401 "no identity" case, never an authenticated one).
 *
 * Use for per-user self-service routes. Do NOT use where a specific privilege
 * must be proven (approvals) — those keep strict requireAuthedUser + assert*.
 */
export async function requireAuthedUserOrDefault(req: Request): Promise<EffectiveUser> {
  const resolved = await getEffectiveUserOrNull(req);
  if (resolved) return resolved;

  const { workspace, user } = await ensureBaseRecords();
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.id },
    include: { workspace: { select: { rolePermissions: true } } },
  });
  if (!membership) throw new UnauthorizedError();

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
    workspaceId: workspace.id,
    membershipId: membership.id,
  };
}

export function canApproveBackstage(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("backstage.approve");
}

export function assertCanApproveBackstage(user: EffectiveUser): void {
  if (!canApproveBackstage(user)) {
    throw new ForbiddenError("Backstage approval permission required");
  }
}

// Expenses are opt-in per account (the `backstage.expenses` flag) so HR/finance can
// get access without becoming an Admin.
export function canManageExpenses(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("backstage.expenses");
}

/** DevOps lead: may publish the consolidated end-of-day task roll-up. */
export function canPublishTaskRollup(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("tasks.publish");
}

export function assertCanPublishTaskRollup(user: EffectiveUser): void {
  if (!canPublishTaskRollup(user)) {
    throw new ForbiddenError("Task roll-up publish permission required");
  }
}

/**
 * Does this user see every client, or only the ones they're explicitly assigned?
 * Holders of the `seeAllClients` flag (and Super Admins) see all; restricted
 * developers are scoped to their ClientAssignment rows.
 */
export function canSeeAllClients(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("seeAllClients");
}

// ── Field-level visibility ──────────────────────────────────────────────────
// Granular, per-product data gates. Enforced server-side (the value is blanked in
// the response), so toggling them in the matrix takes effect without a re-login.

/** Candidate hourly rate + tier rate defaults inside Code. Off for developer accounts. */
export function canViewRates(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("code.viewRates");
}

/** Cost line-item totals and margins on the proposal Costing breakdown (Docs). */
export function canViewCosts(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("docs.viewCosts");
}

/** The Rate Card (people + day rates) and the day rates pulled into proposal costing. */
export function canViewRateCard(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("rateCard.view");
}
