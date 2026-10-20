/**
 * Who may write to a client's Sheets through the public wiki link, and under whose name.
 *
 * The HARDENED posture Launchpad uses (CLAUDE.md §43): resolve the token → require the
 * wiki-access cookie (a client user logged into their wiki) or a Gitwork session → the sheet
 * must belong to that wiki (enforced by scoping every query through `wikiId`) → per-IP rate
 * limit. Reads stay token-only and ride in the wiki DTO.
 *
 * Two extra conditions Launchpad doesn't need:
 *   - The section must be ON. A sheet drafted with the section off is not the client's yet.
 *   - A per-section share link must be FOR Sheets. A link someone was given to the Changelog
 *     must not become a write credential for a different section.
 *
 * Attribution is resolved server-side and never taken from the body. The client user's id
 * is what "rows you added" is checked against; a name match is never enough (§70).
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolvePublicWiki } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import type { ClientWriter, SheetActor } from "@/server/wiki-sheets";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
  type EffectiveUser,
} from "@/server/auth/effective-user";

export type SheetsAccessFailure = "not_found" | "unauthorized" | "section_disabled" | "wrong_section";

export async function resolveSheetsWriter(
  req: NextRequest,
  token: string,
): Promise<{ ok: true; writer: ClientWriter; clientSlug: string } | { ok: false; reason: SheetsAccessFailure }> {
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return { ok: false, reason: "not_found" };
  const { wiki, onlySection } = resolved;
  if (onlySection && onlySection !== "sheets") return { ok: false, reason: "wrong_section" };

  const flags = await prisma.clientWiki.findUnique({
    where: { id: wiki.id },
    select: { sheetsEnabled: true },
  });
  if (!flags?.sheetsEnabled) return { ok: false, reason: "section_disabled" };

  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  const clientUser = await resolveWikiAccessUser(wiki.id, cookieValue);
  if (clientUser) {
    return {
      ok: true,
      clientSlug: wiki.clientSlug,
      writer: { wikiId: wiki.id, name: clientUser.displayName, wikiUserId: clientUser.id },
    };
  }

  // Gitwork staff viewing the client's page act with the CLIENT's permissions there (the
  // full team controls live in the internal wiki), and own no client rows.
  const staff = await auth();
  if (staff?.user) {
    const name = staff.user.name?.trim() || staff.user.email || "Gitwork";
    return { ok: true, clientSlug: wiki.clientSlug, writer: { wikiId: wiki.id, name, wikiUserId: null } };
  }
  return { ok: false, reason: "unauthorized" };
}

/** Generous for a person typing through cells (a write per pause), a wall for a script. */
export async function assertSheetsWriteRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `sheets:write:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 240,
    windowMs: 60_000,
    message: "Too many changes at once — please wait a moment and try again.",
  });
}

export function sheetsAccessError(reason: SheetsAccessFailure): { message: string; status: number } {
  switch (reason) {
    case "unauthorized":
      return { message: "Please sign in to your portal to make changes.", status: 401 };
    case "section_disabled":
      return {
        message: "Sheets are switched off for this client, so they can't accept changes. Nothing is wrong with your link.",
        status: 409,
      };
    case "wrong_section":
      return { message: "This link doesn't give access to Sheets.", status: 403 };
    default:
      return { message: "Not found", status: 404 };
  }
}

/* ─────────────────────────────────────────────────── internal (team) ── */

/**
 * Internal routes: 'Manage clients' AND access to THIS client (a developer scoped to other
 * clients gets 403, §71). Returns the client id and the team actor to stamp on rows.
 * An API-key caller (null user) is trusted, as everywhere else, and is named "Gitwork".
 */
export async function resolveInternalSheets(
  req: Request,
  slug: string,
  action: string,
): Promise<{ clientId: string | null; actor: SheetActor; user: EffectiveUser | null }> {
  const user = await getEffectiveUserOrNull(req);
  assertCan(user, canManageClients, action);
  await assertClientAccessBySlug(user, slug);
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return {
    clientId: client?.id ?? null,
    user,
    actor: { kind: "TEAM", name: user?.name?.trim() || user?.email || "Gitwork", userId: user?.id ?? null },
  };
}
