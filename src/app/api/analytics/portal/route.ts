/**
 * GET /api/analytics/portal
 *
 * Workspace-wide Portal delivery analytics (super-admin only): task throughput over time,
 * status / priority / label mix, a per-developer output leaderboard, and per-client activity.
 * Powers the /app/analytics dashboard.
 *
 * Query params:
 *   - from, to: ISO dates bounding the range (optional)
 *   - days:     shortcut for from = now − N days (optional; ignored if `from` is given)
 *   - bucket:   "day" | "week" time-series granularity (optional; auto by range otherwise)
 *
 * Gated to Super Admins — assertSuperAdmin throws a 403 that fromError renders. Nested under
 * /api/analytics so sibling scopes (devsignal, ai-usage) slot in alongside.
 */

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { getPortalAnalytics } from "@/server/analytics/portal-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertSuperAdmin(user);

    const sp = request.nextUrl.searchParams;

    let from: Date | undefined;
    let to: Date | undefined;
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const daysParam = sp.get("days");
    if (fromParam) {
      const d = new Date(fromParam);
      if (!Number.isNaN(d.getTime())) from = d;
    } else if (daysParam) {
      const days = Number(daysParam);
      if (Number.isFinite(days) && days > 0) from = new Date(Date.now() - days * 86_400_000);
    }
    if (toParam) {
      const d = new Date(toParam);
      if (!Number.isNaN(d.getTime())) to = d;
    }

    const bucketParam = sp.get("bucket");
    const bucket = bucketParam === "day" || bucketParam === "week" ? bucketParam : undefined;

    const analytics = await getPortalAnalytics(user.workspaceId, { from, to, bucket });
    return apiOk({ analytics });
  } catch (error) {
    return fromError(error);
  }
}
