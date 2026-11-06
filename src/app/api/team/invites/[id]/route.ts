import { NextRequest } from "next/server";
import { revokeInvite, deleteInvite, findInvite, updateInviteLabel } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireTeamAdmin } from "@/server/auth/team-admin";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTeamAdmin(req);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    // If still pending → revoke (moves to past invites).
    // If already past (revoked/accepted) → permanently delete so list stays clean.
    // An invite in another workspace reads as not found.
    const invite = await findInvite(actor.workspaceId, id);
    if (!invite) return apiError("Not found", 404);

    if (invite.status === "PENDING") {
      const result = await revokeInvite(actor.workspaceId, id);
      return apiOk(result);
    } else {
      await deleteInvite(actor.workspaceId, id);
      return apiOk({ ok: true });
    }
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTeamAdmin(req);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    const body = await req.json().catch(() => ({}));
    const updated = await updateInviteLabel(actor.workspaceId, id, body.label ?? null);
    if (!updated) return apiError("Not found", 404);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}
