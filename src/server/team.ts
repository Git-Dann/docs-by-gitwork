import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { ForbiddenError } from "@/server/auth/effective-user";
import { recomputeMember } from "@/server/permissions";
import { canManageRole, normalizeOverrides, type PermissionOverrides, type RoleId } from "@/types/auth";

export async function getWorkspace() {
  return prisma.workspace.findUniqueOrThrow({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
}

// Bootstrap placeholder — never a real team member
const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

export async function listMembers() {
  const workspace = await getWorkspace();
  const rows = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: workspace.id,
      user: { email: { not: BOOTSTRAP_USER_EMAIL } },
    },
    // `googleOAuthEmail` is captured on a member's first successful Google sign-in (the auth
    // jwt callback writes it whenever Google returns a refresh token — which `prompt: "consent"`
    // forces every sign-in). Its presence is therefore a reliable "has actually signed in"
    // signal, separating active members from those only provisioned/invited so far.
    include: { user: { select: { id: true, name: true, email: true, googleOAuthEmail: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Normalise `permissions` (Json column) to a string array for the UI, and surface a derived
  // `hasSignedIn` flag — without exposing the raw OAuth email field beyond the member row.
  return rows.map((row) => {
    const { googleOAuthEmail, ...user } = row.user;
    return {
      ...row,
      user,
      hasSignedIn: Boolean(googleOAuthEmail),
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as unknown[]).filter((p): p is string => typeof p === "string")
        : [],
    };
  });
}

/**
 * Removes a member. Guardrail: the actor can only remove members below their own
 * role, and the last Super Admin can never be removed (workspace lock-out).
 */
export async function removeMember(memberId: string, actorRole: string) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, workspaceId: true, role: true },
  });
  if (!existing) return;

  if (!canManageRole(actorRole, existing.role)) {
    throw new ForbiddenError("You can't remove a member at or above your own role.");
  }
  if (existing.role === "SUPER_ADMIN") {
    await assertNotLastSuperAdmin(existing.workspaceId, memberId);
  }

  return prisma.workspaceMember.delete({ where: { id: memberId } });
}

export interface UpdateMemberInput {
  role?: RoleId;
  permissionOverrides?: PermissionOverrides;
}

/**
 * Updates a member's role and/or per-person permission overrides, then recomputes
 * their cached effective permissions from the role matrix.
 *
 * Guardrails (see canManageRole in src/types/auth.ts):
 *  • You can only manage a member whose current role is below your own — so only a
 *    Super Admin can edit Admins/Super Admins; an Admin manages Staff & Developers.
 *  • You can't assign a role at or above your own (no self-escalation).
 *  • The last Super Admin can't be demoted (workspace lock-out protection).
 * Changing a member's role clears their overrides (clean slate for the new role)
 * unless explicit overrides are supplied in the same call.
 */
export async function updateMember(memberId: string, input: UpdateMemberInput, actorRole: string) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, workspaceId: true, role: true },
  });
  if (!existing) throw new Error("Member not found");

  if (!canManageRole(actorRole, existing.role)) {
    throw new ForbiddenError("You can't manage a member at or above your own role.");
  }

  const roleChanged = input.role !== undefined && input.role !== existing.role;
  if (input.role !== undefined && roleChanged) {
    if (!canManageRole(actorRole, input.role)) {
      throw new ForbiddenError("You can't assign a role at or above your own.");
    }
    if (existing.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
      await assertNotLastSuperAdmin(existing.workspaceId, memberId);
    }
  }

  const overrides =
    input.permissionOverrides !== undefined
      ? normalizeOverrides(input.permissionOverrides)
      : roleChanged
        ? { grant: [], revoke: [] } // reset overrides on a role change
        : undefined;

  await prisma.workspaceMember.update({
    where: { id: memberId },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(overrides !== undefined
        ? { permissionOverrides: overrides as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Refresh the cached resolved `permissions` so middleware/JWT and every reader stay in sync.
  await recomputeMember(memberId);

  return prisma.workspaceMember.findUniqueOrThrow({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

/** Throws if `memberId` is the only remaining (non-bootstrap) Super Admin. */
async function assertNotLastSuperAdmin(workspaceId: string, memberId: string) {
  const others = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      role: "SUPER_ADMIN",
      id: { not: memberId },
      user: { email: { not: BOOTSTRAP_USER_EMAIL } },
    },
  });
  if (others === 0) {
    throw new Error(
      "Can't remove the last Super Admin — promote someone else first or this workspace becomes uneditable.",
    );
  }
}

/**
 * Best-effort match of a user's display name against pending invite labels. Used when a
 * user signs in directly (not via the invite URL) so we don't leave the invite hanging
 * in the Team list forever.
 *
 * Match rules: case-insensitive, trim. Either the label contains the user's first name
 * OR the user's first name contains the label. So an invite labeled "Harry" matches
 * "Harry Brown", and an invite labeled "Harry Brown" matches "Harry".
 */
export async function autoAcceptMatchingInvite(userId: string, userName: string | null | undefined) {
  const firstName = (userName ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || firstName.length < 2) return null;

  const workspace = await getWorkspace();
  const pending = await prisma.workspaceInvite.findMany({
    where: { workspaceId: workspace.id, status: "PENDING" },
    select: { id: true, label: true },
  });

  const match = pending.find((invite) => {
    const label = (invite.label ?? "").trim().toLowerCase();
    if (!label) return false;
    return label.includes(firstName) || firstName.includes(label.split(/\s+/)[0] ?? "");
  });

  if (!match) return null;

  return prisma.workspaceInvite.update({
    where: { id: match.id },
    data: { status: "ACCEPTED", acceptedById: userId },
  });
}

export async function listInvites() {
  const workspace = await getWorkspace();

  // An invite's status only ever changes in response to a real action by the recipient:
  // opening /invite/[token] (acceptInvite) or signing in directly with a name that matches
  // a pending label (autoAcceptMatchingInvite, in the auth jwt callback). We deliberately do
  // NOT auto-match pending invites against the existing member list here. That used to flip a
  // freshly-generated link to "Accepted" the instant its label matched someone already in the
  // workspace (e.g. a teammate seeded from the roster) — so the link never appeared and the
  // invite looked auto-accepted by a person who'd done nothing. A generated link now stays
  // PENDING until it's genuinely used.
  return prisma.workspaceInvite.findMany({
    where: { workspaceId: workspace.id },
    include: {
      invitedBy: { select: { name: true, email: true } },
      acceptedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createInvite(invitedById: string, label?: string) {
  const workspace = await getWorkspace();
  return prisma.workspaceInvite.create({
    data: {
      workspaceId: workspace.id,
      invitedById,
      label: label ?? null,
      status: "PENDING",
    },
  });
}

export async function revokeInvite(inviteId: string) {
  return prisma.workspaceInvite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  });
}

export async function deleteInvite(inviteId: string) {
  return prisma.workspaceInvite.delete({ where: { id: inviteId } });
}

export async function updateInviteLabel(inviteId: string, label: string | null) {
  return prisma.workspaceInvite.update({
    where: { id: inviteId },
    data: { label: label?.trim() || null },
  });
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING") return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;

  // Ensure the user is a member of this workspace
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    update: {},
    create: { workspaceId: invite.workspaceId, userId, role: "STAFF", permissions: [] },
  });

  return prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedById: userId },
  });
}

export async function getInviteByToken(token: string) {
  return prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });
}
