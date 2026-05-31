import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, SESSION_VERSION } from "@/auth.config";
import { verifyMobileToken, type MobileTokenClaims } from "@/server/auth/mobile-jwt";

const { auth } = NextAuth(authConfig);

// Hostnames that the middleware short-circuits past for custom-domain routing. Anything not in
// this list and not localhost gets the DB lookup. Keep in sync with vercel.json domains.
const DEFAULT_HOSTS = new Set([
  "foundry-by-gitwork.vercel.app",
  "docs-by-gitwork.vercel.app",
]);

function isDefaultHost(host: string): boolean {
  const bare = host.split(":")[0].toLowerCase();
  if (DEFAULT_HOSTS.has(bare)) return true;
  if (bare === "localhost" || bare === "127.0.0.1") return true;
  // Vercel preview deploys: *-{hash}-{team}.vercel.app
  if (bare.endsWith(".vercel.app")) return true;
  return false;
}

// Cache custom-hostname → workspace lookups for 60s. The middleware runs in the edge runtime
// on Vercel, where the cache is per-instance and short-lived anyway — this is just to avoid
// stampedes within a single instance.
const hostnameCache = new Map<string, { match: boolean; expires: number }>();
const HOSTNAME_CACHE_TTL_MS = 60_000;

async function isCustomHostnameMatch(hostname: string): Promise<boolean> {
  const now = Date.now();
  const cached = hostnameCache.get(hostname);
  if (cached && cached.expires > now) return cached.match;

  let match = false;
  try {
    // The Prisma client doesn't ship to the edge runtime — call our app's API route instead.
    // We hit our own /api/internal/resolve-host endpoint which runs on the Node runtime.
    const res = await fetch(
      `https://${process.env.VERCEL_URL ?? "foundry-by-gitwork.vercel.app"}/api/internal/resolve-host?hostname=${encodeURIComponent(hostname)}`,
      { headers: { "x-internal-call": "middleware" } },
    );
    if (res.ok) {
      const json = (await res.json()) as { match?: boolean };
      match = Boolean(json.match);
    }
  } catch {
    // Network blip: treat as not-match. Next request retries.
    match = false;
  }
  hostnameCache.set(hostname, { match, expires: now + HOSTNAME_CACHE_TTL_MS });
  return match;
}

/** Token-shaped path? `/aBcDeF...` of at least 16 url-safe chars. */
function looksLikeShareToken(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  const first = pathname.split("/")[1] ?? "";
  return /^[A-Za-z0-9_-]{16,}$/.test(first);
}

// API paths that do not require API_KEY authentication.
// `/api/sign` is the public signer endpoint family — token in the URL is its own auth.
// `/api/docs` is the public document view-tracking beacon — token in the URL is its own auth.
// `/api/auth/mobile-callback` is the iOS auth bootstrap — id_token is its own auth.
// `/api/internal/resolve-host` is called by this very middleware to map custom hostnames →
//                              workspace; returns only a boolean, no sensitive data.
const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/auth",
  "/api/report",
  "/api/sign",
  "/api/docs",
  // Public client onboarding flow — the URL token in /api/onboarding/[token]
  // is its own auth.
  "/api/onboarding",
  "/api/internal/resolve-host",
];

const API_AUTH_COOKIE = "gitwork_api_session";

// Server-internal headers used by route handlers to read the authenticated
// mobile user. Stripped from every incoming request below so they cannot be
// spoofed by clients.
const FOUNDRY_USER_HEADERS = [
  "x-foundry-user-id",
  "x-foundry-user-email",
  "x-foundry-user-role",
] as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// Maps module IDs to their /app/* path prefixes
const MODULE_PATHS: Record<string, string> = {
  pulse: "/app/pulse",
  codeclear: "/app/codeclear",
  proposals: "/app/proposals",
  clients: "/app/clients",
  support: "/app/support",
  study: "/app/study",
};

function configuredApiKey() {
  return process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY ?? null;
}

