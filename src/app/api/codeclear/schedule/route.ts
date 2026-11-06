import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getWorkspaceSchedule, parseScheduleRange } from "@/server/schedule";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/codeclear/schedule?from=ISO&to=ISO
 *
 * Workspace-wide schedule. Returns every Placement that overlaps the range,
 * each enriched with a small `candidate` + `client` summary so the iOS
 * timeline view can render without a second round trip.
 *
 * Defaults: from = today, to = today + 30 days. ISO strings accepted.
 *
 * Response shape:
 *   {
 *     from: "ISO",
 *     to: "ISO",
 *     count: number,
 *     blocks: ScheduleBlock[]   // sorted by startDate asc, then candidate name
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = await workspaceIdForRequest(request);
    const { from, to } = parseScheduleRange(request.nextUrl.searchParams);
    const blocks = await getWorkspaceSchedule({ workspaceId, from, to });
    return apiOk({
      from: from.toISOString(),
      to: to.toISOString(),
      count: blocks.length,
      blocks,
    });
  } catch (error) {
    return fromError(error);
  }
}
