/**
 * POST/DELETE /api/clients/[slug]/wiki/documents/from-doc
 *
 * The Portal "Add to wiki" / "Remove from wiki" action on a client's Foundry document. POST adds
 * (shares the doc if needed + mirrors it into the client's wiki Documents section); DELETE removes
 * the mirrored entry. Body: `{ documentId }`. Follows the sibling wiki-documents routes' shape
 * (workspace-resolved client by slug; the Portal is already behind auth).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addDocumentToWiki, removeDocumentFromWiki } from "@/server/wiki-documents";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";

export const maxDuration = 60;

const bodySchema = z.object({ documentId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const { documentId } = bodySchema.parse(await req.json());
    const doc = await addDocumentToWiki(clientId, documentId);
    if (!doc) return apiError("Document not found for this client", 404);
    return apiOk(doc);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const { documentId } = bodySchema.parse(await req.json());
    const removed = await removeDocumentFromWiki(clientId, documentId);
    return apiOk({ removed });
  } catch (err) {
    return fromError(err);
  }
}
