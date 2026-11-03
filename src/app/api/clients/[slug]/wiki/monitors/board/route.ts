import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { canSeeAllClients, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { assignedClientIds } from "@/server/tasks";
import { isAgencyClient } from "@/lib/agency-client";
import { loadMonitorBoard } from "@/server/wiki-monitor-board";

/**
 * GET — every client's monitors, for the Gitwork wiki's Monitors section.
 *
 * Only the agency's own slug answers (404 otherwise), so no client's wiki can be made to show
 * another client's status. A restricted user sees only the clients they can already open — the
 * board shows what they could find one client at a time, never more.
 *
 * Signed-in people only: the workspace comes from the caller (not the default-workspace
 * lookup), and an API-key caller has no workspace to name.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!isAgencyClient(slug)) return apiError("Not found", 404);
    const user = await requireAuthedUser(req);
    await assertClientAccessBySlug(user, slug);

    let clientIds: string[] | null = null;
    if (!canSeeAllClients(user)) {
      const agency = await prisma.workspaceClient.findUnique({
        where: { workspaceId_slug: { workspaceId: user.workspaceId, slug } },
        select: { id: true },
      });
      clientIds = [...new Set([...(await assignedClientIds(user)), ...(agency ? [agency.id] : [])])];
    }
    return apiOk(await loadMonitorBoard(user.workspaceId, clientIds));
  } catch (err) {
    return fromError(err);
  }
}
