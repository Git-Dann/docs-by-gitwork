/**
 * POST /api/team/members/[id]/restore — give an archived member their access back.
 *
 * Their role, permissions and overrides were never touched, so this restores them
 * exactly. Refused once the retention window has passed. See restoreMember().
 */
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { restoreMember } from "@/server/team";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { recordAuditEntry } from "@/server/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTeamAdmin(request);
    const { id } = await params;
    const restored = await restoreMember(id, actor);
    if (!restored) return apiError("Member not found", 404);
    await recordAuditEntry({
      workspaceId: actor.workspaceId,
      actorId: actor.id,
      action: "team.member.restored",
      target: `member:${id}`,
      metadata: { memberId: id },
    });
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
