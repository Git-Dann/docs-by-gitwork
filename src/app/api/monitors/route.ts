import { NextRequest, after } from "next/server";
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
import { runDueMonitors } from "@/server/wiki-monitors";

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

/** Workspaces with a Refresh run in progress, so a second press can't double every probe. */
const refreshing = new Set<string>();

/**
 * POST — Refresh: run this workspace's overdue checks now, the same work the every-minute
 * `wiki-monitors` job does (each monitor still self-throttles to its own interval, so a fresh
 * board checks nothing). Runs after the response: 45 probes with a 15s timeout each are too long
 * to hold a button open. The page re-reads the board as the results land.
 *
 * Before this, Refresh only re-read the database, so when the scheduler stopped (20 Nov 2026,
 * every job silent after run-cron.sh was replaced) it reloaded the same stale rows for two days.
 * Same gate as GET.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewMonitors(user) || isExternalRole(user.role)) throw new ForbiddenError("You don't have access to Monitors.");

    const workspaceId = user.workspaceId;
    if (refreshing.has(workspaceId)) return apiOk({ started: false, alreadyRunning: true });
    refreshing.add(workspaceId);
    after(async () => {
      try {
        await runDueMonitors({ workspaceId, prune: false });
      } catch (err) {
        console.error("[monitors] refresh failed", err);
      } finally {
        refreshing.delete(workspaceId);
      }
    });
    return apiOk({ started: true, alreadyRunning: false });
  } catch (err) {
    return fromError(err);
  }
}
