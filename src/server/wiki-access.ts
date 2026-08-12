/**
 * wiki-access.ts — client login gate for the PUBLIC wiki link.
 *
 * Multiple client users (ClientWikiUser, email + password) per wiki. The cookie
 * is bound to a specific user: it embeds the user id and an HMAC of the wiki id,
 * user id and current password hash — so removing the user or changing their
 * password invalidates any existing session. Gitwork staff bypass this entirely
 * via their Foundry (NextAuth) session; this module only covers client users.
 */

import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/** Per-wiki cookie so a visitor only unlocks the one wiki they logged into. */
export function wikiAccessCookieName(wikiId: string): string {
  return `wiki_access_${wikiId}`;
}

/** 7 days — long enough that a client isn't re-prompted every visit. */
export const WIKI_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function accessSecret(): string {
  // Only real server secrets — never API_KEY / NEXT_PUBLIC_API_KEY (the latter is
  // inlined into the client bundle, so signing with it would be forgeable). Fail
  // CLOSED if neither is set: the old hardcoded string fallback
  // ("foundry-wiki-access-fallback-secret") meant any misconfigured deploy signed
  // wiki cookies with a public, guessable key → forgeable client-wiki sessions.
  const secret = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "No signing secret for wiki access — set ENCRYPTION_KEY (or NEXTAUTH_SECRET).",
    );
  }
  return secret;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Signed cookie value for a logged-in wiki user:
 *   "<userId>.<hmac(wikiId:userId:passwordHash)>"
 * The password hash binding means a password change or user deletion
 * invalidates the cookie on the next request.
 */
export function signWikiUserAccess(
  wikiId: string,
  user: { id: string; passwordHash: string },
): string {
  const sig = createHmac("sha256", accessSecret())
    .update(`${wikiId}:${user.id}:${user.passwordHash}`)
    .digest("base64url");
  return `${user.id}.${sig}`;
}

/**
 * Verify a cookie value: parse the user id, load that ClientWikiUser (scoped to
 * the wiki), recompute the signature against its current hash, constant-time
 * compare. Returns true only when the user still exists and the hash is unchanged.
 */
export async function verifyWikiAccessCookie(
  wikiId: string,
  cookieValue: string | undefined | null,
): Promise<boolean> {
  return (await resolveWikiAccessUser(wikiId, cookieValue)) !== null;
}

/** A signed-in client wiki user, for attribution. */
export interface WikiAccessUser {
  id: string;
  email: string;
  name: string | null;
  /** What to show / attribute a request to: their name, else their email. */
  displayName: string;
}

/**
 * Same verification as `verifyWikiAccessCookie`, but returns WHO it is rather
 * than just whether the cookie is good — so a request a client files can be
 * attributed to them instead of asking them to type their own name into a
 * "Requested by" box we could not trust anyway.
 *
 * Identical checks, deliberately: the user must still exist on THIS wiki and the
 * signature must still match their current password hash, so a deleted user or a
 * changed password stops resolving. `verifyWikiAccessCookie` is now a thin
 * wrapper over this, so the gate and the attribution can never disagree about
 * who is logged in.
 */
export async function resolveWikiAccessUser(
  wikiId: string,
  cookieValue: string | undefined | null,
): Promise<WikiAccessUser | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return null;
  const userId = cookieValue.slice(0, dot);

  const user = await prisma.clientWikiUser.findFirst({
    where: { id: userId, wikiId },
    select: { id: true, passwordHash: true, email: true, name: true },
  });
  if (!user) return null;

  const expected = signWikiUserAccess(wikiId, user);
  if (!constantTimeEqual(cookieValue, expected)) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    displayName: user.name?.trim() || user.email,
  };
}

/** One wiki a portal user can reach, plus the cookie that unlocks it. */
export interface PortalWikiAccess {
  wikiId: string;
  clientName: string;
  slug: string;
  /** Canonical public URL: /wiki/<slug>/<token>. */
  url: string;
  cookieName: string;
  cookieValue: string;
}

/**
 * Central portal login: authenticate an email + password against ClientWikiUser
 * rows across ALL wikis (email is unique per-wiki, so the same address can appear
 * on several). Returns every wiki whose stored password matches AND that has a
 * shared surface to land on — either a whole-wiki share OR any shared section
 * (e.g. Design System). The caller sets each cookie and routes the user (one →
 * straight in, many → chooser). No token needed; this is the tokenless entry.
 */
export async function loginPortalUser(
  email: string,
  password: string,
): Promise<PortalWikiAccess[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return [];

  const users = await prisma.clientWikiUser.findMany({
    where: { email: normalized },
    select: {
      id: true,
      passwordHash: true,
      wiki: {
        select: {
          id: true,
          shareToken: true,
          shareEnabled: true,
          pageShareTokens: true,
          client: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const out: PortalWikiAccess[] = [];
  for (const u of users) {
    // Prefer the whole-wiki share; otherwise land them on a shared section
    // (per-section share, e.g. Design System only). No shared surface → skip.
    const wholeWiki = u.wiki.shareEnabled && u.wiki.shareToken ? u.wiki.shareToken : null;
    const sectionToken = u.wiki.pageShareTokens?.[0] ?? null;
    const token = wholeWiki ?? sectionToken;
    if (!token) continue;
    const passOk = await bcrypt.compare(password, u.passwordHash);
    if (!passOk) continue;
    out.push({
      wikiId: u.wiki.id,
      clientName: u.wiki.client.name,
      slug: u.wiki.client.slug,
      url: `/wiki/${u.wiki.client.slug}/${token}`,
      cookieName: wikiAccessCookieName(u.wiki.id),
      cookieValue: signWikiUserAccess(u.wiki.id, { id: u.id, passwordHash: u.passwordHash }),
    });
  }
  return out;
}
