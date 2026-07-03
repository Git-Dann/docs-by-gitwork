import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getRequestUser } from "@/server/auth/request-user";
import { allowedDocTypes } from "@/lib/templates";
import type { DocumentType } from "@/types/proposal";
import {
  isAtLeast,
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

// Expenses are Super Admin only — submitting, viewing and reviewing reimbursements
// is restricted to the platform owner. Everyone else's Backstage is leave + holidays
// + availability only.
export function canManageExpenses(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role);
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

/** Monthly dev cost + working-days figures on Portal client cards. Off for everyone
 *  except Super Admins (always) and members explicitly granted it (e.g. Syed). */
export function canViewClientFinancials(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("clients.viewFinancials");
}

/** Whether the user may see the admin document types (proposals + contracts). Off for developers
 *  by default → they're scoped to the lightweight types. */
export function canViewAdminDocTypes(user: EffectiveUser): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes("docs.viewAdminTypes");
}

/** The document types this user may list, open, or create. Null user (API-key/server) → all. */
export function allowedDocTypesForUser(user: EffectiveUser | null): DocumentType[] {
  if (!user) return allowedDocTypes(true);
  return allowedDocTypes(canViewAdminDocTypes(user));
}

// ── Action-level (view vs manage + high-risk) ────────────────────────────────
// Each gates the write surface of a product. Without the `*.manage` permission a
// member can still open the module (view) but not create/edit/delete. High-risk
// actions (fix-agent PRs, public sharing) default to Admin-only. Enforced on the
// mutation routes — read paths stay open to anyone with the module.

function can(user: EffectiveUser, id: string): boolean {
  return isSuperAdmin(user.role) || user.permissions.includes(id);
}

/** Create and delete Pulse scans. */
export function canManagePulse(user: EffectiveUser): boolean {
  return can(user, "pulse.manage");
}
/** Run the Pulse fix-agent (opens GitHub PRs on the client repo). High-risk. */
export function canRunFixAgent(user: EffectiveUser): boolean {
  return can(user, "pulse.fixAgent");
}
/** Add/edit/delete candidates + run analysis in Code. */
export function canManageCode(user: EffectiveUser): boolean {
  return can(user, "code.manage");
}
/** Create/edit/delete documents in Docs. */
export function canManageDocs(user: EffectiveUser): boolean {
  return can(user, "docs.manage");
}
/** Generate public share links for documents. High-risk. */
export function canShareDocs(user: EffectiveUser): boolean {
  return can(user, "docs.share");
}
/** Create/edit/delete clients in Portal. */
export function canManageClients(user: EffectiveUser): boolean {
  return can(user, "clients.manage");
}
/** Publish a public client timeline link. High-risk. */
export function canShareClientTimeline(user: EffectiveUser): boolean {
  return can(user, "clients.shareTimeline");
}
/** Connect/disconnect channels + edit workflow rules in Care. */
export function canManageSupport(user: EffectiveUser): boolean {
  return can(user, "support.manage");
}
/**
 * View + create + run studies. The Study research tool lives under Pulse and is gated by the
 * admin-only `study` feature permission (default-off; Admins hold all ids, Super Admins bypass),
 * so view and manage collapse to one gate.
 */
export function canManageStudy(user: EffectiveUser): boolean {
  return can(user, "study");
}
/**
 * Authorize Claude (or any MCP client) to act on the user's behalf. This is the
 * real gate for the whole MCP/OAuth flow — the consent screen, the authorize
 * endpoint, and the self-service settings panel all check it. Admins hold it by
 * default (ALL_PERMISSION_IDS); grant it to Staff/Developers via the matrix.
 */
export function canConnectMcp(user: EffectiveUser): boolean {
  return can(user, "mcp.connect");
}

/**
 * Gate a mutation route by an action permission. No-ops for trusted API_KEY-only
 * callers (no per-user identity) — same convention as the field gates — and throws
 * ForbiddenError for a signed-in user who lacks it.
 */
export function assertCan(user: EffectiveUser | null, check: (u: EffectiveUser) => boolean, label: string): void {
  if (user && !check(user)) {
    throw new ForbiddenError(`You don't have permission to ${label}.`);
  }
}

/**
 * Role-tier gates for workspace-config + dev/maintenance routes. Same convention as
 * assertCan: a signed-in user below the bar is rejected; a trusted API_KEY-only caller
 * (no per-user identity → null) passes, so external/server integrations keep working.
 */
export function assertAtLeastAdmin(user: EffectiveUser | null): void {
  if (user && !isAtLeast(user.role, "ADMIN")) {
    throw new ForbiddenError("Admin access required.");
  }
}

export function assertSuperAdmin(user: EffectiveUser | null): void {
  if (user && !isSuperAdmin(user.role)) {
    throw new ForbiddenError("Super Admin access required.");
  }
}
