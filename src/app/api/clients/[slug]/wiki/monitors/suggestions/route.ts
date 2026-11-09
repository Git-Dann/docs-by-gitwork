import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { loadMonitorSuggestions } from "@/server/wiki-monitors";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

/**
 * GET — the client's Platform URLs that no monitor watches yet, offered as one-click monitors.
 * Same access as the rest of /wiki/monitors (internal — gated by middleware like its siblings).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    return apiOk({ suggestions: await loadMonitorSuggestions(client.id) });
  } catch (err) {
    return fromError(err);
  }
}
