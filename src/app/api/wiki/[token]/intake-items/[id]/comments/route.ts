import { NextRequest, after } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addWikiIntakeCommentByToken, resolveWikiIdByPublicToken } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { auth } from "@/auth";
import { resolveRequestedBy } from "@/server/wiki-intake-attribution";
import { notifyIntakeMentions, resolveMentions } from "@/server/wiki-intake-mentions";
import { emailRaiserOnTeamReply, notifyTeamMentionsOnRequest } from "@/server/wiki-intake-reply-notify";
import { readReplyInput } from "@/server/wiki-reply-image-upload";

/**
 * Post a reply from the shared wiki. JSON `{ body, mentionIds }`, or multipart with a
 * `file` screenshot (then `body` may be empty). Mention ids are re-checked against this
 * wiki's PUBLIC directory, so a client can only page the people they can see.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const input = await readReplyInput(req);
    if (!input.ok) return input.response;
    const { body, mentionIds, image } = input;

    // Same identity resolution as the sibling intake-items route — no typed
    // name field, since every route into the public wiki is authenticated as
    // either a signed-in client wiki user or a Gitwork user previewing it.
    const wikiId = await resolveWikiIdByPublicToken(token);
    const clientUser = wikiId
      ? await resolveWikiAccessUser(wikiId, req.cookies.get(wikiAccessCookieName(wikiId))?.value)
      : null;
    const staff = clientUser ? null : await auth();

    const authorName =
      resolveRequestedBy({
        clientUserName: clientUser?.displayName,
        staffName: staff?.user?.name ?? staff?.user?.email,
      }) ?? "Client wiki";
    const authorKind: "TEAM" | "CLIENT" = staff && !clientUser ? "TEAM" : "CLIENT";
    const staffUserId = authorKind === "TEAM" ? (staff?.user?.id ?? null) : null;

    // A Gitwork user previewing the page picks from the same public list the client
    // sees — what can be mentioned here never depends on who is looking.
    const mentions = wikiId ? await resolveMentions(wikiId, "public", mentionIds ?? []) : [];
    const comment = await addWikiIntakeCommentByToken(token, id, {
      authorKind,
      authorName,
      body,
      mentions,
      // Stamped so the author can edit or delete their own reply later.
      authorWikiUserId: clientUser?.id ?? null,
      authorUserId: staffUserId,
      image,
    });
    if (!comment) return apiError("Invalid wiki token or request", 404);
    if (wikiId) {
      after(async () => {
        await Promise.allSettled([
          mentions.length > 0
            ? notifyIntakeMentions({ wikiId, itemId: id, author: authorName, body: comment.body, mentions })
            : Promise.resolve(),
          notifyTeamMentionsOnRequest({
            wikiId,
            itemId: id,
            authorUserId: staffUserId,
            authorName,
            body: comment.body,
            mentions,
          }),
          // Only a Gitwork reply emails the client. A client replying on their own
          // request has nobody to tell by email — they wrote it.
          authorKind === "TEAM"
            ? emailRaiserOnTeamReply({ wikiId, itemId: id, authorName, body: comment.body })
            : Promise.resolve(),
        ]);
      });
    }
    return apiOk(comment, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
