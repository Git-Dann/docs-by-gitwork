/**
 * Who may change a client's Board through their wiki link, and under whose name.
 *
 * The same HARDENED posture as Sheets (src/server/wiki-sheets-access.ts, CLAUDE.md §73):
 *   token → the Board section must be ON → a per-section link must be FOR the Board → a client
 *   user signed in to this wiki (cookie) OR a Gitwork session → per-IP rate limit.
 * Every task the request names is then checked against THIS wiki's client in
 * src/server/wiki-board.ts (`loadOwnTask`), so a card id from another client is a 404.
 *
 * The token is looked up directly rather than through `resolvePublicWiki`, which builds the whole
 * wiki (including this board) for every call. A drag writes on every move; it must not.
 * Precedence is the same: a whole-wiki link first, then a per-section link.
 *
 * Attribution comes from the sign-in, never the request body.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import type { BoardWriter } from "@/server/wiki-board";

export type BoardAccessFailure = "not_found" | "unauthorized" | "section_disabled" | "wrong_section";

const WIKI_SELECT = {
  id: true,
  clientId: true,
  boardEnabled: true,
  pageShares: true,
  client: { select: { slug: true } },
} as const satisfies Prisma.ClientWikiSelect;

/** The wiki a link opens, and the one section it is limited to (null = the whole wiki). */
async function wikiForToken(token: string) {
  const whole = await prisma.clientWiki.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: WIKI_SELECT,
  });
  if (whole) return { wiki: whole, onlySection: null as string | null };
  const bySection = await prisma.clientWiki.findFirst({
    where: { pageShareTokens: { has: token } },
    select: WIKI_SELECT,
  });
  if (!bySection) return null;
  const map =
    bySection.pageShares && typeof bySection.pageShares === "object"
      ? (bySection.pageShares as Record<string, string>)
      : {};
  const section = Object.keys(map).find((k) => map[k] === token) ?? null;
  if (!section) return null;
  return { wiki: bySection, onlySection: section };
}

export async function resolveBoardWriter(
  req: NextRequest,
  token: string,
): Promise<{ ok: true; writer: BoardWriter } | { ok: false; reason: BoardAccessFailure }> {
  const found = await wikiForToken(token);
  if (!found) return { ok: false, reason: "not_found" };
  const { wiki, onlySection } = found;
  if (onlySection && onlySection !== "board") return { ok: false, reason: "wrong_section" };
  if (!wiki.boardEnabled) return { ok: false, reason: "section_disabled" };

  const base = { wikiId: wiki.id, clientId: wiki.clientId, clientSlug: wiki.client.slug };
  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  const clientUser = await resolveWikiAccessUser(wiki.id, cookieValue);
  if (clientUser) {
    return { ok: true, writer: { ...base, name: clientUser.displayName, wikiUserId: clientUser.id, userId: null } };
  }
  // Gitwork staff on the client's page act as the team: they can comment, not sign off.
  const staff = await auth();
  if (staff?.user?.id) {
    const name = staff.user.name?.trim() || staff.user.email || "Gitwork";
    return { ok: true, writer: { ...base, name, wikiUserId: null, userId: staff.user.id } };
  }
  return { ok: false, reason: "unauthorized" };
}

/** Generous for someone tidying their board (a write per drag), a wall for a script. */
export async function assertBoardWriteRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `board:write:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 240,
    windowMs: 60_000,
    message: "Too many changes at once — please wait a moment and try again.",
  });
}

export function boardAccessError(reason: BoardAccessFailure): { message: string; status: number } {
  switch (reason) {
    case "unauthorized":
      return { message: "Please sign in to your portal to make changes.", status: 401 };
    case "section_disabled":
      return {
        message: "The Board is switched off for this client, so it can't accept changes. Nothing is wrong with your link.",
        status: 409,
      };
    case "wrong_section":
      return { message: "This link doesn't give access to the Board.", status: 403 };
    default:
      return { message: "Not found", status: 404 };
  }
}
