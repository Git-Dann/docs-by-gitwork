import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { canManageRole } from "@/types/auth";

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireTeamAdmin(req);
    const { userId } = await params;
    const { newPassword } = ResetPasswordSchema.parse(await req.json());

    // Only someone in the caller's own workspace. Anyone else reads as not found.
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId } },
      select: { id: true, role: true },
    });
    if (!target) return apiError("Member not found", 404);
    // Never up the role ladder: an Admin can't reset a Super Admin's (or another Admin's)
    // password. Your own is always allowed.
    if (userId !== actor.id && !canManageRole(actor.role, target.role)) {
      return apiError("You can't reset the password of someone at or above your role.", 403);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
