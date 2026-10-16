import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resolveWikiIdByPublicToken } from "@/server/wiki";
import { listMentionables, mentionSlackStatus } from "@/server/wiki-intake-mentions";

/**
 * Who can be @mentioned from the client's view of their wiki: the client's own
 * people plus the Gitwork people actually involved with them — never the whole
 * staff list, and never an email. Same token resolution as the reply route, so
 * the list is reachable exactly where replying is.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const wikiId = await resolveWikiIdByPublicToken(token);
    if (!wikiId) return apiError("Invalid wiki token", 404);
    const wiki = await prisma.clientWiki.findUnique({ where: { id: wikiId }, select: { intakeEnabled: true } });
    if (!wiki?.intakeEnabled) return apiError("Invalid wiki token", 404);
    const [people, slack] = await Promise.all([listMentionables(wikiId, "public"), mentionSlackStatus(wikiId)]);
    return apiOk({ people, slack });
  } catch (err) {
    return fromError(err);
  }
}
