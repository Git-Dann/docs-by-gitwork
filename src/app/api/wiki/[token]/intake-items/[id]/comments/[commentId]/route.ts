import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteWikiIntakeComment, editWikiIntakeComment, resolveWikiIdByPublicToken } from "@/server/wiki";
import { wikiAccessCookieName } from "@/server/wiki-access";
import { backfillCommentAuthors } from "@/server/wiki-intake-comment-backfill";
import { resolveMentions } from "@/server/wiki-intake-mentions";
import { publicCommentViewer } from "@/server/wiki-comment-viewer";
import { MAX_MENTIONS_PER_COMMENT } from "@/lib/wiki-mentions";

type Params = { params: Promise<{ token: string; id: string; commentId: string }> };

const patchSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  mentionIds: z.array(z.string().max(80)).max(MAX_MENTIONS_PER_COMMENT * 2).optional(),
});

async function viewerFor(req: NextRequest, token: string) {
  const wikiId = await resolveWikiIdByPublicToken(token);
  // Same lazy stamping as the page load, so a reply the page offered to edit can be.
  if (wikiId) await backfillCommentAuthors(wikiId);
  const viewer = await publicCommentViewer(
    wikiId,
    wikiId ? req.cookies.get(wikiAccessCookieName(wikiId))?.value : null,
  );
  return { wikiId, viewer };
}

/**
 * Edit your own reply from the shared wiki. A client may change only a reply stamped
 * with THEIR wiki user id when it was posted — never one matched by name, so two
 * people called "Sam" can't edit each other's words (src/lib/wiki-comment-permissions.ts).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { token, id, commentId } = await params;
    const { body, mentionIds } = patchSchema.parse(await req.json());
    const { wikiId, viewer } = await viewerFor(req, token);
    if (!wikiId) return apiError("Invalid wiki token or reply", 404);
    const mentions = await resolveMentions(wikiId, "public", mentionIds ?? []);
    const comment = await editWikiIntakeComment({ token }, id, commentId, viewer, body, mentions);
    if (!comment) return apiError("Invalid wiki token or reply", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { token, id, commentId } = await params;
    const { wikiId, viewer } = await viewerFor(req, token);
    if (!wikiId) return apiError("Invalid wiki token or reply", 404);
    const comment = await deleteWikiIntakeComment({ token }, id, commentId, viewer);
    if (!comment) return apiError("Invalid wiki token or reply", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}
