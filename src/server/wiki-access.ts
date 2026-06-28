/**
 * wiki-access.ts — username/password gate for the PUBLIC client wiki link.
 *
 * Cookie-based, no session table. The cookie value is an HMAC of the wiki id +
 * its current `accessPasswordHash`, so changing the password (or clearing it)
 * auto-invalidates every previously-issued cookie. The gate is optional per
 * client — only enforced when `ClientWiki.accessProtected` is true.
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

/**
 * Signed cookie value for an unlocked wiki. Bound to the password hash so a
 * password change invalidates the cookie. Returns null when no hash is set.
 */
export function signWikiAccess(wikiId: string, passwordHash: string | null): string | null {
  if (!passwordHash) return null;
  return createHmac("sha256", accessSecret())
    .update(`${wikiId}:${passwordHash}`)
    .digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a cookie value against the wiki's current password hash (loaded fresh
 * from the DB). True only when the gate is active and the signature matches.
 */
export async function verifyWikiAccessCookie(
  wikiId: string,
  cookieValue: string | undefined | null,
): Promise<boolean> {
  if (!cookieValue) return false;
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: { accessPasswordHash: true },
  });
  const expected = signWikiAccess(wikiId, wiki?.accessPasswordHash ?? null);
  if (!expected) return false;
  return constantTimeEqual(cookieValue, expected);
}

export interface WikiLoginResult {
  wikiId: string;
  cookieName: string;
  cookieValue: string;
}

/**
 * Validate a username/password against the wiki resolved from a public share
 * token (whole-wiki token or any per-section token). Returns the cookie to set
 * on success, or null on bad token / disabled gate / wrong credentials.
 */
export async function loginWikiAccess(
  token: string,
  username: string,
  password: string,
): Promise<WikiLoginResult | null> {
  // Resolve by whole-wiki token first, then by any per-section token — mirrors
  // resolvePublicWiki so the login works from whatever public link was shared.
  const wiki =
    (await prisma.clientWiki.findFirst({
      where: { shareToken: token, shareEnabled: true },
      select: { id: true, accessProtected: true, accessUsername: true, accessPasswordHash: true },
    })) ??
    (await prisma.clientWiki.findFirst({
      where: { pageShareTokens: { has: token } },
      select: { id: true, accessProtected: true, accessUsername: true, accessPasswordHash: true },
    }));

  if (!wiki || !wiki.accessProtected || !wiki.accessPasswordHash) return null;

  const userOk = constantTimeEqual(
    username.trim().toLowerCase(),
    (wiki.accessUsername ?? "").trim().toLowerCase(),
  );
  const passOk = await bcrypt.compare(password, wiki.accessPasswordHash);
  if (!userOk || !passOk) return null;

  const cookieValue = signWikiAccess(wiki.id, wiki.accessPasswordHash);
  if (!cookieValue) return null;
  return { wikiId: wiki.id, cookieName: wikiAccessCookieName(wiki.id), cookieValue };
}
