/**
 * GET /api/admin/ai-cost → real billed AI spend (today + month-to-date) from the provider
 * Cost APIs, for the Super-Admin AI Spend card. Super Admins only. Cached ~1h server-side.
 */

import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getAiCostSummary } from "@/server/ai-cost";
import { isSuperAdmin } from "@/types/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || !isSuperAdmin(session.user.role)) return apiError("Forbidden", 403);

    const ws = await prisma.workspace.findUnique({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        id: true,
        anthropicAdminApiKey: true,
        openaiAdminApiKey: true,
        anthropicModel: true,
        openaiModel: true,
      },
    });
    if (!ws) return apiError("Workspace not found", 404);

    return apiOk(await getAiCostSummary(ws));
  } catch (e) {
    return fromError(e);
  }
}
