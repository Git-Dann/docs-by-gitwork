/**
 * Drive files in a client's wiki — the files in their linked Google Drive folder, shown as a
 * tab of the Resources section (and of Portal's Documents card).
 *
 * Two readers, on purpose:
 *   - The TEAM (Portal, and the internal wiki) reads with their own Google sign-in, so Drive's
 *     own sharing decides what each person sees (`/api/clients/[slug]/drive`).
 *   - The CLIENT has no Gitwork Google account, so their copy is read with the sign-in of the
 *     team member who switched the section on (`ClientWiki.driveReaderUserId`). Everything that
 *     reader can see INSIDE the client's folder, the client can see. Nothing outside it: every
 *     folder, thumbnail and file id is proven to sit under the client folder first.
 *
 * The client side uses the hardened posture (Launchpad, Sheets): token → section on → a
 * per-section link must be FOR Drive → a logged-in client user or a Gitwork session → a per-IP
 * rate limit. Holding the link alone is not enough to read files.
 */

import type { NextRequest } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { googleClientForRefreshToken } from "@/server/google-auth";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { readRoot, DriveReadError } from "@/server/client-drive";
import { EMPTY_DRIVE, driveFolderIdFromUrl, type WikiDriveSection } from "@/lib/client-drive";

/* ── the DTO ── */

