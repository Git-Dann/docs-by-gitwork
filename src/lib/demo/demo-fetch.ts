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
    // The query string used to be thrown away here, so every list endpoint answered the same
    // payload whatever was asked of it — in Care that meant all nine view tabs showed all four
    // conversations, tab counts that disagreed with the rows beneath them, and a search box that
    // did nothing. It is passed through now; `resolveDemoApi` may ignore it.
    let search: URLSearchParams | undefined;
    try {
      const u = rawUrl.startsWith("http") ? new URL(rawUrl) : new URL(rawUrl, "http://demo.local");
      pathname = u.pathname;
      search = u.searchParams;
    } catch {
      pathname = rawUrl.split("?")[0];
    }

    if (pathname.startsWith("/api/")) {
      // `init` is passed through so demo MUTATIONS can be applied rather than
      // silently answered with the unchanged fixture — a demo where every write
      // appears to succeed and changes nothing verifies the CSS and nothing else.
      const body = resolveDemoApi(pathname, search, {
        method: init?.method,
        body: init?.body,
      });
      // A handler can refuse a write the way the real route would: `{ error, __status }`
      // answers with that status, so the caller's error path runs instead of reading a
      // refusal as success.
      let status = 200;
      let payload = body;
      if (body && typeof body === "object" && typeof (body as { __status?: unknown }).__status === "number") {
        const { __status, ...rest } = body as { __status: number } & Record<string, unknown>;
        status = __status;
        payload = rest;
      }
      return new Response(JSON.stringify(payload), {
        status,
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
