/**
 * Document sharing endpoints.
 *
 *   POST   /api/documents/[id]/share   → enable sharing, mint or reuse token, return public URL
 *   DELETE /api/documents/[id]/share   → revoke sharing (token preserved for audit/re-share)
 *
 * Auth comes from the global `/api/` middleware (API_KEY bearer or browser session cookie).
 * Lives under `/api/documents/` (not `/api/proposals/`) because sharing is doc-type-agnostic and
 * will serve SLAs, SOWs, MSAs, etc. in subsequent sprints.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { disableDocumentShare, enableDocumentShare } from "@/server/documents";
import { notifyDocumentEvent } from "@/server/slack-notify";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) return apiError("Missing document id", 400);

    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, archivedAt: true, isShared: true, workspaceId: true, title: true, documentType: true },
    });

    if (!existing) return apiError("Document not found", 404);
    if (existing.archivedAt) return apiError("Cannot share an archived document", 409);

    const wasShared = existing.isShared;
    const { shareToken, url } = await enableDocumentShare(id);

    // Only fire DOC_SHARED the first time sharing is enabled — re-issuing a share URL when
    // it's already public would be noisy.
    if (!wasShared) {
      void notifyDocumentEvent({
        workspaceId: existing.workspaceId,
        documentId: existing.id,
        documentTitle: existing.title,
        documentType: existing.documentType,
        kind: "DOC_SHARED",
        url,
      });
    }

    return apiOk({ shareToken, url, isShared: true });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) return apiError("Missing document id", 400);

    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) return apiError("Document not found", 404);

    await disableDocumentShare(id);
    return apiOk({ isShared: false });
  } catch (error) {
    return fromError(error);
  }
}
