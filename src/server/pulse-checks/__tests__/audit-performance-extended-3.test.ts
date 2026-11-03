import { afterEach, describe, expect, it, vi } from "vitest";

// Reviewer-requested behaviour for the performance-extended fixes: the false negatives each
// first-cut fix opened, and the bounded asset read.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runPerformanceExtended, isHashedAssetUrl, fetchAssetText } from "../performance-extended";
import type { ExtendedCheckContext } from "../_types";

type Route = { body?: string | ReadableStream<Uint8Array>; headers?: Record<string, string>; status?: number };

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
const JS = { "content-type": "application/javascript" };
const FORMATTED_CSS = ".site-header {\n  display: flex;\n  align-items: center;\n  padding: 12px 24px;\n}\n".repeat(30);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isHashedAssetUrl: hand-named camelCase files are not fingerprints", () => {
  it("rejects mainPage.js, appStyle.css, jqueryUI.js, scripts1.js", () => {
    for (const name of ["mainPage.js", "appStyle.css", "jqueryUI.js", "scripts1.js"]) {
      expect(isHashedAssetUrl(`https://example.org/assets/${name}`), name).toBe(false);
    }
  });
  it("still accepts the real Vite/Rollup hashes (bolt.new, hydrogen.shop)", () => {
    for (const name of ["src-DXgMMW-9.css", "root-9vqqlNC4.css", "app-BIQp8M26.css"]) {
      expect(isHashedAssetUrl(`https://example.org/assets/${name}`), name).toBe(true);
    }
  });
  it("reads a hand-named camelCase file instead of passing it on its name", async () => {
    stubFetch({ "https://example.org/js/mainPage.js": { body: "function init() {\n  var a = 1;\n  return a;\n}\n".repeat(40), headers: JS } });
    const check = (await run("https://example.org/", `<html><body><script src="/js/mainPage.js"></script></body></html>`))("js_appears_minified");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("mainPage.js");
  });
});

describe("fetchAssetText is bounded in size and time", () => {
  it("caps a multi-MB body and reports it as incomplete", async () => {
    stubFetch({ "https://example.org/big.css": { body: "a{color:red}".repeat(100_000), headers: CSS } });
    const r = await fetchAssetText("https://example.org/big.css");
    expect(r).not.toBeNull();
    expect(r?.complete).toBe(false);
    expect(r?.text.length).toBeLessThanOrEqual(400_000);
  });
  it("returns null, not partial text, when a slow-drip body outlives the deadline", async () => {
    vi.useFakeTimers();
    const drip = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("a{color:red}")); } });
    stubFetch({ "https://example.org/slow.css": { body: drip, headers: CSS } });
    const pending = fetchAssetText("https://example.org/slow.css");
    await vi.advanceTimersByTimeAsync(7_000);
    expect(await pending).toBeNull();
  });
  it("still reads a normal small file in full", async () => {
    stubFetch({ "https://example.org/a.css": { body: "a{color:red}", headers: CSS } });
    expect(await fetchAssetText("https://example.org/a.css")).toEqual({ text: "a{color:red}", complete: true });
  });
});

