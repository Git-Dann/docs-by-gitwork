import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no Prisma, used by middleware
const REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const SESSION_MAX_AGE = 8 * 60 * 60;            // 8 hours (no remember me)

// Bump this whenever we need to force every existing session to re-authenticate.
// Tokens without this version (or with an older version) are treated as invalid by the
// `authorized` callback, bouncing the user to /login. After they sign in again, their fresh
// JWT gets stamped with the current version and they're back in.
//
// History:
//   1 — original
//   2 — per-user Google OAuth migration: existing sessions still pointed at a shared
//       workspace token; bumping forces sign-out so each user's personal refresh token
//       gets captured on the next sign-in.
export const SESSION_VERSION = 2;

export const authConfig = {
  session: { strategy: "jwt" as const, maxAge: REMEMBER_ME_MAX_AGE },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAppPage = nextUrl.pathname.startsWith("/app");
      if (!isAppPage) return true;
      if (!isLoggedIn) return false;
      // Reject pre-migration sessions so existing JWTs don't leak across users via the
      // workspace-shared Google token path. Returning false here triggers a redirect to
      // /login; the next sign-in stamps the token with the current SESSION_VERSION.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenVersion = (auth?.user as any)?.sessionVersion;
      if (tokenVersion !== SESSION_VERSION) return false;
      return true;
    },
    redirect({ url, baseUrl }) {
      // Honor internal callbackUrls (relative paths or same origin)
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      // Everything else — land on the dashboard
      return `${baseUrl}/app`;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.permissions = (user as any).permissions;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.remember = (user as any).remember ?? false;
        // Shorten expiry when "remember me" is not checked
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(user as any).remember) {
          token.exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as string[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).sessionVersion = token.sessionVersion;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
