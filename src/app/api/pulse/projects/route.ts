import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { getPulseProjects } from "@/server/pulse";

export const dynamic = "force-dynamic";

/** GET /api/pulse/projects — one row per scanned target, most urgent first. Scoped like the scan list. */
export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const clientIds = user && !canSeeAllClients(user) ? await assignedClientIds(user) : null;
    const projects = await getPulseProjects({ clientIds, triggeredByUserId: clientIds ? (user?.id ?? null) : null });
    return apiOk({ projects });
  } catch (error) {
    return fromError(error);
  }
}
