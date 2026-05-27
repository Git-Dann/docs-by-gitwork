import { NextRequest } from "next/server";
import { revokeInvite, deleteInvite, updateInviteLabel } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    // If still pending → revoke (moves to past invites).
    // If already past (revoked/accepted) → permanently delete so list stays clean.
    const invite = await prisma.workspaceInvite.findUnique({ where: { id } });
    if (!invite) return apiError("Not found", 404);

    if (invite.status === "PENDING") {
      const result = await revokeInvite(id);
      return apiOk(result);
    } else {
      await deleteInvite(id);
      return apiOk({ ok: true });
    }
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    // Verify the invite belongs to the default workspace
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id },
      include: { workspace: { select: { slug: true } } },
    });
    if (!invite || invite.workspace.slug !== DEFAULT_WORKSPACE_SLUG) {
      return apiError("Not found", 404);
    }

    const body = await req.json().catch(() => ({}));
    const updated = await updateInviteLabel(id, body.label ?? null);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}
