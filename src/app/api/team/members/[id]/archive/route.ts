/**
 * POST /api/team/members/[id]/archive — remove someone's access, keep their record.
 *
 * They are refused on their next request, their live session is cleared on its
 * next read, and they disappear from every roster. Restorable for
 * ARCHIVE_RETENTION_DAYS. See archiveMember() in src/server/team.ts.
 */
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { archiveMember } from "@/server/team";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { recordAuditEntry } from "@/server/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTeamAdmin(request);
    const { id } = await params;
    const archived = await archiveMember(id, actor);
    if (!archived) return apiError("Member not found", 404);
    await recordAuditEntry({
      workspaceId: actor.workspaceId,
      actorId: actor.id,
      action: "team.member.archived",
      target: `member:${id}`,
      metadata: { memberId: id },
    });
    return apiOk({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("last active Super Admin")) {
      return apiError(e.message, 400);
    }
    return fromError(e);
  }
}
