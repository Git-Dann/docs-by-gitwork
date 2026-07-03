/**
 * Side-effect module: installs the demo `/api/*` fetch interceptor once, on the
 * client, at import time (before any React query runs). Imported by every demo
 * entry (DemoShell + DemoProviders) so canned data is served no matter which
 * demo page is the entry point. See `resolveDemoApi` in `dev-demo-data.ts`.
 */

import { resolveDemoApi } from "@/lib/demo/dev-demo-data";

declare global {
  var __foundryDemoFetchPatched: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__foundryDemoFetchPatched) {
  globalThis.__foundryDemoFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let rawUrl: string;
    if (typeof input === "string") rawUrl = input;
    else if (input instanceof URL) rawUrl = input.href;
    else rawUrl = input.url;

    let pathname: string;
    try {
      pathname = rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl.split("?")[0];
    } catch {
      pathname = rawUrl.split("?")[0];
    }

    if (pathname.startsWith("/api/")) {
      const body = resolveDemoApi(pathname);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input as RequestInfo, init);
  };
}

/** A no-op export so importers can `import { ensureDemoFetch } from …` if they
 *  prefer an explicit call; the side effect above runs regardless on import. */
export function ensureDemoFetch(): void {
  /* import side-effect already patched window.fetch */
}
