/**
 * GET /api/admin/ai-cost → real billed AI spend (today + month-to-date) from the provider
 * Cost APIs, for the Super-Admin AI Spend card. Super Admins only. Cached ~1h server-side.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getAiCostSummary } from "@/server/ai-cost";
import { getRequestUser } from "@/server/auth/request-user";
import { isSuperAdmin } from "@/types/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Authorise via either the NextAuth web session (the Super-Admin "AI spend" card) or a
    // per-user Foundry mobile JWT (the Mac / iOS apps). Middleware verifies the JWT and forwards
    // the x-foundry-user-* headers that getRequestUser reads, so this role claim is already
    // server-verified. Super Admins only, either way.
    const mobileUser = getRequestUser(request);
    const role = mobileUser?.role ?? (await auth())?.user?.role;
    if (!role || !isSuperAdmin(role)) return apiError("Forbidden", 403);

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
