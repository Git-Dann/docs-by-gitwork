import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { listGolfClubs } from "@/server/golf-clubs";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

/** GET the full clubs catalogue for the console's Clubs browser (internal). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const clubs = await listGolfClubs(workspaceId);
    return apiOk({ clubs, total: clubs.length });
  } catch (err) {
    return fromError(err);
  }
}
