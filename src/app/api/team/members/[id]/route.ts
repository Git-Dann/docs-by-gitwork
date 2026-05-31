/**
 * PATCH  /api/team/members/[id] → update a member's role and/or permissions (admin only)
 * DELETE /api/team/members/[id] → remove a member from the workspace (admin only)
 *
 * The PATCH handler refuses to demote the last admin (lockout protection); see
 * `updateMember()` in src/server/team.ts.
 */

import { z } from "zod";
import { removeMember, updateMember } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { auth } from "@/auth";
import { recordAuditEntry } from "@/server/audit-log";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  permissions: z.array(z.string()).max(100).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return apiError("Forbidden", 403);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const updated = await updateMember(id, parsed.data);

    // Audit trail — role/permission changes are sensitive enough that we always log them.
    const { workspace } = await ensureBaseRecords();
    if (parsed.data.role !== undefined) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: session.user.id,
        action: "team.member.role_changed",
        target: `user:${updated.user.id}`,
        after: { role: parsed.data.role },
        metadata: { memberId: id, email: updated.user.email },
      });
    }
    if (parsed.data.permissions !== undefined) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: session.user.id,
        action: "team.member.role_changed",
        target: `user:${updated.user.id}:permissions`,
        after: { permissions: parsed.data.permissions },
        metadata: { memberId: id, email: updated.user.email },
      });
    }

    return apiOk({ member: updated });
  } catch (e) {
    if (e instanceof Error && e.message.includes("last admin")) {
      return apiError(e.message, 400);
    }
    return fromError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return apiError("Forbidden", 403);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);
    await removeMember(id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
