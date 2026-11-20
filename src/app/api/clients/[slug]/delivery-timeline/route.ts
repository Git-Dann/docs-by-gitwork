import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { loadDeliveryTimeline, TIMELINE_WEEKS_MAX } from "@/server/client-delivery-timeline";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/** GET /api/clients/{slug}/delivery-timeline?weeks=8: what happened on the client's work, week by week. Internal only. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await requireAuthedUser(request);
    await assertClientAccessBySlug(user, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const raw = Number(request.nextUrl.searchParams.get("weeks") ?? "8");
    if (!Number.isFinite(raw) || raw < 1 || raw > TIMELINE_WEEKS_MAX) return apiError(`weeks must be 1 to ${TIMELINE_WEEKS_MAX}`, 400);
    const timeline = await loadDeliveryTimeline(user.workspaceId, clientId, { weeks: Math.round(raw) });
    if (!timeline) return apiError("Client not found", 404);
    return apiOk(timeline);
  } catch (error) {
    return fromError(error);
  }
}
