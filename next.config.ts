import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @heroicons/react is a barrel (151 import sites). optimizePackageImports rewrites
  // `import { XIcon } from "@heroicons/react/24/outline"` to per-icon imports so each
  // chunk only ships the icons it uses, not the whole set. Pure build-time transform.
  experimental: {
    optimizePackageImports: ["@heroicons/react"],
    // Self-hosted standalone server.js defaults this to false, which makes it build
    // every Route Handler's request.url from its own bind hostname/port
    // (HOSTNAME=0.0.0.0, PORT=3000) instead of the incoming Host header — regardless
    // of what nginx forwards. Broke the RFC 8414/9728 OAuth metadata routes (issuer
    // came back as "https://0.0.0.0:3000") after the Vercel→VPS migration (§23),
    // since Vercel's platform handled this differently. Safe here: nginx is the only
    // ingress and P5.19 custom-hostname doc routing already trusts the Host header.
    trustHostHeader: true,
    // Real, functioning internal flag (checked in next/dist/server/lib/router-utils/
    // resolve-routes.js) — not yet in this Next version's public ExperimentalConfig type.
  } as NonNullable<NextConfig["experimental"]> & { trustHostHeader: boolean },
  // Keep the headless-Chromium packages out of the bundler so their code isn't relocated.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "firebase-admin"],
  // …but Chromium's binary pack under bin/ is loaded by a computed path at runtime, so Next's
  // file tracer doesn't see it and leaves it out of the function ("/bin does not exist"). Force
  // it into ONLY the PDF route's function (the `*` matches the [id] segment; scoping it here
  // avoids bloating every other /api route with the ~50MB pack).
  outputFileTracingIncludes: {
    "/api/proposals/*/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/pulse/scans/*/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
    ],
  },
  async headers() {
    // Baseline security headers applied to every route EXCEPT /embed/* (the public
    // Pulse widget is intentionally frameable — handled separately below). The
    // negative-lookahead source keeps the app's clickjacking protection off the
    // embed so it can still load cross-origin.
    const securityHeaders = [
      // Force HTTPS for 2 years incl. subdomains. TLS terminates at the VPS proxy (§23).
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Anti-clickjacking. CSP frame-ancestors is the modern control; X-Frame-Options
      // covers older browsers. The app itself is never meant to be framed.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
      // Drop features the web app doesn't use (native iOS handles device capture).
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), browsing-topics=()" },
    ];
    return [
      {
        // Everything except /embed/*.
        source: "/((?!embed/).*)",
        headers: securityHeaders,
      },
      {
        // The public Pulse scanner is a shareable lead-gen widget — allow it to
        // be embedded as an <iframe> on any site (it exposes no authed actions).
        // No X-Frame-Options here (it can't express a wildcard allow).
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *;" }],
      },
    ];
  },
};

export default nextConfig;
