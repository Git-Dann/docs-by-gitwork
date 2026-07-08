import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getGolfDataConsole } from "@/server/golf-data-console";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const maxDuration = 30;

/** GET the Gitwork Golf Data platform console snapshot for a client (Wedge). */
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

    const console = await getGolfDataConsole(client.id, workspace.id);
    return apiOk(console);
  } catch (err) {
    return fromError(err);
  }
}
