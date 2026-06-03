import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the headless-Chromium packages out of the bundler so their code isn't relocated.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
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
