import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { isExternalRole, isSuperAdmin } from "@/types/auth";
import {
  ForbiddenError,
  canSeeAllClients,
  canViewMonitors,
  requireAuthedUser,
} from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { loadMonitorBoard, type MonitorsPageDTO } from "@/server/wiki-monitor-board";

export const dynamic = "force-dynamic";

/**
 * GET — every client's uptime monitors, for the Monitors page (/app/monitors).
 *
 * Gated on the `monitors` permission (Staff and Admin by default, granted per developer).
 * Not scoped to assigned clients: watching every service is what the permission is for.
 * Signed-in people only — the workspace comes from the caller.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewMonitors(user) || isExternalRole(user.role)) throw new ForbiddenError("You don't have access to Monitors.");

    const canOpenPortal = isSuperAdmin(user.role) || user.permissions.includes("clients");
    const openableClientIds = !canOpenPortal ? [] : canSeeAllClients(user) ? null : await assignedClientIds(user);

    const board = await loadMonitorBoard(user.workspaceId, null);
    const body: MonitorsPageDTO = { ...board, openableClientIds };
    return apiOk(body);
  } catch (err) {
    return fromError(err);
  }
}
