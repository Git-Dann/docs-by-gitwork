import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export async function getWorkspace() {
  return prisma.workspace.findUniqueOrThrow({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
}

export async function listMembers() {
  const workspace = await getWorkspace();
  return prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function removeMember(memberId: string) {
  return prisma.workspaceMember.delete({ where: { id: memberId } });
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
