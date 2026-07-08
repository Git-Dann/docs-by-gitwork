import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getCourseIntegrations } from "@/server/bigwedge-course-api";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const maxDuration = 30;

/** GET the connectors/integrations status (read-only) for the console. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const data = await getCourseIntegrations(client.id);
    return apiOk(data);
  } catch (err) {
    return fromError(err);
  }
}
