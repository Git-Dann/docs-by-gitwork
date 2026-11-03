/**
 * Who may write a client's Changelog, and under whose name.
 *
 * **Internal** (`/api/clients/[slug]/wiki/changelog/**`): a team member of Developer rank or
 * above who can see this client. Developers write release notes, so this is deliberately not
 * `canManageClients`. ⚠️ Until October 2026 these routes checked nothing, and the per-entry
 * route acted on any id it was given, so any signed-in member could approve or delete any
 * client's release. Every entry write is now scoped to the client named in the URL.
 *
 * **The client's page** (`POST /api/wiki/[token]/changelog/approve`): anyone the page itself
 * lets in. That is a client user signed in to their wiki, or a Gitwork session, the same rule
 * as the page in `src/app/wiki/[slug]/[token]/page.tsx`. A per-section link must be FOR the
 * Changelog. A client can approve and never un-approve. The approver's name is resolved here,
 * never taken from the request.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { ForbiddenError, getEffectiveUserOrNull, type EffectiveUser } from "@/server/auth/effective-user";
import { resolvePublicWiki } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { isAtLeast } from "@/types/auth";

export class ChangelogNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Changelog entry not found");
  }
}

export async function resolveInternalChangelog(
  req: Request,
  slug: string,
  action: string,
): Promise<{ user: EffectiveUser | null; clientId: string | null; wikiId: string | null; byName: string }> {
  const user = await getEffectiveUserOrNull(req);
  // `null` is a trusted API-key caller; a signed-in guest is below Developer and may not.
  if (user && !isAtLeast(user.role, "DEVELOPER")) {
    throw new ForbiddenError(`You don't have permission to ${action}.`);
  }
  await assertClientAccessBySlug(user, slug);
  const workspaceId = user?.workspaceId ?? (await ensureBaseRecords()).workspace.id;
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true, wiki: { select: { id: true } } },
  });
  return {
    user,
    clientId: client?.id ?? null,
    wikiId: client?.wiki?.id ?? null,
    byName: user?.name?.trim() || user?.email || "Gitwork",
  };
}

/** 404 unless the entry belongs to this client's wiki. Never reveals it exists elsewhere. */
export async function assertEntryInWiki(entryId: string, wikiId: string | null): Promise<void> {
  if (!wikiId) throw new ChangelogNotFoundError();
  const row = await prisma.clientChangelogEntry.findFirst({ where: { id: entryId, wikiId }, select: { id: true } });
  if (!row) throw new ChangelogNotFoundError();
}

export type ChangelogApproverFailure = "not_found" | "unauthorized" | "wrong_section";

export async function resolveChangelogApprover(
  req: NextRequest,
  token: string,
): Promise<{ ok: true; wikiId: string; name: string } | { ok: false; reason: ChangelogApproverFailure }> {
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return { ok: false, reason: "not_found" };
  const { wiki, onlySection } = resolved;
  if (onlySection && onlySection !== "changelog") return { ok: false, reason: "wrong_section" };

  const clientUser = await resolveWikiAccessUser(wiki.id, req.cookies.get(wikiAccessCookieName(wiki.id))?.value);
  if (clientUser) return { ok: true, wikiId: wiki.id, name: clientUser.displayName };

  const staff = await auth();
  if (staff?.user) return { ok: true, wikiId: wiki.id, name: staff.user.name?.trim() || staff.user.email || "Gitwork" };
  return { ok: false, reason: "unauthorized" };
}

export async function assertApproveRate(req: NextRequest): Promise<void> {
  await assertWithinRateLimit({
    bucket: `changelog:approve:${clientIpFrom(req.headers) ?? "unknown"}`,
    max: 30,
    windowMs: 60_000,
    message: "Too many approvals at once. Please wait a moment and try again.",
  });
}

export function approverError(reason: ChangelogApproverFailure): { message: string; status: number } {
  switch (reason) {
    case "unauthorized":
      return { message: "Please sign in to your portal to approve releases.", status: 401 };
    case "wrong_section":
      return { message: "This link is for a different part of the wiki.", status: 403 };
    default:
      return { message: "Wiki not found", status: 404 };
  }
}
