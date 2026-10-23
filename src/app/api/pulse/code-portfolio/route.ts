import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { loadCodePortfolio } from "@/server/code-health/portfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/code-portfolio — every measured repository and the ranked work across them.
 * Scoped exactly like GET /api/pulse/scans: a restricted viewer sees their clients'
 * repositories and the ones they scanned themselves.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const clientIds = user && !canSeeAllClients(user) ? await assignedClientIds(user) : null;
    const portfolio = await loadCodePortfolio({ clientIds, triggeredByUserId: clientIds ? (user?.id ?? null) : null });
    return apiOk(portfolio);
  } catch (error) {
    return fromError(error);
  }
}
