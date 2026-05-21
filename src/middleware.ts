import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// API paths that do not require API_KEY authentication
const PUBLIC_API_PATHS = ["/api/health", "/api/auth", "/api/report"];

const API_AUTH_COOKIE = "gitwork_api_session";

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

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // CORS preflight for all API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
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

  // API routes: validate API_KEY via bearer token or session cookie
  if (pathname.startsWith("/api/")) {
    const isPublic = PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));

    if (!isPublic) {
      const apiKey = configuredApiKey();
      if (apiKey) {
        const authHeader = req.headers.get("Authorization");
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;
        const cookieToken = req.cookies.get(API_AUTH_COOKIE)?.value ?? null;
        const token = bearerToken ?? cookieToken;

        if (token !== apiKey) {
          return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
      }
    }

    const response = NextResponse.next();
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
