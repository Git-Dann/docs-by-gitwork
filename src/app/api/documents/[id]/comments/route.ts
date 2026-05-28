/**
 * Workspace-side comment endpoints.
 *
 *   GET   /api/documents/[id]/comments         — full list with replies
 *   POST  /api/documents/[id]/comments         — workspace operator leaves a comment / reply
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createWorkspaceComment, listCommentsForDocument } from "@/server/document-comments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createSchema = z.object({
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  body: z.string().min(1).max(4000),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const comments = await listCommentsForDocument(id);
    return apiOk({ comments });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureBaseRecords();
    const body = createSchema.parse(await request.json());

    const comment = await createWorkspaceComment({
      documentId: id,
      sectionId: body.sectionId ?? null,
      parentId: body.parentId ?? null,
      authorUserId: user.id,
      authorName: user.name ?? user.email,
      body: body.body,
    });

    return apiOk({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
