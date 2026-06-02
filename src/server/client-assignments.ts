// Client assignments — which clients a team member is linked to.
//
// Backs the `seeAllClients=off` feature flag: a restricted developer only sees
// the clients they're assigned here (Portal list, task board, standups). Managed
// by admins from Settings → Team. Mirrors the Care `SupportClientMembership`
// pattern but for the Portal `WorkspaceClient`.

import { prisma } from "@/lib/prisma";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";
import type { ClientAssignmentDTO } from "@/types/tasks";

export async function listAssignmentsForMember(
  user: EffectiveUser,
  memberUserId: string,
): Promise<ClientAssignmentDTO[]> {
  if (!isAtLeast(user.role, "ADMIN")) throw new ForbiddenError("Admin only");
  const rows = await prisma.clientAssignment.findMany({
    where: { workspaceId: user.workspaceId, userId: memberUserId },
    include: { client: { select: { id: true, name: true, slug: true } } },
    orderBy: { client: { name: "asc" } },
  });
  return rows.map((r) => ({
    clientId: r.clientId,
    clientName: r.client.name,
    clientSlug: r.client.slug,
  }));
}

/** Replace-set the member's client assignments. Admin only. */
export async function setAssignments(
  user: EffectiveUser,
  memberUserId: string,
  clientIds: string[],
): Promise<ClientAssignmentDTO[]> {
  if (!isAtLeast(user.role, "ADMIN")) throw new ForbiddenError("Admin only");

  // Only persist clients that actually belong to this workspace.
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: user.workspaceId, id: { in: clientIds } },
    select: { id: true },
  });
  const target = clients.map((c) => c.id);

  await prisma.$transaction([
    prisma.clientAssignment.deleteMany({
      where: { workspaceId: user.workspaceId, userId: memberUserId },
    }),
    ...(target.length
      ? [
          prisma.clientAssignment.createMany({
            data: target.map((clientId) => ({
              workspaceId: user.workspaceId,
              clientId,
              userId: memberUserId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return listAssignmentsForMember(user, memberUserId);
}
