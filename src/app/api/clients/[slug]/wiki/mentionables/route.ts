import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { wikiIdForClientSlug } from "@/server/wiki";
import { listMentionables, mentionSlackStatus } from "@/server/wiki-intake-mentions";

/** Who a Gitwork user can @mention on this client's requests: the active team
 *  plus the client's own people. Names only — no emails. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAuthedUser(req);
    const { slug } = await params;
    const wikiId = await wikiIdForClientSlug(slug);
    if (!wikiId) return apiError("Wiki not found", 404);
    const [people, slack] = await Promise.all([listMentionables(wikiId, "internal"), mentionSlackStatus(wikiId)]);
    return apiOk({ people, slack });
  } catch (err) {
    return fromError(err);
  }
}
