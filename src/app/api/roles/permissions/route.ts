/**
 * GET /api/roles/permissions → the workspace role matrix (Super Admin only).
 * PUT /api/roles/permissions → replace the matrix, recompute every member, audit-log it.
 *
 * The matrix defines what each configurable role (ADMIN/STAFF/DEVELOPER) can do.
 * SUPER_ADMIN is implicit-all and never stored. Editing the matrix is the one capability
 * reserved to Super Admins (see the plan / canManageRole guardrail).
 */

import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { getRoleMatrix, setRoleMatrix } from "@/server/permissions";
import { recordAuditEntry } from "@/server/audit-log";
import { normalizeMatrix } from "@/types/auth";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

const matrixSchema = z.object({
  ADMIN: z.array(z.string()).max(200),
  STAFF: z.array(z.string()).max(200),
  DEVELOPER: z.array(z.string()).max(200),
});

export async function GET(request: Request) {
  try {
    // Admins may READ the matrix (the Team editor needs role defaults to compute
    // per-person overrides); only Super Admins may write it (PUT below).
    // ⚠️ The role is read from the DATABASE, not from the token. `session.user.role` and the
    // mobile JWT's role claim both carry the role the token was MINTED with, so a demoted or
    // archived caller keeps the route until their token turns over. §88 made a database read
    // the rule; these were missed.
    assertAtLeastAdmin(await requireAuthedUser(request));
    const workspace = { id: await workspaceIdForRequest(request) };
    const matrix = await getRoleMatrix(workspace.id);
    return apiOk({ matrix });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(request: Request) {
  try {
    // ⚠️ Same, and this is the route that REPLACES what every role may do.
    const actor = await requireAuthedUser(request);
    assertSuperAdmin(actor);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = matrixSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const workspace = { id: await workspaceIdForRequest(request) };
    // normalizeMatrix drops any unknown permission ids and fills missing roles with defaults.
    const saved = await setRoleMatrix(workspace.id, normalizeMatrix(parsed.data));

    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "roles.matrix.updated",
      target: "workspace:roles",
      after: saved,
    });

    return apiOk({ matrix: saved });
  } catch (e) {
    return fromError(e);
  }
}
