import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

const UpdateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  permissions: z.array(z.string()).optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await requireAdmin();
  if (!session) return apiError("Forbidden", 403);

  try {
    const { userId } = await params;
    const body = UpdateMemberSchema.parse(await req.json());

    const workspace = await prisma.workspace.findUnique({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
    });
    if (!workspace) return apiError("Workspace not found", 404);

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
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await requireAdmin();
  if (!session) return apiError("Forbidden", 403);

  try {
    const { userId } = await params;

    if (userId === session.user.id) {
      return apiError("You cannot remove your own account", 400);
    }

    const workspace = await prisma.workspace.findUnique({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    });

    await prisma.user.delete({ where: { id: userId } });

    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
