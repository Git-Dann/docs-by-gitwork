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
  return (
    process.env.ENCRYPTION_KEY ??
    process.env.NEXTAUTH_SECRET ??
    process.env.API_KEY ??
    process.env.NEXT_PUBLIC_API_KEY ??
    "foundry-wiki-access-fallback-secret"
  );
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
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const userId = cookieValue.slice(0, dot);

  const user = await prisma.clientWikiUser.findFirst({
    where: { id: userId, wikiId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return false;

  const expected = signWikiUserAccess(wikiId, user);
  return constantTimeEqual(cookieValue, expected);
}

export interface WikiLoginResult {
  wikiId: string;
  cookieName: string;
  cookieValue: string;
}

/**
 * Validate an email/password against the wiki resolved from a public share token
 * (whole-wiki token or any per-section token). Returns the cookie to set on
 * success, or null on bad token / unknown email / wrong password.
 */
export async function loginWikiAccess(
  token: string,
  email: string,
  password: string,
): Promise<WikiLoginResult | null> {
  // Resolve by whole-wiki token first, then by any per-section token — mirrors
  // resolvePublicWiki so login works from whatever public link was shared.
  const wiki =
    (await prisma.clientWiki.findFirst({
      where: { shareToken: token, shareEnabled: true },
      select: { id: true },
    })) ??
    (await prisma.clientWiki.findFirst({
      where: { pageShareTokens: { has: token } },
      select: { id: true },
    }));

  if (!wiki) return null;

  const user = await prisma.clientWikiUser.findUnique({
    where: { wikiId_email: { wikiId: wiki.id, email: email.trim().toLowerCase() } },
    select: { id: true, passwordHash: true },
  });
  if (!user) return null;

  const passOk = await bcrypt.compare(password, user.passwordHash);
  if (!passOk) return null;

  return {
    wikiId: wiki.id,
    cookieName: wikiAccessCookieName(wiki.id),
    cookieValue: signWikiUserAccess(wiki.id, user),
  };
}
