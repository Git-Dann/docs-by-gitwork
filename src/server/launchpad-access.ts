/**
 * launchpad-access.ts — who may write to a client's Launchpad through the public
 * wiki link, and under whose name.
 *
 * Three routes need the same gate, so it lives here once rather than being pasted
 * into each — the shape that let `/api/wiki/[token]/blockers` and
 * `/api/wiki/[token]/course-requests` drift into two different postures for the
 * same kind of write.
 *
 * The posture is the HARDENED one (blockers), not the token-only one
 * (course-requests): a Launchpad write records a commercial fact — "the client says
 * the Apple Developer account is set up" — that a developer will act on, so it needs
 * the same unlock the public page itself demands. Reads stay token-only, because the
 * section is individually shareable and a link recipient should be able to see what
 * is being asked of them.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { resolvePublicWiki } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

export type LaunchpadAccessFailure =
  | "not_found"
  | "unauthorized"
  | "section_disabled"
  | "not_assigned";

export interface LaunchpadWriter {
  wikiId: string;
  clientSlug: string;
  /** Who to stamp on `LaunchpadItem.updatedBy` / `LaunchpadDoc.approvedByEmail`. */
  actorName: string;
  actorEmail: string | null;
}

/**
 * Resolve a client-facing writer.
 *
 * Two kinds of visitor legitimately reach these routes, exactly as on the Requests
 * form: a client user logged into their wiki, and Gitwork staff, who bypass the
 * client login via their Foundry session. Either is fine; an anonymous holder of the
 * share link is not.
 *
 * Attribution is resolved SERVER-SIDE and never taken from the body — a name a
 * visitor types is a claim, and stamping one client's contact against another
 * person's update is worse than stamping nothing.
 */
export async function resolveLaunchpadWriter(
  req: NextRequest,
  token: string,
): Promise<{ ok: true; writer: LaunchpadWriter } | { ok: false; reason: LaunchpadAccessFailure }> {
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return { ok: false, reason: "not_found" };
  const { wiki } = resolved;

  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  const clientUser = await resolveWikiAccessUser(wiki.id, cookieValue);
  if (clientUser) {
    return {
      ok: true,
      writer: {
        wikiId: wiki.id,
        clientSlug: wiki.clientSlug,
        actorName: clientUser.displayName,
        actorEmail: clientUser.email,
      },
    };
  }

  const staff = await auth();
  if (staff?.user) {
    const name = staff.user.name?.trim() || staff.user.email || "Gitwork";
    return {
      ok: true,
      writer: {
        wikiId: wiki.id,
        clientSlug: wiki.clientSlug,
        actorName: name,
        actorEmail: staff.user.email ?? null,
      },
    };
  }

  return { ok: false, reason: "unauthorized" };
}

/**
 * The internal (slug) counterpart: resolve a client slug to the wiki id its
 * Launchpad hangs off, WITHOUT creating a wiki row as a side effect of a write that
 * may be about to fail. Returns null when the client or the wiki doesn't exist.
 *
 * Callers must still gate on `canManageClients` themselves — this only resolves.
 */
export async function resolveInternalLaunchpadTarget(
  slug: string,
): Promise<{ clientId: string; wikiId: string } | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true, wiki: { select: { id: true } } },
  });
  if (!client?.wiki) return null;
  return { clientId: client.id, wikiId: client.wiki.id };
}

/**
 * Per-IP limit on the client-facing writes. Same reasoning as the onboarding
 * autosave route: the token is 144+ bits so brute force is already infeasible, and
 * this exists to stop one IP hammering a public endpoint — a debounced field editor
 * is a write per keystroke-pause, so the ceiling is generous rather than tight.
 */
export async function assertLaunchpadWriteRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `launchpad:write:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 240,
    windowMs: 60_000,
    message: "Too many changes at once — please wait a moment and try again.",
  });
}

/** HTTP status + message for a failed resolve, so every route reports it the same
 *  way. Kept distinct on purpose: reporting a switched-off section as a bad token is
 *  what turned a one-toggle fix into a support thread about a broken link (§40.1). */
export function launchpadAccessError(reason: LaunchpadAccessFailure): {
  message: string;
  status: number;
} {
  switch (reason) {
    case "unauthorized":
      return { message: "Please sign in to your portal to make changes.", status: 401 };
    case "section_disabled":
      return {
        message:
          "The Launchpad is switched off for this client, so it can't accept changes yet. Nothing is wrong with your link.",
        status: 409,
      };
    case "not_assigned":
      return {
        message: "No Launchpad has been set up for this client yet.",
        status: 409,
      };
    default:
      return { message: "Not found", status: 404 };
  }
}
