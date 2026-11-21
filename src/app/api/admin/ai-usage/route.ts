/**
 * GET /api/admin/ai-usage → per-call AI usage analytics (tokens, estimated cost, latency, errors)
 * broken down by module / model / user over time, for the Super-Admin Analytics → AI usage scope.
 * Super Admins only. Reconciled against the authoritative provider-billed total (ai-cost.ts).
 *
 * Query params: from, to (ISO), days (shortcut), bucket ("day"|"week"), module (AiModule).
 */

import type { NextRequest } from "next/server";
import { AiModule } from "@prisma/client";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";
import { getAiUsageAnalytics } from "@/server/ai-usage";
import { getAiCostSummary } from "@/server/ai-cost";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
    const moduleParam = sp.get("module");
    const moduleFilter = moduleParam && moduleParam in AiModule ? (moduleParam as AiModule) : undefined;

    const analytics = await getAiUsageAnalytics(ws.id, { from, to, module: moduleFilter, bucket });

    // Reconcile against the authoritative billed total (best-effort; never blocks the response).
    try {
      const cost = await getAiCostSummary(ws);
      if (cost.configured) {
        analytics.reconciliation.providerBilledUsd = Math.round(
          cost.providers.reduce((a, p) => a + (p.monthToDate ?? 0), 0) * 100,
        ) / 100;
      }
    } catch {
      // leave providerBilledUsd null on any cost-API failure
    }

    return apiOk({ analytics });
  } catch (e) {
    return fromError(e);
  }
}
