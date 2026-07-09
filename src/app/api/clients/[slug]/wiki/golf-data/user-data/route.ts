import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getUserData } from "@/server/bigwedge-user-data";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const maxDuration = 30;

/** GET Big Wedge user analytics (read-only) for the console's User data view. */
export async function GET(
  req: NextRequest,
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

    const data = await getUserData(client.id, req.nextUrl.searchParams.get("refresh") === "1");
    return apiOk(data);
  } catch (err) {
    return fromError(err);
  }
}