describe("next_gen_image_formats: no image is not the same as no raster image", () => {
  it("probes lazy-loaded JPEGs behind a data: placeholder (WordPress lazy-load) and WARNs", async () => {
    const calls = stubFetch({ "https://example.org/wp-content/uploads/photo.jpg": { headers: { "content-type": "image/jpeg" } } });
    const html = `<html><body><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/wp-content/uploads/photo.jpg" class="lazyload"></body></html>`;
    expect((await run("https://example.org/", html))("next_gen_image_formats").status).toBe("WARN");
    expect(calls).toContain("HEAD https://example.org/wp-content/uploads/photo.jpg");
  });
  it("probes extensionless image-CDN URLs and lets the content-type decide", async () => {
    stubFetch({ "https://res.cloudinary.com/demo/image/upload/v1/sample": { headers: { "content-type": "image/jpeg" } } });
    const html = `<html><body><img src="https://res.cloudinary.com/demo/image/upload/v1/sample" alt="x"></body></html>`;
    expect((await run("https://example.org/", html))("next_gen_image_formats").status).toBe("WARN");
  });
  it("reads <picture><source srcset> candidates", async () => {
    stubFetch({ "https://example.org/hero-800.jpg": { headers: { "content-type": "image/avif" } } });
    const html = `<html><body><picture><source srcset="/hero-800.jpg 800w, /hero-1600.jpg 1600w"><img alt="hero"></picture></body></html>`;
    expect((await run("https://example.org/", html))("next_gen_image_formats").status).toBe("PASS");
  });
  it("is INCONCLUSIVE for a client-rendered page with no image tags in its server HTML", async () => {
    stubFetch({});
    expect((await run("https://example.org/", `<html><body><div id="root"></div></body></html>`))("next_gen_image_formats").status).toBe("INCONCLUSIVE");
  });
});

describe("css_appears_minified: a site's own files on a CDN host are still judged", () => {
  it("WARNs an unminified style.css served from a CloudFront host, naming the host", async () => {
    stubFetch({ "https://d123abc.cloudfront.net/style.css": { body: FORMATTED_CSS, headers: CSS } });
    const check = (await run("https://example.org/", `<html><head><link rel="stylesheet" href="https://d123abc.cloudfront.net/style.css"></head><body></body></html>`))("css_appears_minified");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("d123abc.cloudfront.net");
  });
  it("does not judge hosted font-service CSS (Google Fonts serves formatted CSS by design)", async () => {
    stubFetch({ "https://fonts.googleapis.com/css2?family=Inter": { body: FORMATTED_CSS, headers: CSS } });
    const check = (await run("https://example.org/", `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body></body></html>`))("css_appears_minified");
    expect(check.status).toBe("PASS");
  });
});

describe("font_preload_hint: 'system fonts' needs every stylesheet read", () => {
  const sheets = (n: number) => Array.from({ length: n }, (_, i) => `<link rel="stylesheet" href="/css/s${i}.css">`).join("");
  const routes = (n: number, fontAt?: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [
    `https://example.org/css/s${i}.css`,
    { body: i === fontAt ? '@font-face{font-family:Brand;src:url(/f/brand.woff2) format("woff2")}' : "body{margin:0}", headers: CSS },
  ]));
  it("finds @font-face in the 5th stylesheet and WARNs", async () => {
    stubFetch(routes(5, 4));
    expect((await run("https://example.org/", `<html><head>${sheets(5)}</head><body></body></html>`))("font_preload_hint").status).toBe("WARN");
  });
  it("is INCONCLUSIVE when there are more stylesheets than are read", async () => {
    stubFetch(routes(7));
    expect((await run("https://example.org/", `<html><head>${sheets(7)}</head><body></body></html>`))("font_preload_hint").status).toBe("INCONCLUSIVE");
  });
  it("is INCONCLUSIVE when one stylesheet could not be fetched", async () => {
    const r = routes(3);
    delete r["https://example.org/css/s2.css"];
    stubFetch(r);
    expect((await run("https://example.org/", `<html><head>${sheets(3)}</head><body></body></html>`))("font_preload_hint").status).toBe("INCONCLUSIVE");
  });
  it("is INCONCLUSIVE when a stylesheet pulls in more CSS via @import", async () => {
    stubFetch({ "https://example.org/css/s0.css": { body: '@import "fonts.css";\nbody{margin:0}', headers: CSS } });
    expect((await run("https://example.org/", `<html><head>${sheets(1)}</head><body></body></html>`))("font_preload_hint").status).toBe("INCONCLUSIVE");
  });
  it("PASSes when every linked stylesheet was read and none declares a font", async () => {
    stubFetch(routes(3));
    expect((await run("https://example.org/", `<html><head>${sheets(3)}</head><body></body></html>`))("font_preload_hint").status).toBe("PASS");
  });
});
