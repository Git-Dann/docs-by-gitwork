/**
 * POST   /api/documents/[id]/signature-requests/[requestId]/send
 *        → flip DRAFT → SENT, mint a document snapshot, return signing URLs.
 *
 * DELETE /api/documents/[id]/signature-requests/[requestId]/send
 *        → revoke the SENT request (REVOKED). Token URLs immediately 410 after this.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { revokeSignatureRequest, sendSignatureRequest } from "@/server/signatures";

interface RouteContext {
  params: Promise<{ id: string; requestId: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id, requestId } = await context.params;

    // Freeze a snapshot of the document at send-time so subsequent edits don't change what
    // the signers see. We use the existing proposal serializer because the public signing page
    // will render the same DocumentCover + section preview pipeline as /docs/[token].
    const document = await prisma.document.findUnique({
      where: { id },
      include: proposalInclude,
    });
    if (!document) return apiError("Document not found", 404);

    const snapshot = serializeProposal(document);

    const sent = await sendSignatureRequest(requestId, snapshot);
    return apiOk({
      request: sent,
      signers: sent.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        accessToken: s.accessToken,
        // The full URL is built client-side using window.location.origin.
        url: `/sign/${s.accessToken}`,
        status: s.status,
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    const revoked = await revokeSignatureRequest(requestId);
    return apiOk({ request: revoked });
  } catch (error) {
    return fromError(error);
  }
}
