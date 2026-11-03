/**
 * Team avatars on a client's public wiki.
 *
 * An uploaded avatar is served from `/api/avatars/<userId>`, which needs a Foundry
 * sign-in — so on the client's share link every uploaded photo 401'd and showed as a
 * broken image (October 2026, Dan and Harry on a live client page). The public wiki
 * points those avatars at `/api/wiki/<token>/avatars/<userId>` instead, which serves
 * them to anyone who can open THAT wiki, and only for people on its team.
 *
 * Pure, so the rewrite and the route agree on one pattern.
 */

const SIGNED_IN_AVATAR = /^\/api\/avatars\/([A-Za-z0-9_-]{1,64})$/;

/** The user id in a signed-in avatar path, or null for anything else. */
export function signedInAvatarUserId(url: string | null | undefined): string | null {
  return url ? (SIGNED_IN_AVATAR.exec(url)?.[1] ?? null) : null;
}

/**
 * The URL a public wiki viewer can load. Signed-in avatar paths are rewritten to the
 * wiki-scoped route; external photo URLs (GitHub, Google) and null are left alone.
 */
export function publicTeamAvatarUrl(token: string, url: string | null): string | null {
  const userId = signedInAvatarUserId(url);
  if (!userId) return url;
  return `/api/wiki/${encodeURIComponent(token)}/avatars/${userId}`;
}
