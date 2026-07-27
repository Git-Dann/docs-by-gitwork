import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Read version from package.json at build time. Baked into the client bundle via env below
// so the sidebar footer can show "v1.0.0 · <build date>" to confirm a fresh deploy is live.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  output: "standalone",
  // Drop the `X-Powered-By: Next.js` response header — it volunteers the framework
  // to anyone fingerprinting the stack for known CVEs, and buys nothing.
  // (`Server: nginx/1.24.0` is the matching disclosure on the proxy; that one needs
  // `server_tokens off;` on the VPS, which is outside this repo.)
  poweredByHeader: false,
  // Pin the workspace root. The vendored Deck app (vendor/bento/slides) has its own
  // package-lock.json, and with more than one lockfile in the tree Next only *infers*
  // the root — a wrong guess would change what a standalone build traces in. This is
  // the same directory it infers today, stated explicitly so it can't drift.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  env: {
    // In production this is stamped by CI (.github/workflows/deploy.yml → Dockerfile ARG) as
    // "<pkg.version>.<gh-run-number>" so every push auto-bumps the patch segment without
    // touching package.json. Local `next dev` falls back to plain pkg.version.
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version,
    // ISO string captured at build. In production this is stamped by the CI workflow
    // (NEXT_PUBLIC_BUILD_TIME is set in .github/workflows/deploy.yml right before `next build`)
    // so it reflects the exact deploy time, not just whatever the config file happened to
    // evaluate. Local `next dev` falls back to the process start time. Rendered client-side
    // in the viewer's local time.
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(),
  },
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
    "/api/docs/*/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  images: {
    // Serve next/image output as AVIF/WebP where the browser supports it — far
    // smaller than the source JPEG/PNG for the same visual quality.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
    ],
  },
  async rewrites() {
    return [
      // Deck (the slide editor — vendor/bento, built to public/deck/index.html)
      // is a single static shell, not a Next route, so /deck alone would 404.
      // Auth is middleware's job (it gates /deck** like an /app page).
      { source: "/deck", destination: "/deck/index.html" },
    ];
  },
  async redirects() {
    return [
      // Agency marketing lives on gitwork.co.uk, which is what links HERE — these
      // pages duplicated it. Permanent (308) rather than deleted outright so any
      // inbound link or indexed result lands on the real marketing site instead of
      // a 404, and passes its ranking signal across. Root, not a deep path: this
      // repo can't verify gitwork.co.uk's own route names.
      { source: "/products", destination: "https://gitwork.co.uk", permanent: true },
      { source: "/products/:slug", destination: "https://gitwork.co.uk", permanent: true },
      { source: "/pricing", destination: "https://gitwork.co.uk", permanent: true },
      { source: "/company", destination: "https://gitwork.co.uk", permanent: true },
      { source: "/customers", destination: "https://gitwork.co.uk", permanent: true },
    ];
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
      // Cross-origin isolation. COOP severs the opener relationship so a malicious
      // opener can't reach into our window — `same-origin-allow-popups` rather than
      // plain `same-origin` because Google sign-in runs in a popup and needs to talk
      // back to the page that opened it. CORP stops other sites embedding our
      // responses as subresources; /embed/* is exempt from this whole block (the
      // negative-lookahead source below), so the Pulse widget keeps working
      // cross-origin for gitwork.co.uk.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      // NOT set: Cross-Origin-Embedder-Policy. It would require every cross-origin
      // subresource to be CORS-enabled or credentialless, which would silently break
      // the remote images allow-listed above (cdn.prod.website-files.com) and Google
      // profile pictures. There is no staging environment to prove it safe on, so it
      // stays off deliberately rather than by omission.
    ];
    return [
      {
        // Everything except /embed/*.
        source: "/((?!embed/).*)",
        headers: securityHeaders,
      },
      {
        // Deck's shell is a 700KB static file that only changes on deploy, and Next
        // serves public/ with `max-age=0` — so every open paid a revalidation round
        // trip. A minute of freshness makes reopening instant while still picking up
        // a deploy on the next open; `must-revalidate` keeps it from going stale
        // beyond that. Cache-Control ONLY — /deck already matches the catch-all
        // above, so re-listing the security headers here would send each twice.
        source: "/deck/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=60, must-revalidate" }],
      },
      {
        // The public Pulse scanner is a lead-gen widget for the gitwork.co.uk marketing
        // site — restricted to Gitwork's own domains, plus 'self' so /pulse-overview's
        // same-origin self-embed keeps working. No X-Frame-Options here (it can't
        // express this multi-origin allow-list the way CSP frame-ancestors can).
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://gitwork.co.uk https://www.gitwork.co.uk;" }],
      },
    ];
  },
};

export default nextConfig;
