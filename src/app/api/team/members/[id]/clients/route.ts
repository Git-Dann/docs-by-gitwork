/**
 * GET /api/team/members/[id]/clients → list a member's client assignments (admin only)
 * PUT /api/team/members/[id]/clients → replace-set a member's client assignments (admin only)
 *
 * [id] is the WorkspaceMember id (same as the rest of /api/team/members). It is
 * resolved to the underlying userId here. Backs the `seeAllClients=off` scoping.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listAssignmentsForMember, setAssignments } from "@/server/client-assignments";
import { clientAssignmentSchema } from "@/server/validators";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveUserId(workspaceId: string, membershipId: string): Promise<string | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { id: membershipId, workspaceId },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const userId = await resolveUserId(user.workspaceId, id);
    if (!userId) return apiError("Member not found", 404);
    const assignments = await listAssignmentsForMember(user, userId);
    return apiOk(assignments);
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const userId = await resolveUserId(user.workspaceId, id);
    if (!userId) return apiError("Member not found", 404);
    const body = clientAssignmentSchema.parse(await req.json());
    const assignments = await setAssignments(user, userId, body.clientIds);
    return apiOk(assignments);
  } catch (e) {
    return fromError(e);
  }
}
