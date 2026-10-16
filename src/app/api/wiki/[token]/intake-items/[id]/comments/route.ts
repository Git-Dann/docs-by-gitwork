import { NextRequest, after } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addWikiIntakeCommentByToken, resolveWikiIdByPublicToken } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { auth } from "@/auth";
import { resolveRequestedBy } from "@/server/wiki-intake-attribution";
import { notifyIntakeMentions, resolveMentions } from "@/server/wiki-intake-mentions";
import { MAX_MENTIONS_PER_COMMENT } from "@/lib/wiki-mentions";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  /** Ids from the mention picker. Re-checked against this wiki's PUBLIC directory,
   *  so a client can only page the people they can see in the picker. */
  mentionIds: z.array(z.string().max(80)).max(MAX_MENTIONS_PER_COMMENT * 2).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const { body, mentionIds } = bodySchema.parse(await req.json());

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

    // A Gitwork user previewing the page picks from the same public list the client
    // sees — what can be mentioned here never depends on who is looking.
    const mentions = wikiId ? await resolveMentions(wikiId, "public", mentionIds ?? []) : [];
    const comment = await addWikiIntakeCommentByToken(token, id, { authorKind, authorName, body, mentions });
    if (!comment) return apiError("Invalid wiki token or request", 404);
    if (wikiId && mentions.length > 0) {
      after(() =>
        notifyIntakeMentions({ wikiId, itemId: id, author: authorName, body: comment.body, mentions }),
      );
    }
    return apiOk(comment, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
