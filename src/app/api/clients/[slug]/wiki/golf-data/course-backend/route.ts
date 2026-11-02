import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getCourseBackendData } from "@/server/bigwedge-course-api";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const maxDuration = 30;

/** GET the Big Wedge course-backend live data (read-only) for the console. */
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

    const data = await getCourseBackendData(client.id, req.nextUrl.searchParams.get("refresh") === "1");
    return apiOk(data);
  } catch (err) {
    return fromError(err);
  }
}
