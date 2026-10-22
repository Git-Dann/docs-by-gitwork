import { NextRequest, after } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addWikiIntakeComment, wikiIdForClientSlug } from "@/server/wiki";
import { notifyIntakeMentions, resolveMentions } from "@/server/wiki-intake-mentions";
import { emailRaiserOnTeamReply, notifyTeamMentionsOnRequest } from "@/server/wiki-intake-reply-notify";
import { notifyClientMentionsOnRequest } from "@/server/push/client-notifications";
import { readReplyInput } from "@/server/wiki-reply-image-upload";
import { isAtLeast } from "@/types/auth";

/**
 * Post a reply. JSON `{ body, mentionIds }`, or multipart with a `file` screenshot —
 * in which case `body` may be empty (a screenshot-only reply). Neither → 400.
 * Mention ids are re-checked against this wiki's directory.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id } = await params;
    const input = await readReplyInput(req);
    if (!input.ok) return input.response;
    const { body, mentionIds, image } = input;

    const wikiId = await wikiIdForClientSlug(slug);
    if (!wikiId) return apiError("Wiki not found", 404);
    const mentions = await resolveMentions(wikiId, "internal", mentionIds ?? []);
    const author = user.name ?? user.email;

    const comment = await addWikiIntakeComment(
      slug,
      id,
      { userId: user.id, name: author, isAdmin: isAtLeast(user.role, "ADMIN") },
      body,
      mentions,
      image,
    );
    if (!comment) return apiError("Request not found", 404);

    // All four are fire-and-forget: a Slack, notification, push or email failure is
    // logged by its own helper and never turns a saved reply into a failed one.
    after(async () => {
      await Promise.allSettled([
        mentions.length > 0
          ? notifyIntakeMentions({ wikiId, itemId: id, author, body: comment.body, mentions })
          : Promise.resolve(),
        notifyTeamMentionsOnRequest({
          wikiId,
          itemId: id,
          authorUserId: user.id,
          authorName: author,
          body: comment.body,
          mentions,
        }),
        // ⚠️ The CLIENT half of a mention. This is the main case: a Gitwork
        // person @mentions someone at the client, and until now the only way
        // that person learned of it was by opening the wiki and reading. The
        // author is a Gitwork user, so no client user can be the author here.
        notifyClientMentionsOnRequest({
          wikiId,
          itemId: id,
          authorName: author,
          authorClientUserId: null,
          body: comment.body,
          mentions,
        }),
        // A Gitwork reply — tell the person who raised the request.
        emailRaiserOnTeamReply({ wikiId, itemId: id, authorName: author, body: comment.body }),
      ]);
    });
    const { wikiId: _omit, ...record } = comment;
    void _omit;
    return apiOk(record, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
