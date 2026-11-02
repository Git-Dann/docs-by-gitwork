import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ROLE_IDS } from "@/types/auth";

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
  try {
    const actor = await requireTeamAdmin(req);
    const { userId } = await params;

    if (userId === actor.id) {
      return apiError("You cannot remove your own account", 400);
    }

    const workspace = { id: actor.workspaceId };
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      select: { id: true },
    });
    if (!target) return apiError("Member not found", 404);

    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    });

    await prisma.user.delete({ where: { id: userId } });

    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
