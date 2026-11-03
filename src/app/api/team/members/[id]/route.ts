/**
 * PATCH  /api/team/members/[id] → update a member's role and/or permissions (admin only)
 * DELETE /api/team/members/[id] → ARCHIVE a member (admin only). Kept so an old
 *   client or bookmarked call does the safe thing; it no longer deletes anything.
 *   Archive / restore have their own routes alongside this one.
 *
 * ⚠️ Every handler here resolves the caller with `requireAuthedUser`, which reads
 * the membership from the database on each request, NOT `auth()` + the session
 * role. The session role is baked into the JWT at sign-in, so an admin who has
 * just been archived would still read as ADMIN for up to the session-recheck
 * window — long enough to archive or restore other people.
 */

import { z } from "zod";
import { archiveMember, updateMember } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { recordAuditEntry } from "@/server/audit-log";
import { ensureBaseRecords } from "@/server/bootstrap";
import { ROLE_IDS } from "@/types/auth";

export const dynamic = "force-dynamic";

const overridesSchema = z.object({
  grant: z.array(z.string()).max(200).default([]),
  revoke: z.array(z.string()).max(200).default([]),
});

const patchSchema = z.object({
  role: z.enum(ROLE_IDS).optional(),
  permissionOverrides: overridesSchema.optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Admins and Super Admins reach this; the per-target rank guardrail lives in updateMember().
    const actor = await requireTeamAdmin(request);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const updated = await updateMember(id, parsed.data, actor.role);

    // Audit trail — role/permission changes are sensitive enough that we always log them.
    const { workspace } = await ensureBaseRecords();
    if (parsed.data.role !== undefined) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: actor.id,
        action: "team.member.role_changed",
        target: `user:${updated.user.id}`,
        after: { role: parsed.data.role },
        metadata: { memberId: id, email: updated.user.email },
      });
    }
    if (parsed.data.permissionOverrides !== undefined) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: actor.id,
        action: "team.member.role_changed",
        target: `user:${updated.user.id}:permissions`,
        after: { permissionOverrides: parsed.data.permissionOverrides },
        metadata: { memberId: id, email: updated.user.email },
      });
    }

    return apiOk({ member: updated });
  } catch (e) {
    if (e instanceof Error && e.message.includes("last Super Admin")) {
      return apiError(e.message, 400);
    }
    return fromError(e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTeamAdmin(request);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);
    const archived = await archiveMember(id, actor);
    if (!archived) return apiError("Member not found", 404);
    const { workspace } = await ensureBaseRecords();
    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "team.member.archived",
      target: `member:${id}`,
      metadata: { memberId: id, via: "DELETE" },
    });
    return apiOk({ ok: true, archived: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("last active Super Admin")) {
      return apiError(e.message, 400);
    }
    return fromError(e);
  }
}
