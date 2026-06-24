// Client assignments — which clients a team member is linked to.
//
// Backs the `seeAllClients=off` feature flag: a restricted developer only sees
// the clients they're assigned here (Portal list, task board, standups), PLUS any
// client they're placed on in Code (open placement, matched by email — see
// placementClientIds). Managed by admins from Settings → Team. Mirrors the Care
// `SupportClientMembership` pattern but for the Portal `WorkspaceClient`.

import { prisma } from "@/lib/prisma";
import { type EffectiveUser, ForbiddenError, canSeeAllClients } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";
import type { ClientAssignmentDTO } from "@/types/tasks";

/**
 * Client IDs a developer is implicitly linked to via the Code product: any client with
 * an OPEN placement (endDate null) on a Candidate whose email matches the user's email.
 * This bridges Code placements → Portal/task visibility, so placing a dev on a client in
 * Code automatically scopes a restricted (`seeAllClients=off`) developer to that client —
 * no manual Settings → Team ClientAssignment needed. Candidate↔User is matched by email
 * (case-insensitive), the same join the team-roster seed maintains.
 */
export async function placementClientIds(user: EffectiveUser): Promise<string[]> {
  if (!user.email) return [];
  const placements = await prisma.placement.findMany({
    where: {
      endDate: null,
      clientId: { not: null },
      candidate: {
        workspaceId: user.workspaceId,
        email: { equals: user.email, mode: "insensitive" },
      },
    },
    select: { clientId: true },
  });
  return [...new Set(placements.map((p) => p.clientId).filter((id): id is string => Boolean(id)))];
}

/**
 * Throw unless `user` may access this specific client. Super Admins + `seeAllClients`
 * holders see every client; everyone else needs either a ClientAssignment to it OR an
 * open Code placement on it (see placementClientIds). A trusted API_KEY-only caller (no
 * per-user identity → null) passes, matching the convention used by assertCan and the
 * field gates. clientId is the canonical id used by assignedClientIds.
 */
export async function assertClientAccess(user: EffectiveUser | null, clientId: string): Promise<void> {
  if (!user || canSeeAllClients(user)) return;
  const assigned = await prisma.clientAssignment.findFirst({
    where: { workspaceId: user.workspaceId, userId: user.id, clientId },
    select: { id: true },
  });
  if (assigned) return;
  const viaPlacement = await placementClientIds(user);
  if (viaPlacement.includes(clientId)) return;
  throw new ForbiddenError("You don't have access to this client.");
}

/**
 * Slug variant for the per-client routes (/api/clients/[slug]/...). Resolves the workspace
 * client by slug, then defers to assertClientAccess. If the slug doesn't resolve to a real
 * WorkspaceClient (e.g. a proposal-derived pseudo-client with no stored sub-resources) we
 * don't make an access decision here — the route's own 404 handles it.
 */
export async function assertClientAccessBySlug(user: EffectiveUser | null, slug: string): Promise<void> {
  if (!user || canSeeAllClients(user)) return;
  const client = await prisma.workspaceClient.findFirst({
    where: { workspaceId: user.workspaceId, slug },
    select: { id: true },
  });
  if (!client) return;
  await assertClientAccess(user, client.id);
}

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
