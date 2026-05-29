/**
 * Public comment endpoints for a shared document.
 *
 *   GET  /api/docs/[token]/comments — list public comments on this doc
 *   POST /api/docs/[token]/comments — leave a public comment (requires name + email)
 *
 * Token in the URL is the auth; we resolve the document by shareToken + isShared.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createPublicComment, listPublicCommentsForDocument } from "@/server/document-comments";
import { notifyDocumentEvent } from "@/server/slack-notify";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const createSchema = z.object({
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  authorName: z.string().min(1).max(120),
  authorEmail: z.string().email().max(200),
  body: z.string().min(1).max(4000),
});

async function resolveSharedDocId(token: string): Promise<string | null> {
  if (!token || token.length < 16) return null;
  const doc = await prisma.document.findFirst({
    where: { shareToken: token, isShared: true, archivedAt: null },
    select: { id: true },
  });
  return doc?.id ?? null;
}

async function resolveSharedDocForNotification(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.document.findFirst({
    where: { shareToken: token, isShared: true, archivedAt: null },
    select: { id: true, workspaceId: true, title: true, documentType: true },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const documentId = await resolveSharedDocId(token);
    if (!documentId) return apiError("Document not found", 404);

    const comments = await listPublicCommentsForDocument(documentId);
    return apiOk({ comments });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const doc = await resolveSharedDocForNotification(token);
    if (!doc) return apiError("Document not found", 404);

    const body = createSchema.parse(await request.json());
    const comment = await createPublicComment({
      documentId: doc.id,
      sectionId: body.sectionId ?? null,
      parentId: body.parentId ?? null,
      authorName: body.authorName,
      authorEmail: body.authorEmail,
      body: body.body,
    });

    void notifyDocumentEvent({
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentType: doc.documentType,
      kind: "COMMENT_ADDED",
      detail: `${body.authorName}: ${body.body.slice(0, 140)}${body.body.length > 140 ? "…" : ""}`,
    });

    return apiOk({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
