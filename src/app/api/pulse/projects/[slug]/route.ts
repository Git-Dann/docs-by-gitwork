import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { getProjectScans } from "@/server/pulse";
import { decodeTargetKey } from "@/lib/pulse-projects";

export const dynamic = "force-dynamic";

/** GET /api/pulse/projects/[slug] — one project and every scan of it. 404 when not visible to the caller. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const key = decodeTargetKey((await params).slug);
    if (!key) return apiError("Project not found", 404);
    const user = await getEffectiveUserOrNull(request);
    const clientIds = user && !canSeeAllClients(user) ? await assignedClientIds(user) : null;
    const result = await getProjectScans(key, { clientIds, triggeredByUserId: clientIds ? (user?.id ?? null) : null });
    if (!result) return apiError("Project not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
