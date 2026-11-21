/**
 * GET /api/admin/ai-cost → real billed AI spend (today + month-to-date) from the provider
 * Cost APIs, for the Super-Admin AI Spend card. Super Admins only. Cached ~1h server-side.
 */

import type { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";
import { getAiCostSummary } from "@/server/ai-cost";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Authorise via either the NextAuth web session (the Super-Admin "AI spend" card) or a
    // per-user Foundry mobile JWT (the Mac / iOS apps). Middleware verifies the JWT and forwards
    // the x-foundry-user-* headers that getRequestUser reads, so this role claim is already
    // server-verified. Super Admins only, either way.
    // ⚠️ The role is read from the DATABASE, not from the token. `session.user.role` and the
    // mobile JWT's role claim both carry the role the token was MINTED with, so a demoted or
    // archived caller keeps the route until their token turns over. §88 made a database read
    // the rule; these were missed.
    assertSuperAdmin(await requireAuthedUser(request));

    const ws = await prisma.workspace.findUnique({
      where: { id: await workspaceIdForRequest(request) },
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
