import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { checkMonitorNow } from "@/server/wiki-monitors";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const maxDuration = 60;

// Manual "Check now" — probe a single monitor immediately and return fresh stats.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const updated = await checkMonitorNow(client.id, id);
    if (!updated) return apiError("Monitor not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}
