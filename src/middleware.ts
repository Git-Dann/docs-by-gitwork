import { NextRequest, NextResponse } from "next/server";

// Public API paths that do not require authentication.
const PUBLIC_API_PATHS = ["/api/health"];
const API_AUTH_COOKIE = "gitwork_api_session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function configuredApiKey() {
  return process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY ?? null;
}

function attachCorsHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apiKey = configuredApiKey();

  // Handle CORS preflight for all API routes.
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Internal app pages get an HttpOnly session cookie so browser fetches can
  // call the API without exposing the bearer token to client-side code.
  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    if (apiKey && pathname.startsWith("/app")) {
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

  // Build the response and attach CORS headers to every API response.
  const isPublic = PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));

  if (!isPublic) {
    // If an API key is configured, validate either the Authorization header
    // for external clients or the secure session cookie for the internal app.
    if (apiKey) {
      const authHeader = request.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;
      const cookieToken = request.cookies.get(API_AUTH_COOKIE)?.value ?? null;
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
  attachCorsHeaders(response);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/app/:path*"],
};
