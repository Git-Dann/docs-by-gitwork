import { NextRequest } from "next/server";
import { assertClientReader } from "@/server/client-write-access";
import { apiError, fromError } from "@/lib/api-response";
import { getDocumentFileByClient } from "@/server/wiki-documents";
import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const maxDuration = 60;

// Internal download of an uploaded wiki document (editor side).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    await assertClientReader(req, slug);
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const file = await getDocumentFileByClient(client.id, id);
    if (!file) return apiError("File not found", 404);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return fromError(err);
  }
}
