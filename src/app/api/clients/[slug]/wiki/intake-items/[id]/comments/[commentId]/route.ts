import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteWikiIntakeComment, editWikiIntakeComment, wikiIdForClientSlug } from "@/server/wiki";
import { resolveMentions } from "@/server/wiki-intake-mentions";
import { internalCommentViewer } from "@/server/wiki-comment-viewer";
import { MAX_MENTIONS_PER_COMMENT } from "@/lib/wiki-mentions";

type Params = { params: Promise<{ slug: string; id: string; commentId: string }> };

const patchSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  mentionIds: z.array(z.string().max(80)).max(MAX_MENTIONS_PER_COMMENT * 2).optional(),
});

/**
 * Edit your own reply. Only the author (matched on their Foundry user id) — an admin
 * may delete anyone's reply but never rewrite it (src/lib/wiki-comment-permissions.ts).
 *
 * Editing re-records who is mentioned but sends nothing: re-pinging everyone on every
 * typo fix would teach people to ignore the notification.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id, commentId } = await params;
    const { body, mentionIds } = patchSchema.parse(await req.json());
    const wikiId = await wikiIdForClientSlug(slug);
    if (!wikiId) return apiError("Wiki not found", 404);
    const mentions = await resolveMentions(wikiId, "internal", mentionIds ?? []);
    const comment = await editWikiIntakeComment({ slug }, id, commentId, internalCommentViewer(user), body, mentions);
    if (!comment) return apiError("Reply not found", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}

/** Delete a reply — its author, or an admin. Soft: the thread shows "Reply deleted". */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id, commentId } = await params;
    const comment = await deleteWikiIntakeComment({ slug }, id, commentId, internalCommentViewer(user));
    if (!comment) return apiError("Reply not found", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}
