/**
 * PATCH /api/documents/[id]/comments/[commentId]
 *
 * Workspace-only. Body: { resolved: boolean }. Flips status between OPEN and RESOLVED.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requestActor } from "@/server/workspaces/scope";
import { reopenComment, resolveComment } from "@/server/document-comments";
import { requireDocumentInWorkspace, requireRowOfDocument } from "@/server/documents-scope";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

const patchSchema = z.object({
  resolved: z.boolean(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id, commentId } = await context.params;
    await requireDocumentInWorkspace(id, await getEffectiveUserOrNull(request));
    await requireRowOfDocument("comment", commentId, id);
    const { user } = await requestActor(request);
    const body = patchSchema.parse(await request.json());

    const updated = body.resolved
      ? await resolveComment(commentId, user.id)
      : await reopenComment(commentId);

    return apiOk({ comment: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
