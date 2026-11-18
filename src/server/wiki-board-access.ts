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
 *
 * ⚠️ A Foundry session is NOT enough to act as the team. These routes write to the team's real
 * task board, so a session only counts when the person is an ACTIVE, non-guest member of the
 * workspace that owns this client AND can open this client (`assertClientInScope`). A session
 * from another business, a guest, or a developer not on this client falls through to the
 * client-sign-in check like anyone else (`teamWriterFor`).
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { resolveEffectiveUserById } from "@/server/mcp/auth";
import { assertClientInScope } from "@/server/tasks";
import { BoardError, type BoardWriter } from "@/server/wiki-board";
import { assertCan, canManageClients, ForbiddenError, requireAuthedUser } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";
import { BOARD_LIMITS } from "@/lib/wiki-board";

export type BoardAccessFailure = "not_found" | "unauthorized" | "section_disabled" | "wrong_section";

const WIKI_SELECT = {
  id: true,
  clientId: true,
  boardEnabled: true,
  pageShares: true,
  client: { select: { slug: true, workspaceId: true } },
} as const satisfies Prisma.ClientWikiSelect;

/**
 * The signed-in Foundry user, if they may act as the team on this client's board: an active,
 * non-guest member of the client's own workspace who can open this client. Null otherwise.
 */
export async function teamWriterFor(
  userId: string,
  clientWorkspaceId: string,
  clientId: string,
): Promise<{ id: string; name: string } | null> {
  const user = await resolveEffectiveUserById(userId, clientWorkspaceId, { onlyThisWorkspace: true });
  if (!user || user.workspaceId !== clientWorkspaceId || user.role === "GUEST") return null;
  try {
    await assertClientInScope(user, clientId);
  } catch {
    return null;
  }
  return { id: user.id, name: user.name?.trim() || user.email || "Gitwork" };
}

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
  // This client's own team on the client's page act as the team: they can comment, not sign off.
  const staff = await auth();
  if (staff?.user?.id) {
    const team = await teamWriterFor(staff.user.id, wiki.client.workspaceId, wiki.clientId);
    if (team) return { ok: true, writer: { ...base, name: team.name, wikiUserId: null, userId: team.id } };
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

/**
 * The team on the INTERNAL wiki, adding, editing, deleting or restoring cards on a client's Board
 * (`/api/clients/[slug]/wiki/board/cards/**`). A signed-in member (never the API key alone): a
 * developer or above who can open this client may add and edit; deleting and restoring also need
 * 'Manage clients'. Every card the request names is then checked against this client.
 */
export async function resolveInternalBoardWriter(
  req: Request,
  slug: string,
  scope: "write" | "manage",
): Promise<BoardWriter> {
  const user = await requireAuthedUser(req);
  if (scope === "manage") assertCan(user, canManageClients, "delete or restore cards on the Board");
  else if (!isAtLeast(user.role, "DEVELOPER")) throw new ForbiddenError("You don't have permission to change the Board.");
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: user.workspaceId, slug } },
    select: { id: true, slug: true, wiki: { select: { id: true } } },
  });
  if (!client) throw new BoardError("Client not found", 404);
  await assertClientInScope(user, client.id);
  if (!client.wiki) throw new BoardError("This client has no wiki yet.", 409);
  return {
    wikiId: client.wiki.id,
    clientId: client.id,
    clientSlug: client.slug,
    name: user.name?.trim() || user.email || "Gitwork",
    wikiUserId: null,
    userId: user.id,
  };
}

/**
 * The screenshots in a multipart upload (`file` fields). Sizes are checked from the form before
 * any bytes are read into memory; the bytes themselves are checked in `addBoardCardImages`.
 */
export async function readBoardImageForm(req: Request): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new BoardError("Send the images as a form upload.", 400);
  }
  const files = form.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) throw new BoardError("Choose an image to add.", 400);
  if (files.length > BOARD_LIMITS.images) throw new BoardError(`Add up to ${BOARD_LIMITS.images} images at a time.`, 400);
  const tooBig = files.find((f) => f.size > BOARD_LIMITS.imageBytes);
  if (tooBig) throw new BoardError(`“${tooBig.name || "That image"}” is over 10 MB.`, 400);
  return Promise.all(files.map(async (f) => ({ name: f.name || "image", bytes: new Uint8Array(await f.arrayBuffer()) })));
}
