import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, SESSION_VERSION } from "@/auth.config";
import { verifyMobileToken, type MobileTokenClaims } from "@/server/auth/mobile-jwt";
import { isAtLeast } from "@/types/auth";

const { auth } = NextAuth(authConfig);

// Hostnames that the middleware short-circuits past for custom-domain routing. Anything not in
// this list and not localhost gets the DB lookup. Keep in sync with vercel.json domains.
const DEFAULT_HOSTS = new Set([
  "foundry.gitwork.co.uk",
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
      `https://${process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : "foundry.gitwork.co.uk"}/api/internal/resolve-host?hostname=${encodeURIComponent(hostname)}`,
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
  // Public DevSignal candidate flow — token in /api/vet/[token] is its own auth.
  "/api/vet",
  // Public self-serve apply front door — shared-password gate + cookie, enforced
  // inside the handlers (rate-limited). No API key.
  "/api/apply",
  "/api/internal/resolve-host",
  // Public Pulse lite scanner (embeddable widget). SSRF-guarded + rate-limited
  // inside the handlers; no API key. CORS '*' (below) lets it run cross-origin.
  "/api/public/pulse",
  // Public wiki share — token in URL is its own auth (validated server-side).
  "/api/wiki",
  // Central client-portal login — email + password is the auth (no API key).
  "/api/portal",
  // Inbound course-request API — per-wiki token in the URL path is the auth.
  "/api/public/course-requests",
  // Inbound wiki bug / feedback / task API — per-wiki token in the URL path is the auth.
  "/api/public/wiki-items",
  // Public webhook ingest — per-connection token in the URL path is the auth.
  "/api/support/webhook",
  // Inbound GitHub webhook for Pulse monitors — per-monitor HMAC signature is the auth.
  "/api/webhooks/github",
  // Inbound Slack interactivity / events — Slack-issued HMAC signature
  // (X-Slack-Signature, verified inside the handler) is the auth.
  "/api/webhooks/slack",
  // OAuth 2.1 endpoints for the in-app MCP route. authorize requires a NextAuth
  // user session (not API_KEY); token/revoke/register are bearer-/PKCE-gated by
  // the OAuth spec itself. See src/server/oauth.ts.
  "/api/oauth",
  // MCP transport — its own bearer auth, never API_KEY. See src/server/mcp/auth.ts.
  "/api/mcp",
  // Scheduled jobs — each /api/cron/* route self-authenticates via the
  // `Authorization: Bearer ${CRON_SECRET}` header (checked in the handler), so
  // it must bypass the workspace API_KEY gate. Invoked by the VPS system crontab.
  "/api/cron",
];

function isPublicApiPath(pathname: string): boolean {
  // Anchor on a path-segment boundary so "/api/onboarding" can't make a sibling
  // such as "/api/onboarding-forms" public. Exact match, or the entry followed by "/".
  return PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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

// Wildcard CORS is only for the intentionally-cross-origin PUBLIC endpoints (the
// embeddable Pulse widget, token-authed public pages, webhooks). Authenticated
// /api routes are same-origin (web app) or native (iOS, no CORS) — sending them
// `Access-Control-Allow-Origin: *` needlessly widened the CSRF surface. Empty
// object → no CORS headers → the browser applies same-origin policy.
function corsHeadersFor(pathname: string): Record<string, string> {
  return isPublicApiPath(pathname) ? CORS_HEADERS : {};
}

// Maps /app/* path prefixes to the module permission that gates them. Listed as
// pairs (not a module→path map) so a module can expose both its canonical route
// and its legacy alias — e.g. clients lives at /app/portal today and /app/clients
// historically; both resolve to the same `clients` permission.
const MODULE_PATHS: Array<{ prefix: string; module: string }> = [
  { prefix: "/app/pulse", module: "pulse" },
  // DevSignal — MUST precede the /app/code(clear) entries so it wins the
  // first-match loop. Admin-only feature perm (default-off), not `codeclear`.
  { prefix: "/app/codeclear/devsignal", module: "devsignal" },
  // NOTE: matching is a bare `startsWith`, so "/app/codeclear" is already caught by
  // "/app/code" below — a separate legacy entry for it would be dead code, and one was
  // removed from here. If DevSignal ever moves to /app/code/devsignal, RENAME the entry
  // above in place; appending it after "/app/code" would let that prefix match first and
  // silently regate admin-only DevSignal onto `codeclear`, which STAFF auto-inherits.
  { prefix: "/app/code", module: "codeclear" }, // canonical (also catches /app/codeclear)
  { prefix: "/app/docs", module: "proposals" }, // canonical
  { prefix: "/app/proposals", module: "proposals" }, // legacy
  { prefix: "/app/portal", module: "clients" }, // canonical
  { prefix: "/app/clients", module: "clients" }, // legacy (redirect stub — still needs gating, see below)
  { prefix: "/app/care", module: "support" }, // canonical
  { prefix: "/app/support", module: "support" }, // legacy
  { prefix: "/app/study", module: "study" }, // Study is an optional Pulse tool — admin-only feature perm (default-off)
  { prefix: "/app/backstage", module: "backstage" },
  { prefix: "/app/studio", module: "studio" }, // Admin/Super Admin only (studio is a default-off feature perm)
  // These three were reachable by ANY signed-in member — including a developer scoped
  // to neither module — because hasModuleAccess() ends in an unconditional `return true`,
  // so an /app path with no prefix match here is ungated by default. They are all
  // nav-hidden or single-linked, which is why it went unnoticed.
  { prefix: "/app/proof", module: "proposals" }, // document sign-off — nav-hidden (§11)
  { prefix: "/app/templates", module: "proposals" }, // document templates
  { prefix: "/app/projects", module: "clients" }, // Foundry project detail
  // Starters is NOT here — it's Super-Admin-ONLY, enforced by a dedicated role check below.
];

function configuredApiKey() {
  return process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY ?? null;
}

// Known link-unfurl crawlers (Slack/Twitter/Facebook/LinkedIn/WhatsApp/Discord/
// Telegram/Mastodon/Bluesky/Skype). When one of these hits an /app/** URL, the
// auth redirect would point it at /login and the unfurl would read /login's
// metadata — generic platform card, never the entity. Letting bots through
// renders the page server-side just enough that generateMetadata + the
// colocated opengraph-image.tsx emit the right meta tags; the body is mostly
// client-component shells which crawlers ignore.
const UNFURL_BOT_PATTERN =
  /\b(Slackbot|Slack-ImgProxy|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|Discordbot|TelegramBot|SkypeUriPreview|Mastodon|bsky\.app|Embedly)\b/i;

function isUnfurlBot(userAgent: string | null): boolean {
  return !!userAgent && UNFURL_BOT_PATTERN.test(userAgent);
}

// Anywhere under /app, allow the colocated opengraph-image (and twitter-image)
// route through unauthenticated. The image is generated from data already in
// the URL (entity name / id) so there's no additional disclosure — and direct
// access from Open Graph debuggers / preview tooling needs it to be reachable.
function isOgAssetPath(pathname: string): boolean {
  return /\/(opengraph|twitter)-image(\b|\/|$)/.test(pathname);
}

/** The Deck shell (public/deck/index.html, reached at /deck). */
function isDeckPath(pathname: string): boolean {
  return pathname === "/deck" || pathname.startsWith("/deck/");
}

function hasModuleAccess(pathname: string, permissions: string[]): boolean {
  for (const { prefix, module } of MODULE_PATHS) {
    if (pathname.startsWith(prefix)) {
      return permissions.includes(module);
    }
  }
  // /app, /app/settings, /app/team, /app/account-settings are always accessible
  // to any logged-in member.
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
    return new NextResponse(null, { status: 204, headers: corsHeadersFor(pathname) });
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

  // App pages: require NextAuth session — UNLESS the request is a link-unfurl
  // crawler (Slackbot etc.) reading metadata to render a card, or the path
  // itself is a public OG image asset. Both bypass the auth redirect so the
  // unfurl reflects the entity, not the login page.
  // Anchor on the segment boundary so sibling public routes like /apply are NOT
  // treated as app pages (`"/apply".startsWith("/app")` is true — the bug this
  // guards against). Gate exactly `/app` and any `/app/**`.
  //
  // `/deck` rides along: it's the static Deck shell served from public/deck (see
  // next.config.ts rewrites), an internal tool, so it needs a session exactly
  // like an app page. It has no module gate — Deck holds no Foundry data, it's a
  // local editor, so any signed-in member can open one.
  const isAppPage = pathname === "/app" || pathname.startsWith("/app/");
  if (isAppPage || isDeckPath(pathname)) {
    const userAgent = req.headers.get("user-agent");
    // The unfurl/OG bypass exists so an /app entity page can render its card —
    // Deck has no metadata worth unfurling, so it never skips the session check.
    if (isAppPage && (isOgAssetPath(pathname) || isUnfurlBot(userAgent))) {
      return NextResponse.next();
    }
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

    // Starters tools are Super-Admin-ONLY (Foundry-internal; the GitHub repo just stores the
    // sources). This runs before the Admin-bypass module gate so Admins are excluded too.
    if (pathname.startsWith("/app/starters") && !isAtLeast(req.auth.user.role, "SUPER_ADMIN")) {
      return NextResponse.redirect(new URL("/app", req.url));
    }

    // The Handbook (internal developer knowledgebase) is readable by every internal user — it's the
    // devs' bible. No module gate here; write access (create/edit/delete) is enforced server-side in
    // the /api/handbook routes (Admin + Super Admin only).

    // Module gate — Admins and Super Admins reach every module (nav safety: never lock
    // an admin out on a stale token). Staff and Developers are scoped to the modules in
    // their resolved permissions (baked into the JWT at sign-in). Matrix changes to a
    // module apply on their next sign-in; field/data gates are enforced live server-side.
    if (!isAtLeast(req.auth.user.role, "ADMIN")) {
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

    // Anchor on a path-segment boundary so an entry like "/api/onboarding" can't make a
    // sibling such as "/api/onboarding-forms" public. Exact match, or the entry followed by "/".
    const isPublic = isPublicApiPath(pathname);
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

        // (b) NextAuth web session. The `gitwork_api_session` cookie is minted on
        // the /app response, but immediately after a Google sign-in the browser
        // can fire the first /api/* fetch (e.g. /api/account) before that
        // Set-Cookie has landed — a race that surfaced as a one-off 400/401 that
        // "fixes itself on refresh". A valid session IS sufficient authorization
        // (route handlers still enforce their own per-permission gates), so accept
        // it directly and close the race.
        if (!authorized && req.auth?.user) {
          authorized = true;
        }

        if (!authorized) {
          return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeadersFor(pathname), "Content-Type": "application/json" },
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
    for (const [key, value] of Object.entries(corsHeadersFor(pathname))) {
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
