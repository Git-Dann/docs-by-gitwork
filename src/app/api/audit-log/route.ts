/**
 * GET /api/audit-log → paginated list of workspace audit entries (admin only).
 *
 * Optional query params:
 *   action — filter by action (e.g. `settings.ai_provider.changed`)
 *   cursor — entry id to paginate from
 *   limit  — max 200, default 50
 */

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { listAuditLog } from "@/server/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);
    if (session.user.role !== "ADMIN") {
      return apiError("Admin access required", 403);
    }

    const { workspace } = await ensureBaseRecords();

    const url = request.nextUrl;
    const action = url.searchParams.get("action") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10))) : 50;

    const result = await listAuditLog({
      workspaceId: workspace.id,
      action,
      cursor,
      limit,
    });

    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
