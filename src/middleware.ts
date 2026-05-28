import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { verifyMobileToken, type MobileTokenClaims } from "@/server/auth/mobile-jwt";

const { auth } = NextAuth(authConfig);

// API paths that do not require API_KEY authentication.
// `/api/sign` is the public signer endpoint family — token in the URL is its own auth.
// `/api/docs` is the public document view-tracking beacon — token in the URL is its own auth.
// `/api/auth/mobile-callback` is the iOS auth bootstrap — id_token is its own auth.
const PUBLIC_API_PATHS = ["/api/health", "/api/auth", "/api/report", "/api/sign", "/api/docs"];

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

  // CORS preflight for all API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Already logged in + visiting /login → send straight to the dashboard
  if (pathname === "/login" && req.auth) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // App pages: require NextAuth session
  if (pathname.startsWith("/app")) {
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
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
  matcher: ["/api/:path*", "/app/:path*", "/login"],
};