export async function loadWikiDrive(clientId: string): Promise<WikiDriveSection> {
  const [wiki, client] = await Promise.all([
    prisma.clientWiki.findUnique({
      where: { clientId },
      select: { driveEnabled: true, driveReaderUserId: true, client: { select: { workspaceId: true } } },
    }),
    prisma.workspaceClient.findUnique({ where: { id: clientId }, select: { googleDriveFolderUrl: true } }),
  ]);
  const linked = driveFolderIdFromUrl(client?.googleDriveFolderUrl) !== null;
  // `linked` is known even while it's off, so the team's Resources page can offer to switch
  // it on only where there's a folder to show.
  if (!wiki?.driveEnabled) return { ...EMPTY_DRIVE, linked };
  let reader: WikiDriveSection["reader"] = null;
  if (wiki.driveReaderUserId) {
    const user = await prisma.user.findUnique({
      where: { id: wiki.driveReaderUserId },
      select: {
        name: true,
        email: true,
        googleOAuthRefreshToken: true,
        memberships: {
          where: { workspaceId: wiki.client.workspaceId, ...ACTIVE_MEMBER },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (user) {
      reader = {
        name: user.name?.trim() || user.email || "A teammate",
        ready: Boolean(user.googleOAuthRefreshToken) && user.memberships.length > 0,
      };
    }
  }
  return { enabled: true, linked, reader };
}

/** The client's copy: whose sign-in reads the folder is ours, not theirs. */
export function forPublicDrive(section: WikiDriveSection): WikiDriveSection {
  return section.enabled && section.linked ? { enabled: true, linked: true, reader: null } : EMPTY_DRIVE;
}

export class WikiDriveSetupError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Switch the section on or off. Switching it on makes `userId` the reader for the client, so
 * it is refused unless that person's own Google sign-in can open the client's folder right now
 * — a section that would show the client "not available" on day one is not switched on.
 */
export async function setWikiDriveEnabled(
  clientId: string,
  enabled: boolean,
  userId: string | null,
): Promise<void> {
  if (!enabled) {
    await prisma.clientWiki.upsert({
      where: { clientId },
      create: { clientId, driveEnabled: false },
      update: { driveEnabled: false },
      select: { id: true },
    });
    return;
  }
  if (!userId) throw new WikiDriveSetupError("Sign in to Foundry to switch on Drive — it reads with your Google account.");
  const [client, user] = await Promise.all([
    prisma.workspaceClient.findUnique({ where: { id: clientId }, select: { googleDriveFolderUrl: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { googleOAuthRefreshToken: true } }),
  ]);
  const rootId = driveFolderIdFromUrl(client?.googleDriveFolderUrl);
  if (!rootId) {
    throw new WikiDriveSetupError("Add the client's Google Drive folder link in Portal (Edit client) first.");
  }
  if (!user?.googleOAuthRefreshToken) {
    throw new WikiDriveSetupError("Your Google account isn't connected to Foundry. Sign out and back in, then try again.");
  }
  const oauth = googleClientForRefreshToken(user.googleOAuthRefreshToken);
  if (!oauth) throw new WikiDriveSetupError("Google sign-in isn't configured on this server.", 500);
  try {
    const root = await readRoot(google.drive({ version: "v3", auth: oauth }), rootId);
    if (!root) throw new WikiDriveSetupError("The Drive link on this client is a file, not a folder.");
  } catch (err) {
    if (err instanceof WikiDriveSetupError) throw err;
    const state = err instanceof DriveReadError ? err.state : "error";
    throw new WikiDriveSetupError(
      state === "no_access"
        ? "Your Google account can't open this client's Drive folder, so the client couldn't see it either."
        : state === "reconnect"
          ? "Your Google sign-in needs refreshing to read Drive. Sign out of Foundry and back in, then try again."
          : "Google Drive didn't answer. Try again in a moment.",
    );
  }
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, driveEnabled: true, driveReaderUserId: userId },
    update: { driveEnabled: true, driveReaderUserId: userId },
    select: { id: true },
  });
}

/* ── the client's side ── */

export type WikiDriveAccessFailure = "not_found" | "wrong_section" | "section_disabled" | "unauthorized";

export interface WikiDriveAccess {
  wikiId: string;
  rootId: string | null;
  readerUserId: string | null;
  workspaceId: string;
}

/**
 * Who may read the Drive files through a share link. A light query — NOT `resolvePublicWiki`,
 * which builds the whole wiki and would run on every thumbnail in a list.
 */
export async function resolveWikiDriveAccess(
  req: NextRequest,
  token: string,
): Promise<{ ok: true; access: WikiDriveAccess } | { ok: false; reason: WikiDriveAccessFailure }> {
  if (!token) return { ok: false, reason: "not_found" };
  const select = {
    id: true,
    driveEnabled: true,
    driveReaderUserId: true,
    pageShares: true,
    client: { select: { workspaceId: true, googleDriveFolderUrl: true } },
  } as const;
  let wiki = await prisma.clientWiki.findFirst({ where: { shareToken: token, shareEnabled: true }, select });
  let onlySection: string | null = null;
  if (!wiki) {
    wiki = await prisma.clientWiki.findFirst({ where: { pageShareTokens: { has: token } }, select });
    if (!wiki) return { ok: false, reason: "not_found" };
    const map = wiki.pageShares && typeof wiki.pageShares === "object" ? (wiki.pageShares as Record<string, string>) : {};
    onlySection = Object.keys(map).find((k) => map[k] === token) ?? null;
    if (!onlySection) return { ok: false, reason: "not_found" };
  }
  // Drive lives inside Resources, so a per-section link must be the Resources one.
  if (onlySection && onlySection !== "documents") return { ok: false, reason: "wrong_section" };
  if (!wiki.driveEnabled) return { ok: false, reason: "section_disabled" };

  const cookieValue = req.cookies.get(wikiAccessCookieName(wiki.id))?.value;
  const clientUser = await resolveWikiAccessUser(wiki.id, cookieValue);
  if (!clientUser) {
    const staff = await auth();
    if (!staff?.user?.id) return { ok: false, reason: "unauthorized" };
  }
  return {
    ok: true,
    access: {
      wikiId: wiki.id,
      rootId: driveFolderIdFromUrl(wiki.client.googleDriveFolderUrl),
      readerUserId: wiki.driveReaderUserId,
      workspaceId: wiki.client.workspaceId,
    },
  };
}

/**
 * The reader's Drive client — only while they are still on the team and still connected. An
 * archived member's token is never used for a client (§57), however recently it worked.
 */
export async function readerDrive(
  access: WikiDriveAccess,
): Promise<{ drive: ReturnType<typeof google.drive>; accessToken: () => Promise<string | null> } | null> {
  if (!access.readerUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: access.readerUserId },
    select: {
      googleOAuthRefreshToken: true,
      memberships: { where: { workspaceId: access.workspaceId, ...ACTIVE_MEMBER }, select: { id: true }, take: 1 },
    },
  });
  if (!user?.googleOAuthRefreshToken || user.memberships.length === 0) return null;
  const oauth = googleClientForRefreshToken(user.googleOAuthRefreshToken);
  if (!oauth) return null;
  return {
    drive: google.drive({ version: "v3", auth: oauth }),
    accessToken: async () => (await oauth.getAccessToken()).token ?? null,
  };
}

/** A page of files is one request; thumbnails are one each. Generous for a person, a wall for a script. */
export async function assertWikiDriveRate(req: NextRequest, kind: "list" | "thumb" | "file"): Promise<void> {
  const max = kind === "thumb" ? 600 : kind === "list" ? 120 : 60;
  await assertWithinRateLimit({
    bucket: `wiki-drive:${kind}:${clientIpFrom(req.headers) ?? "unknown"}`,
    max,
    windowMs: 10 * 60_000,
    message: "Too many requests — please wait a moment and try again.",
  });
}

export function wikiDriveAccessError(reason: WikiDriveAccessFailure): { message: string; status: number } {
  switch (reason) {
    case "unauthorized":
      return { message: "Please sign in to your portal to see these files.", status: 401 };
    case "section_disabled":
      return { message: "Drive files are switched off for this client.", status: 409 };
    case "wrong_section":
      return { message: "This link doesn't give access to these files.", status: 403 };
    default:
      return { message: "Not found", status: 404 };
  }
}
