import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { avatarResponse } from "@/server/avatar-response";
import { verifyWikiAccessCookie, wikiAccessCookieName } from "@/server/wiki-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/wiki/[token]/avatars/[userId] — a team member's photo, for the client's
 * view of their wiki (see `src/lib/wiki-team-avatar.ts`).
 *
 * Three gates, each answering 404 so the route can't be used to probe who exists:
 *  1. the token is a live SHARE token (whole wiki or one section) — never the
 *     intake/ingest credential;
 *  2. the viewer can open that wiki: a signed-in Foundry user, or a valid access cookie,
 *     exactly as `GET /api/wiki/[token]` checks;
 *  3. the user is on that wiki's team — its product team, or a developer currently
 *     placed on the client whose card uses this photo.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; userId: string }> },
) {
  const notFound = () => new Response("Not found", { status: 404 });
  try {
    const { token, userId } = await params;
    const t = token?.trim();
    if (!t || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return notFound();

    const wiki = await prisma.clientWiki.findFirst({
      where: { OR: [{ shareToken: t, shareEnabled: true }, { pageShareTokens: { has: t } }] },
      select: { id: true, clientId: true },
    });
    if (!wiki) return notFound();

    const session = await auth();
    if (!session?.user?.id) {
      const unlocked = await verifyWikiAccessCookie(
        wiki.id,
        req.cookies.get(wikiAccessCookieName(wiki.id))?.value,
      );
      if (!unlocked) return new Response("Login required", { status: 401 });
    }

    const [client, placed] = await Promise.all([
      prisma.workspaceClient.findUnique({
        where: { id: wiki.clientId },
        select: { productTeamUserIds: true },
      }),
      prisma.placement.count({
        where: {
          clientId: wiki.clientId,
          endDate: null,
          candidate: { avatarUrl: `/api/avatars/${userId}` },
        },
      }),
    ]);
    const onTeam = (client?.productTeamUserIds ?? []).includes(userId) || placed > 0;
    if (!onTeam) return notFound();

    return avatarResponse(userId, req);
  } catch {
    return notFound();
  }
}
