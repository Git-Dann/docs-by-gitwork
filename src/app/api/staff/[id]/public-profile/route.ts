/**
 * DELETE /api/staff/[id]/public-profile — someone managing Staff takes a person's public page
 * down. There is deliberately no way to switch one ON here: that is only ever the person's own
 * choice (CLAUDE.md §139).
 */
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageCode, requireAuthedUser } from "@/server/auth/effective-user";
import { unpublishProfile } from "@/server/public-profile";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageCode, "manage Staff");
    const { id } = await params;
    await unpublishProfile(user.workspaceId, id);
    return apiOk({ unpublished: true });
  } catch (error) {
    return fromError(error);
  }
}
