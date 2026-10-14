import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary so the real fetchWithTimeout path runs.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext } from "../_types";
import { runMobileExtended } from "../mobile-extended";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://github.com/" },
    httpsUrl: "https://github.com",
    hostname: "github.com",
    platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

function serveCss(files: Record<string, string | number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = files[String(url)];
      if (body === undefined || typeof body === "number") return new Response("", { status: typeof body === "number" ? body : 404 });
      return new Response(body, { status: 200, headers: { "content-type": "text/css" } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

// Shape of github.com's homepage head: CSS is external, the HTML never mentions the query.
const GITHUB_HEAD = `<html><head>
<link crossorigin="anonymous" media="all" rel="stylesheet" href="https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css" />
<link crossorigin="anonymous" media="all" rel="stylesheet" href="https://github.githubassets.com/assets/primer-react-css.b3e5d651631108a3.module.css" />
</head><body><h1>Build and ship software</h1></body></html>`;

async function reducedMotion(html: string) {
  const checks = await runMobileExtended(context(html));
  return checks.find((c) => c.checkKey === "reduced_motion_css")!;
}

describe("reduced_motion_css reads linked stylesheets", () => {
  it("PASSes when the query lives only in an external stylesheet (github.com)", async () => {
    serveCss({
      "https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css": ":root{--fgColor-default:#1f2328}",
      "https://github.githubassets.com/assets/primer-react-css.b3e5d651631108a3.module.css":
        "@media (prefers-reduced-motion:reduce){.Spinner{animation:none}}",
    });
    const check = await reducedMotion(GITHUB_HEAD);
    expect(check.status).toBe("PASS");
  });

  it("still WARNs when every linked stylesheet was read and none has the query", async () => {
    serveCss({
      "https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css": ":root{--fgColor-default:#1f2328}",
      "https://github.githubassets.com/assets/primer-react-css.b3e5d651631108a3.module.css": ".Spinner{animation:spin 1s linear infinite}",
    });
    const check = await reducedMotion(GITHUB_HEAD);
    expect(check.status).toBe("WARN");
    expect(check.detail).toMatch(/linked stylesheets/);
  });

  it("still WARNs for a page with no stylesheets and no query (example.com)", async () => {
    serveCss({});
    const check = await reducedMotion("<html><head><style>body{margin:0}</style></head><body><h1>Example Domain</h1></body></html>");
    expect(check.status).toBe("WARN");
  });

  it("is INCONCLUSIVE, not WARN, when a stylesheet could not be fetched", async () => {
    serveCss({
      "https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css": ":root{}",
      "https://github.githubassets.com/assets/primer-react-css.b3e5d651631108a3.module.css": 503,
    });
    const check = await reducedMotion(GITHUB_HEAD);
    expect(check.status).toBe("INCONCLUSIVE");
  });

  it("PASSes on an inline <style> query without fetching anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const check = await reducedMotion("<html><head><style>@media (prefers-reduced-motion: reduce){*{animation:none}}</style></head></html>");
    expect(check.status).toBe("PASS");
  });
});

describe("reduced_motion_css: a dead stylesheet link is not an unread one", () => {
  it("still WARNs when one linked stylesheet 404s and the rest lack the query", async () => {
    serveCss({
      "https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css": ":root{}",
      "https://github.githubassets.com/assets/primer-react-css.b3e5d651631108a3.module.css": 404,
    });
    const check = await reducedMotion(GITHUB_HEAD);
    expect(check.status).toBe("WARN");
  });
});
