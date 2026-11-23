/**
 * GET: the Updates page for the client's share link (CLAUDE.md §147). Read-only; loaded on its own
 * rather than inside the wiki (§140). Same posture as the Board's reads
 * (src/server/wiki-board-access.ts): the link opens this wiki, the section is on, a per-section link
 * is for Updates, and the reader is a client user signed in to this wiki or this client's own team.
 * Then a per-IP read limit.
 */
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertBoardReadRate, teamWriterFor } from "@/server/wiki-board-access";
import { loadUpdatesView } from "@/server/wiki-updates";

export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  clientId: true,
  updatesEnabled: true,
  pageShares: true,
  client: { select: { workspaceId: true } },
} as const satisfies Prisma.ClientWikiSelect;

async function wikiFor(token: string) {
  const whole = await prisma.clientWiki.findFirst({ where: { shareToken: token, shareEnabled: true }, select: SELECT });
  if (whole) return whole;
  const bySection = await prisma.clientWiki.findFirst({ where: { pageShareTokens: { has: token } }, select: SELECT });
  if (!bySection) return null;
  const map = bySection.pageShares && typeof bySection.pageShares === "object" ? (bySection.pageShares as Record<string, string>) : {};
  return map.updates === token ? bySection : "wrong_section";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const wiki = await wikiFor(token);
    if (!wiki) return apiError("Not found", 404);
    if (wiki === "wrong_section") return apiError("This link doesn't give access to Updates.", 403);
    if (!wiki.updatesEnabled) return apiError("Updates is switched off for this client.", 409);

    const clientUser = await resolveWikiAccessUser(wiki.id, req.cookies.get(wikiAccessCookieName(wiki.id))?.value);
    if (!clientUser) {
      const staff = await auth();
      const team = staff?.user?.id ? await teamWriterFor(staff.user.id, wiki.client.workspaceId, wiki.clientId) : null;
      if (!team) return apiError("Please sign in to your portal to see this.", 401);
    }
    await assertBoardReadRate(req);
    const view = await loadUpdatesView(wiki.client.workspaceId, wiki.clientId, wiki.id);
    if (!view) return apiError("Not found", 404);
    return apiOk(view);
  } catch (err) {
    return fromError(err);
  }
}
