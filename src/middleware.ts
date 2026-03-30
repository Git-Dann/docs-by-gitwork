import { NextRequest, NextResponse } from "next/server";

// Public API paths that do not require authentication.
const PUBLIC_API_PATHS = ["/api/health"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight for all API routes.
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only apply auth logic to /api/ routes.
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Build the response and attach CORS headers to every API response.
  const isPublic = PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));

  if (!isPublic) {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;

    // If an API key is configured, validate the Authorization header.
    if (apiKey) {
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

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

export const config = {
  matcher: "/api/:path*",
};