function hasModuleAccess(pathname: string, permissions: string[]): boolean {
  for (const [module, prefix] of Object.entries(MODULE_PATHS)) {
    if (pathname.startsWith(prefix)) {
      return permissions.includes(module);
    }
  }
  // /app and /app/settings are always accessible to logged-in staff
  return true;
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // P5.19 — custom-hostname routing. If a request lands on a non-default Host and the path
  // looks like a share token (`/{token}` at the root), rewrite to the internal `/docs/{token}`
  // route. The default hostname is left untouched so the existing `/docs/[token]` works as
  // before. We only do the DB lookup for non-default hosts to keep the hot path fast.
  if (host && !isDefaultHost(host) && looksLikeShareToken(pathname)) {
    const bare = host.split(":")[0].toLowerCase();
    if (await isCustomHostnameMatch(bare)) {
      const url = req.nextUrl.clone();
      url.pathname = `/docs${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // CORS preflight for all API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Already logged in + visiting /login → send straight to the dashboard. But not if their
  // session is from before the latest SESSION_VERSION — those users NEED to reach /login to
  // re-authenticate, otherwise we'd loop them back through this middleware.
  if (pathname === "/login" && req.auth) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenVersion = (req.auth.user as any)?.sessionVersion;
    if (tokenVersion === SESSION_VERSION) {
      return NextResponse.redirect(new URL("/app", req.url));
    }
    // else: let them through to sign in again
  }

  // App pages: require NextAuth session
  if (pathname.startsWith("/app")) {
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Reject pre-migration sessions. The `authorized` callback in auth.config.ts only fires
    // when NextAuth's default middleware is used — with this custom middleware wrapping
    // `auth()`, we have to enforce the version check ourselves. Tokens issued before
    // SESSION_VERSION bumped are missing the claim and get bounced to /login so the user
    // signs in fresh (capturing their per-user Google refresh token in the process).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenVersion = (req.auth.user as any)?.sessionVersion;
    if (tokenVersion !== SESSION_VERSION) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      // Hint to the login page why we bounced — useful for debug and for showing a one-time
      // notice ("Please sign in again to keep your account secure").
      loginUrl.searchParams.set("reason", "session_expired");
      return NextResponse.redirect(loginUrl);
    }

    // Staff permission check — admins have full access
    if (req.auth.user.role !== "ADMIN") {
      const permissions = req.auth.user.permissions ?? [];
      if (!hasModuleAccess(pathname, permissions)) {
        return NextResponse.redirect(new URL("/app", req.url));
      }
    }

    // Set the API session cookie so browser fetches pass the API_KEY check
    const apiKey = configuredApiKey();
    const response = NextResponse.next();
    if (apiKey) {
      response.cookies.set({
        name: API_AUTH_COOKIE,
        value: apiKey,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    }
    return response;
  }

  // API routes: validate via either (a) workspace API_KEY, (b) NextAuth web
  // session cookie, or (c) per-user Foundry mobile JWT issued by
  // /api/auth/mobile-callback.
  if (pathname.startsWith("/api/")) {
    // Strip any incoming x-foundry-user-* headers — defense in depth so clients
    // can't spoof the authenticated user identity that route handlers read.
    const forwardHeaders = new Headers(req.headers);
    for (const name of FOUNDRY_USER_HEADERS) {
      forwardHeaders.delete(name);
    }

    const isPublic = PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
    let mobileClaims: MobileTokenClaims | null = null;

    if (!isPublic) {
      const apiKey = configuredApiKey();
      if (apiKey) {
        const authHeader = req.headers.get("Authorization");
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;
        const cookieToken = req.cookies.get(API_AUTH_COOKIE)?.value ?? null;
        const token = bearerToken ?? cookieToken;

        // Accept either the shared workspace API_KEY (web session / legacy iOS)
        // or a per-user mobile JWT (post Wave-2 iOS).
        let authorized = token === apiKey;
        if (!authorized && bearerToken) {
          try {
            mobileClaims = await verifyMobileToken(bearerToken);
            authorized = true;
          } catch {
            authorized = false;
          }
        }

        if (!authorized) {
          return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Mobile JWT callers: forward the authenticated user identity downstream
    // via stripped+set request headers (Next.js middleware → route handler
    // pattern). Route handlers read these via getRequestUser().
    if (mobileClaims) {
      forwardHeaders.set("x-foundry-user-id", mobileClaims.sub);
      forwardHeaders.set("x-foundry-user-email", mobileClaims.email);
      forwardHeaders.set("x-foundry-user-role", mobileClaims.role);
    }

    const response = NextResponse.next({
      request: { headers: forwardHeaders },
    });
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  return NextResponse.next();
});

export const config = {
  // Match everything except Next-internal paths + static assets. The custom-host rewrite needs
  // to see top-level `/{token}` requests on the branded subdomain.
  matcher: [
    "/api/:path*",
    "/app/:path*",
    "/login",
    "/((?!_next/|favicon|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.woff2?$).*)",
  ],
};
