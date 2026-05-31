import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

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
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Normalise `permissions` (Json column) to a string array for the UI. Prisma returns
  // unknown JSON; we trust admins to write sane values and silently coerce anything else.
  return rows.map((row) => ({
    ...row,
    permissions: Array.isArray(row.permissions)
      ? (row.permissions as unknown[]).filter((p): p is string => typeof p === "string")
      : [],
  }));
}

export async function removeMember(memberId: string) {
  return prisma.workspaceMember.delete({ where: { id: memberId } });
}

export interface UpdateMemberInput {
  role?: "ADMIN" | "STAFF";
  permissions?: string[];
}

/**
 * Updates a member's role and/or permissions.
 *
 * Safety: refuses to demote the *last* admin to avoid lock-out. If a workspace has only
 * one admin and the caller tries to make them STAFF, throws. The Team UI consults this
 * before showing the action so the user gets a clear error rather than a silent failure.
 */
export async function updateMember(memberId: string, input: UpdateMemberInput) {
  if (input.role === "STAFF") {
    const existing = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      select: { workspaceId: true, role: true },
    });
    if (existing?.role === "ADMIN") {
      const remainingAdmins = await prisma.workspaceMember.count({
        where: {
          workspaceId: existing.workspaceId,
          role: "ADMIN",
          id: { not: memberId },
          user: { email: { not: BOOTSTRAP_USER_EMAIL } },
        },
      });
      if (remainingAdmins === 0) {
        throw new Error(
          "Can't demote the last admin — promote someone else first or this workspace becomes uneditable.",
        );
      }
    }
  }

  return prisma.workspaceMember.update({
    where: { id: memberId },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
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
