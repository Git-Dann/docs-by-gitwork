import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @heroicons/react is a barrel (151 import sites). optimizePackageImports rewrites
  // `import { XIcon } from "@heroicons/react/24/outline"` to per-icon imports so each
  // chunk only ships the icons it uses, not the whole set. Pure build-time transform.
  experimental: {
    optimizePackageImports: ["@heroicons/react"],
  },
  // Keep the headless-Chromium packages out of the bundler so their code isn't relocated.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "firebase-admin"],
  // …but Chromium's binary pack under bin/ is loaded by a computed path at runtime, so Next's
  // file tracer doesn't see it and leaves it out of the function ("/bin does not exist"). Force
  // it into ONLY the PDF route's function (the `*` matches the [id] segment; scoping it here
  // avoids bloating every other /api route with the ~50MB pack).
  outputFileTracingIncludes: {
    "/api/proposals/*/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
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
    return [
      {
        // The public Pulse scanner is a shareable lead-gen widget — allow it to
        // be embedded as an <iframe> on any site (it exposes no authed actions).
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *;" }],
      },
    ];
  },
};

export default nextConfig;
