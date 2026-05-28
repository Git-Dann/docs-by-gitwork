/**
 * PATCH /api/documents/[id]/comments/[commentId]
 *
 * Workspace-only. Body: { resolved: boolean }. Flips status between OPEN and RESOLVED.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { reopenComment, resolveComment } from "@/server/document-comments";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

const patchSchema = z.object({
  resolved: z.boolean(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { commentId } = await context.params;
    const { user } = await ensureBaseRecords();
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
