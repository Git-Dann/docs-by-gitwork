import { afterEach, describe, expect, it, vi } from "vitest";

// Adversarial-review follow-ups for performance-extended: false negatives the first fixes left open.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runPerformanceExtended, isFingerprintedAssetUrl, isHashedAssetUrl } from "../performance-extended";
import type { ExtendedCheckContext } from "../_types";

type Route = { body?: string; headers?: Record<string, string>; status?: number };

function stubFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const route = routes[url];
      if (!route) return new Response("not found", { status: 404 });
      return new Response(init?.method === "HEAD" ? null : route.body ?? "", { status: route.status ?? 200, headers: route.headers ?? {} });
    }),
  );
  return calls;
}

function ctxFor(url: string, html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: url },
    httpsUrl: url,
    hostname: new URL(url).hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function run(url: string, html: string) {
  const checks = await runPerformanceExtended(ctxFor(url, html));
  return (key: string) => {
    const c = checks.find((x) => x.checkKey === key);
    if (!c) throw new Error(`missing ${key}`);
    return c;
  };
}

const CSS = { "content-type": "text/css" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("next_gen_image_formats: an image Pulse cannot see is not a non-raster image", () => {
  it("is INCONCLUSIVE when the only URL is a data: placeholder (jQuery lazyload data-original)", async () => {
    stubFetch({});
    const check = (await run("https://example.org/", `<body><img src="data:image/gif;base64,R0lGOD" data-original="/a.jpg"></body>`))("next_gen_image_formats");
    expect(check.status).toBe("INCONCLUSIVE");
  });
  it("still PASSes a page whose images are all SVG", async () => {
    stubFetch({});
    const check = (await run("https://example.org/", `<body><img src="/logo.svg" width="1" height="1"></body>`))("next_gen_image_formats");
    expect(check.status).toBe("PASS");
  });
  it("probes a script-served image (image.php?id=) and WARNs when it comes back as JPEG", async () => {
    stubFetch({ "https://example.org/image.php?id=3": { headers: { "content-type": "image/jpeg" } } });
    const check = (await run("https://example.org/", `<body><img src="/image.php?id=3"></body>`))("next_gen_image_formats");
    expect(check.status).toBe("WARN");
  });
});

describe("immutable_cache_assets: .min. and chunk are not content hashes", () => {
  it("does not treat jquery.min.js or vendor-chunk.js as fingerprinted", () => {
    expect(isFingerprintedAssetUrl("https://example.org/js/jquery.min.js")).toBe(false);
    expect(isFingerprintedAssetUrl("https://example.org/js/vendor-chunk.js")).toBe(false);
    expect(isHashedAssetUrl("https://example.org/js/jquery.min.js")).toBe(true);
  });
  it("is INCONCLUSIVE, not WARN, for a page whose only 'hashed' asset is a .min.js", async () => {
    stubFetch({ "https://example.org/js/jquery.min.js": { headers: { "cache-control": "max-age=3600" } } });
    const check = (await run("https://example.org/", `<body><script src="/js/jquery.min.js"></script></body>`))("immutable_cache_assets");
    expect(check.status).toBe("INCONCLUSIVE");
  });
  it("still WARNs a real content-hashed asset served without immutable", async () => {
    stubFetch({ "https://example.org/assets/app-BIQp8M26.js": { headers: { "cache-control": "max-age=3600" } } });
    const check = (await run("https://example.org/", `<body><script src="/assets/app-BIQp8M26.js"></script></body>`))("immutable_cache_assets");
    expect(check.status).toBe("WARN");
  });
});

describe("woff2_font_format: a font service does not vouch for self-hosted fonts nobody read", () => {
  it("is INCONCLUSIVE when Google Fonts is linked but the site's own sheet could not be read", async () => {
    stubFetch({});
    const html = `<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="/site.css"></head>`;
    expect((await run("https://example.org/", html))("woff2_font_format").status).toBe("INCONCLUSIVE");
  });
  it("PASSes Google Fonts when the site's own sheet was read and holds no fonts", async () => {
    stubFetch({ "https://example.org/site.css": { body: "body{margin:0}", headers: CSS } });
    const html = `<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="/site.css"></head>`;
    expect((await run("https://example.org/", html))("woff2_font_format").status).toBe("PASS");
  });
});

describe("asset reads are shared across checks", () => {
  it("GETs each stylesheet once even though minification and font checks both read it", async () => {
    const calls = stubFetch({ "https://example.org/site.css": { body: "body{margin:0}", headers: CSS } });
    await run("https://example.org/", `<head><link rel="stylesheet" href="/site.css"></head>`);
    expect(calls.filter((c) => c === "GET https://example.org/site.css")).toHaveLength(1);
  });
});
