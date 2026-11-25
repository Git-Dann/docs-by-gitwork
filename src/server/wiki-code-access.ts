/**
 * Code Handover on the client's share page: who may read the code's files (the wiki sends only a
 * light copy without contents, CLAUDE.md §155). The same as the page itself: the link is the whole
 * wiki or the Code Handover one, the section is on, and the caller is a signed-in client user of
 * this wiki or this client's own team.
 */
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { teamWriterFor, wikiForToken } from "@/server/wiki-board-access";

export type CodeAccess = { ok: true; clientId: string } | { ok: false; status: number; message: string };

export async function resolveCodeAccess(req: NextRequest, token: string): Promise<CodeAccess> {
  const found = await wikiForToken(token);
  if (!found) return { ok: false, status: 404, message: "Not found" };
  const { wiki, onlySection } = found;
  if (onlySection && onlySection !== "code-handover") {
    return { ok: false, status: 403, message: "This link doesn't give access to the code." };
  }
  const on = await prisma.clientWiki.findUnique({ where: { id: wiki.id }, select: { codeHandoverEnabled: true } });
  if (!on?.codeHandoverEnabled) return { ok: false, status: 404, message: "Not found" };
  const ok = { ok: true as const, clientId: wiki.clientId };
  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  if (await resolveWikiAccessUser(wiki.id, cookieValue)) return ok;
  const staff = await auth();
  if (staff?.user?.id && (await teamWriterFor(staff.user.id, wiki.client.workspaceId, wiki.clientId))) return ok;
  return { ok: false, status: 401, message: "Please sign in to your portal to see the code." };
}

/** A reader opening the section, not a script pulling it repeatedly. */
export async function assertCodeReadRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `wiki-code:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 120,
    windowMs: 60_000,
    message: "Too many requests — please wait a moment and try again.",
  });
}
