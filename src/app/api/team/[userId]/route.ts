import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ROLE_IDS } from "@/types/auth";
import { archiveMember } from "@/server/team";
import { recordAuditEntry } from "@/server/audit-log";

const UpdateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(ROLE_IDS).optional(),
  permissions: z.array(z.string()).optional(),
});


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireTeamAdmin(req);
    const { userId } = await params;
    const body = UpdateMemberSchema.parse(await req.json());
    const workspace = { id: actor.workspaceId };

    // Someone in another workspace reads as not found, before anything is written.
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      select: { id: true },
    });
    if (!target) return apiError("Member not found", 404);

    if (body.name) {
      await prisma.user.update({ where: { id: userId }, data: { name: body.name } });
    }

    const memberUpdate: { role?: string; permissions?: string[] } = {};
    if (body.role) memberUpdate.role = body.role;
    if (body.permissions !== undefined) memberUpdate.permissions = body.permissions;

    const member = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      data: memberUpdate,
      include: { user: true },
    });

    return apiOk({
      userId: member.userId,
      memberId: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      permissions: (member.permissions as string[]) ?? [],
    });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  // Archives, never deletes: the User row keeps who did what on tasks, leave and documents
  // (§57). Same rules as Settings → Team: not yourself, not someone at or above your role,
  // never the last active Super Admin. Restorable for 30 days.
  try {
    const actor = await requireTeamAdmin(req);
    const { userId } = await params;

    if (userId === actor.id) {
      return apiError("You cannot remove your own account", 400);
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId } },
      select: { id: true },
    });
    if (!target) return apiError("Member not found", 404);

    const archived = await archiveMember(target.id, actor);
    if (!archived) return apiError("Member not found", 404);

    await recordAuditEntry({
      workspaceId: actor.workspaceId,
      actorId: actor.id,
      action: "team.member.archived",
      target: `member:${target.id}`,
      metadata: { memberId: target.id, userId, via: "DELETE /api/team/[userId]" },
    });

    return apiOk({ ok: true, archived: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("last active Super Admin")) {
      return apiError(err.message, 400);
    }
    return fromError(err);
  }
}
