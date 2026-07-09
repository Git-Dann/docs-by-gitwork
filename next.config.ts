import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @heroicons/react is a barrel (151 import sites). optimizePackageImports rewrites
  // `import { XIcon } from "@heroicons/react/24/outline"` to per-icon imports so each
  // chunk only ships the icons it uses, not the whole set. Pure build-time transform.
  experimental: {
    optimizePackageImports: ["@heroicons/react"],
  },
  // NOTE: experimental.trustHostHeader does NOT work for self-hosted standalone
  // builds — Next's build pipeline (build/index.js, generate-required-server-files)
  // hardcodes it to the Vercel-platform-detection boolean when writing
  // required-server-files.json, unconditionally overwriting whatever's set here.
  // Routes needing the real public origin behind nginx must read the Host /
  // X-Forwarded-Host request header directly (see src/lib/request-origin.ts)
  // instead of request.url. Confirmed by instrumenting next/dist/server/config.js
  // and next/dist/build/index.js directly — this isn't a guess.
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
