/**
 * GET /api/roles/permissions → the workspace role matrix (Super Admin only).
 * PUT /api/roles/permissions → replace the matrix, recompute every member, audit-log it.
 *
 * The matrix defines what each configurable role (ADMIN/STAFF/DEVELOPER) can do.
 * SUPER_ADMIN is implicit-all and never stored. Editing the matrix is the one capability
 * reserved to Super Admins (see the plan / canManageRole guardrail).
 */

import { z } from "zod";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getRoleMatrix, setRoleMatrix } from "@/server/permissions";
import { recordAuditEntry } from "@/server/audit-log";
import { isAtLeast, isSuperAdmin, normalizeMatrix } from "@/types/auth";

export const dynamic = "force-dynamic";

const matrixSchema = z.object({
  ADMIN: z.array(z.string()).max(200),
  STAFF: z.array(z.string()).max(200),
  DEVELOPER: z.array(z.string()).max(200),
});

export async function GET() {
  try {
    // Admins may READ the matrix (the Team editor needs role defaults to compute
    // per-person overrides); only Super Admins may write it (PUT below).
    const session = await auth();
    if (!session?.user || !isAtLeast(session.user.role, "ADMIN")) return apiError("Forbidden", 403);
    const { workspace } = await ensureBaseRecords();
    const matrix = await getRoleMatrix(workspace.id);
    return apiOk({ matrix });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || !isSuperAdmin(session.user.role)) return apiError("Forbidden", 403);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = matrixSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const { workspace } = await ensureBaseRecords();
    // normalizeMatrix drops any unknown permission ids and fills missing roles with defaults.
    const saved = await setRoleMatrix(workspace.id, normalizeMatrix(parsed.data));

    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "roles.matrix.updated",
      target: "workspace:roles",
      after: saved,
    });

    return apiOk({ matrix: saved });
  } catch (e) {
    return fromError(e);
  }
}
