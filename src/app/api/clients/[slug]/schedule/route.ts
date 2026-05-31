import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getClientSchedule, parseScheduleRange } from "@/server/schedule";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/clients/[slug]/schedule?from=ISO&to=ISO
 *
 * Per-client schedule. Returns every Placement against this client that
 * overlaps the range — i.e. the dev roster for the client over the window.
 * Mirrors /api/codeclear/schedule but scoped to one client.
 *
 * Defaults: from = today, to = today + 30 days.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: workspace.id },
      select: { id: true, name: true, slug: true },
    });
    if (!client) return apiError("Client not found.", 404);

    const { from, to } = parseScheduleRange(request.nextUrl.searchParams);
    const blocks = await getClientSchedule({
      workspaceId: workspace.id,
      clientId: client.id,
      from,
      to,
    });

    return apiOk({
      client,
      from: from.toISOString(),
      to: to.toISOString(),
      count: blocks.length,
      blocks,
    });
  } catch (error) {
    return fromError(error);
  }
}
