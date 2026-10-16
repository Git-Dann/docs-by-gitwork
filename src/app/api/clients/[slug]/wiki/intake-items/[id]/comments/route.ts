import { NextRequest, after } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addWikiIntakeComment, wikiIdForClientSlug } from "@/server/wiki";
import { notifyIntakeMentions, resolveMentions } from "@/server/wiki-intake-mentions";
import { MAX_MENTIONS_PER_COMMENT } from "@/lib/wiki-mentions";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  /** Ids from the mention picker. Re-checked against this wiki's directory. */
  mentionIds: z.array(z.string().max(80)).max(MAX_MENTIONS_PER_COMMENT * 2).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id } = await params;
    const { body, mentionIds } = bodySchema.parse(await req.json());

    const wikiId = await wikiIdForClientSlug(slug);
    if (!wikiId) return apiError("Wiki not found", 404);
    const mentions = await resolveMentions(wikiId, "internal", mentionIds ?? []);
    const author = user.name ?? user.email;

    const comment = await addWikiIntakeComment(slug, id, { userId: user.id, name: author }, body, mentions);
    if (!comment) return apiError("Request not found", 404);

    if (mentions.length > 0) {
      after(() => notifyIntakeMentions({ wikiId, itemId: id, author, body: comment.body, mentions }));
    }
    const { wikiId: _omit, ...record } = comment;
    void _omit;
    return apiOk(record, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
