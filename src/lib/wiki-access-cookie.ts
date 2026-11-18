/**
 * How long a client stays signed in to their wiki, and keeping them signed in while
 * they use it. Edge-safe (no crypto, no Prisma), so the middleware can import it.
 *
 * It used to be 7 days from sign-in, never renewed, so a client who opened their wiki
 * every day was still signed out a week after they last typed their password (Nov 2026).
 * Now it is 30 days, and every visit to a wiki page starts the 30 days again: a client
 * is only asked to sign in after a month away.
 *
 * Renewing copies the cookie as it is. It grants nothing new: the value is still checked
 * on every request against the user and their current password, so a removed user or a
 * password reset still signs them out at once.
 */

export const WIKI_ACCESS_COOKIE_PREFIX = "wiki_access_";

/** 30 days, the same as the team's "remember me". */
export const WIKI_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function wikiAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WIKI_ACCESS_COOKIE_MAX_AGE,
  };
}

/** Only a real page visit renews: a client opening their wiki, not a background fetch. */
export function shouldRenewWikiAccess(pathname: string, method: string): boolean {
  return method === "GET" && pathname.startsWith("/wiki/");
}

/** The client sign-in cookies on a request, to be set again with a fresh 30 days. */
export function wikiAccessCookiesToRenew(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  return cookies.filter((c) => c.name.startsWith(WIKI_ACCESS_COOKIE_PREFIX) && c.value.length > 0);
}
