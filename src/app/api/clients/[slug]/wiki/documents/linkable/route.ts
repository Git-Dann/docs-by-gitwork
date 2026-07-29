/**
 * GET /api/clients/[slug]/wiki/documents/linkable
 *
 * The Foundry documents that can be added to this client's wiki: the client's own
 * docs plus any doc not yet assigned to a client (the sibling `from-doc` POST
 * accepts exactly that set and assigns on add). Fetched lazily when the picker
 * opens, so it costs nothing on a normal client-detail view.
 *
 * Mirrors the sibling wiki-documents routes' shape: workspace-resolved client by
 * slug, and the Portal is already behind auth.
 */

import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { listLinkableDocuments } from "@/server/wiki-documents";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    return apiOk({ documents: await listLinkableDocuments(client.id) });
  } catch (err) {
    return fromError(err);
  }
}
