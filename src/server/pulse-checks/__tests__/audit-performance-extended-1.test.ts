import { afterEach, describe, expect, it, vi } from "vitest";

// Probes go through fetchWithTimeout -> fetchScannableUrl; route them to the stubbed global fetch.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runPerformanceExtended, isHashedAssetUrl, minificationOf } from "../performance-extended";
import type { ExtendedCheckContext } from "../_types";

// Fixtures are trimmed from live responses captured 2026-10-14 during the performance-extended-1 audit.

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

function ctxFor(url: string, html: string, headers: Record<string, string> = {}): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 10, finalUrl: url },
    httpsUrl: url,
    hostname: new URL(url).hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function run(url: string, html: string, headers: Record<string, string> = {}) {
  const checks = await runPerformanceExtended(ctxFor(url, html, headers));
  return (key: string) => {
    const c = checks.find((x) => x.checkKey === key);
    if (!c) throw new Error(`missing ${key}`);
    return c;
  };
}

// Real HN news.css lines: hand-formatted, short lines.
const HN_CSS = Array.from({ length: 40 }, () => "body  { font-family:Verdana, Geneva, sans-serif; font-size:10pt; color:#828282; }").join("\n");
const HN_JS = Array.from({ length: 60 }, (_, i) => `function vote${i}(id, how) {\n  var el = document.getElementById(id);\n}`).join("\n");
// Minified webpack bundle shape (muenchen.de bundle.js: 262KB on one line).
const MIN_JS = "/*! For license information please see bundle.js.LICENSE.txt */\n(()=>{var __webpack_modules__={" + "11:function(e,t,i){e.exports=function(e,t,i,n){return class extends i{constructor(t,i){super()}}}},".repeat(80) + "}})();";
const CSS = { "content-type": "text/css" };
const JS = { "content-type": "application/javascript" };

const HN_HTML = `<html lang="en" op="news"><head><meta name="referrer" content="origin"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" type="text/css" href="news.css?wfQ75QS9UtdHcfDAqQsg">
<link rel="icon" href="y18.svg"><title>Hacker News</title></head><body><center><table id="hnmain"><tr><td><img src="y18.svg" width="18" height="18" style="border:1px white solid; display:block"></td></tr><tr><td><img src="s.gif" height="10" width="0"></td></tr></table></center><script type="text/javascript" src="hn.js?wfQ75QS9UtdHcfDAqQsg"></script></body></html>`;
const HN_ROUTES: Record<string, Route> = {
  "https://news.ycombinator.com/news.css?wfQ75QS9UtdHcfDAqQsg": { body: HN_CSS, headers: CSS },
  "https://news.ycombinator.com/hn.js?wfQ75QS9UtdHcfDAqQsg": { body: HN_JS, headers: JS },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("filename fingerprint + content minification helpers", () => {
  it("recognises Vite/Rollup base64url hashes as well as hex hashes", () => {
    expect(isHashedAssetUrl("https://cdn.shopify.com/oxygen-v2/26673/17912/36975/3360882/assets/app-BIQp8M26.css")).toBe(true);
    expect(isHashedAssetUrl("https://static.linear.app/web/_next/static/css/Tpxbzi3N.css")).toBe(true);
    expect(isHashedAssetUrl("https://developer.mozilla.org/static/client/styles-global.b9d12c319ddb3888.css")).toBe(true);
    expect(isHashedAssetUrl("https://www.figma.com/_netlify/_next/static/chunks/polyfills-42372ed130431b0a.js")).toBe(true);
  });
  it("does not treat plain hand-named files as fingerprinted", () => {
    expect(isHashedAssetUrl("https://news.ycombinator.com/news.css?wfQ75QS9UtdHcfDAqQsg")).toBe(false);
    expect(isHashedAssetUrl("https://badssl.com/index.js")).toBe(false);
    expect(isHashedAssetUrl("https://developer.mozilla.org/static/client/styles-homepage.css")).toBe(false);
    expect(isHashedAssetUrl("https://wordpress.org/news/wp-content/themes/wporg-news-2021/style.css?ver=1791211150")).toBe(false);
  });
  it("judges content, not names", () => {
    expect(minificationOf(MIN_JS)).toBe("minified");
    expect(minificationOf(HN_CSS)).toBe("unminified");
    expect(minificationOf(".a{color:red}")).toBe("tiny");
  });
});

describe("css_appears_minified / js_appears_minified", () => {
  it("PASSes Vite-hashed CSS (hydrogen.shop) without calling it unminified", async () => {
    const calls = stubFetch({});
    const get = await run("https://hydrogen.shop/", `<html><head><link rel="preload" as="font" href="/fonts/brand.woff2" crossorigin><link rel="stylesheet" href="https://cdn.shopify.com/oxygen-v2/26673/17912/36975/3360882/assets/app-BIQp8M26.css"/></head><body></body></html>`);
    expect(get("css_appears_minified").status).toBe("PASS");
    // The preload/WOFF2 in the HTML means the font checks need no stylesheet read either, so any GET would be the minification check's.
    expect(calls.some((c) => c.startsWith("GET") && c.includes("app-BIQp8M26.css"))).toBe(false);
  });
  it("PASSes a first-party bundle.js?query whose content is minified (muenchen.de)", async () => {
    stubFetch({ "https://www.muenchen.de/themes/custom/muenchen/js/bundle.js?tlkp08": { body: MIN_JS, headers: JS } });
    const get = await run("https://www.muenchen.de/", `<html><head><script id="usercentrics-cmp" src="https://app.usercentrics.eu/browser-ui/latest/loader.js" async></script></head><body><script src="/themes/custom/muenchen/js/bundle.js?tlkp08"></script></body></html>`);
    expect(get("js_appears_minified").status).toBe("PASS");
  });
  it("still WARNs on genuinely unminified first-party CSS and JS (news.ycombinator.com)", async () => {
    stubFetch(HN_ROUTES);
    const get = await run("https://news.ycombinator.com/", HN_HTML, { "cache-control": "private; max-age=0" });
    expect(get("css_appears_minified").status).toBe("WARN");
    expect(get("css_appears_minified").detail).toContain("news.css");
    expect(get("js_appears_minified").status).toBe("WARN");
    expect(get("js_appears_minified").detail).toContain("hn.js");
  });
});

describe("render_blocking_scripts", () => {
  it("does not flag end-of-body scripts (HN) or nomodule polyfills (figma)", async () => {
    stubFetch(HN_ROUTES);
    expect((await run("https://news.ycombinator.com/", HN_HTML))("render_blocking_scripts").status).toBe("PASS");
    stubFetch({});
    const figma = `<html><head><script src="/_netlify/_next/static/chunks/polyfills-42372ed130431b0a.js" noModule=""></script><script src="/_netlify/_next/static/chunks/webpack-1a2b3c4d5e6f7a8b.js" async=""></script></head><body><main>Figma</main></body></html>`;
    expect((await run("https://www.figma.com/", figma))("render_blocking_scripts").status).toBe("PASS");
  });
  it("still flags synchronous scripts in <head> (badssl.com)", async () => {
    stubFetch({});
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>badssl.com</title><link rel="stylesheet" href="index.css"><script src="index.js"></script><script src="funky/funky.js"></script></head><body><div id="content"></div></body></html>`;
    const check = (await run("https://badssl.com/", html))("render_blocking_scripts");
    expect(check.status).toBe("WARN");
    expect(check.detail).toMatch(/^2 render-blocking/);
  });
});

describe("immutable_cache_assets", () => {
  it("reads the hashed asset, not the HTML document (docs.github.com)", async () => {
    stubFetch({ "https://docs.github.com/_next/static/css/bed97d901a6a23f3.css": { headers: { "cache-control": "public, max-age=31536000, immutable" } } });
    const get = await run("https://docs.github.com/en/rest", `<html><head><link rel="stylesheet" href="/_next/static/css/bed97d901a6a23f3.css"/></head><body><h1>GitHub REST API</h1></body></html>`, { "cache-control": "public, max-age=60" });
    expect(get("immutable_cache_assets").status).toBe("PASS");
  });
  it("still WARNs when the hashed asset lacks immutable (developer.mozilla.org)", async () => {
    stubFetch({ "https://developer.mozilla.org/static/client/styles-global.b9d12c319ddb3888.css": { headers: { "cache-control": "public, max-age=31536000" } } });
    const check = (await run("https://developer.mozilla.org/en-US/", `<html><head><link rel="stylesheet" href="/static/client/styles-global.b9d12c319ddb3888.css"/></head><body></body></html>`, { "cache-control": "public, max-age=3600" }))("immutable_cache_assets");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("styles-global.b9d12c319ddb3888.css");
  });
});

describe("next_gen_image_formats", () => {
  const IMG = "https://i.cbc.ca/ais/1.5521461,1740281144000/full/max/0/default.jpg";
  const page = `<html><body><img src="${IMG}" alt="news" loading="lazy"></body></html>`;
  it("PASSes when the image CDN negotiates AVIF behind a .jpg URL (cbc.ca)", async () => {
    stubFetch({ [IMG]: { headers: { "content-type": "image/avif" } } });
    expect((await run("https://www.cbc.ca/", page))("next_gen_image_formats").status).toBe("PASS");
  });
  it("PASSes a page with no raster images (HN: svg + gif only)", async () => {
    stubFetch(HN_ROUTES);
    expect((await run("https://news.ycombinator.com/", HN_HTML))("next_gen_image_formats").status).toBe("PASS");
  });
  it("still WARNs when JPEG is served even to AVIF/WebP-capable browsers", async () => {
    stubFetch({ [IMG]: { headers: { "content-type": "image/jpeg" } } });
    expect((await run("https://www.cbc.ca/", page))("next_gen_image_formats").status).toBe("WARN");
  });
});

describe("image_dimension_attributes / image_width_height", () => {
  it("ignores fill images that cannot shift layout (allbirds, next/image fill)", async () => {
    stubFetch({});
    const html = `<html><body>
      <img
        alt='Men&#39;s Tree Dasher 2 - Natural Black'
        class='pointer-events-none absolute inset-0 z-0 h-full w-full object-cover'
        src='//www.allbirds.co.uk/cdn/shop/files/a.png'>
      <img alt="Supabase Postgres database" decoding="async" data-nimg="fill" class="absolute inset-0 object-contain" style="position:absolute;height:100%;width:100%" src="/images/db.png">
      <img src="/logo.svg" width="120" height="32" alt="logo">
    </body></html>`;
    const get = await run("https://www.allbirds.co.uk/", html);
    expect(get("image_dimension_attributes").status).toBe("PASS");
    expect(get("image_width_height").status).toBe("PASS");
  });
  it("still WARNs on in-flow images without dimensions, without asserting CLS as fact (theguardian.com)", async () => {
    stubFetch({});
    const html = `<html><body><picture class="dcr-1rsklsq"><img alt="Zoe Williams" src="https://i.guim.co.uk/img/uploads/2017/10/09/Zoe-Williams,-L.png?width=98&amp;dpr=1&amp;s=none&amp;crop=1%3A1" class="dcr-1eant3z"/></picture><img alt="Research workers" src="https://i.guim.co.uk/img/media/fc1d/771.jpg?width=98&amp;dpr=1" loading="eager" class="dcr-sl8me3"/></body></html>`;
    const get = await run("https://www.theguardian.com/uk", html);
    expect(get("image_dimension_attributes").status).toBe("WARN");
    expect(get("image_dimension_attributes").detail).toMatch(/unless CSS already reserves/);
    expect(get("image_width_height").status).toBe("WARN");
    expect(get("image_width_height").detail).not.toMatch(/causing layout shift\.$/);
  });
});

describe("critical_css_inlined", () => {
  it("detects inline CSS that contains a '<' media range (Vercel/Astro page)", async () => {
    stubFetch({});
    const css = ".spinner[data-astro-cid-ijmsm3te]{flex-direction:column;justify-content:center;align-items:center;display:flex}".repeat(4) + "@media (width<=600px){body{height:100dvh;max-height:100dvh}}";
    const html = `<!DOCTYPE html><html lang="en"><head><title>Vercel Security Checkpoint</title><style>${css}</style></head><body></body></html>`;
    expect((await run("https://nextjs-boilerplate-five-plum-29.vercel.app/", html))("critical_css_inlined").status).toBe("PASS");
  });
  it("still WARNs when every stylesheet is external and nothing is inlined (bolt.new)", async () => {
    stubFetch({});
    const html = `<html><head><link rel="stylesheet" href="/assets/src-DXgMMW-9.css#"/><link rel="stylesheet" href="/assets/root-9vqqlNC4.css"/></head><body></body></html>`;
    expect((await run("https://bolt.new/", html))("critical_css_inlined").status).toBe("WARN");
  });
});

describe("lcp_fetchpriority_hint", () => {
  it("does not WARN when the page has no <img> at all (docs.github.com/en/rest)", async () => {
    stubFetch({});
    const check = (await run("https://docs.github.com/en/rest", `<html><body><h1>GitHub REST API documentation</h1><p>Create integrations.</p></body></html>`))("lcp_fetchpriority_hint");
    expect(check.status).not.toBe("WARN");
  });
  it("accepts unquoted fetchpriority=high", async () => {
    stubFetch({});
    expect((await run("https://example.org/", `<html><body><img src=/hero.jpg fetchpriority=high width=1200 height=600></body></html>`))("lcp_fetchpriority_hint").status).toBe("PASS");
  });
  it("still WARNs on an image-led page without the hint (zalando.de)", async () => {
    stubFetch({});
    const html = `<html><body><img draggable="false" class="mo6ZnF KLaowZ" alt="Frau in kariertem Mantel" src="https://img01.ztat.net/hero.jpg"></body></html>`;
    expect((await run("https://www.zalando.de/", html))("lcp_fetchpriority_hint").status).toBe("WARN");
  });
});

describe("font_preload_hint", () => {
  const WIKI_CSS_URL = "https://en.wikipedia.org/w/load.php?lang=en&modules=site.styles&only=styles&skin=vector-2022";
  const wiki = `<html><head><link rel="stylesheet" href="/w/load.php?lang=en&amp;modules=site.styles&amp;only=styles&amp;skin=vector-2022"></head><body></body></html>`;
  it("does not WARN a system-font page (en.wikipedia.org)", async () => {
    stubFetch({ [WIKI_CSS_URL]: { body: "body{font-family:sans-serif}".repeat(50) + ".mw-body h1{font-family:'Linux Libertine','Georgia','Times','Source Serif 4',serif}", headers: CSS } });
    expect((await run("https://en.wikipedia.org/wiki/Main_Page", wiki))("font_preload_hint").status).toBe("PASS");
  });
  it("accepts as=font before rel=preload", async () => {
    stubFetch({});
    const html = `<html><head><link as="font" href="/_next/static/media/7c42ed55a7834032-s.p.woff2" rel="preload" crossorigin="" type="font/woff2"/></head><body></body></html>`;
    expect((await run("https://www.figma.com/", html))("font_preload_hint").status).toBe("PASS");
  });
  it("still WARNs when a stylesheet declares @font-face without a preload (zalando.de)", async () => {
    stubFetch({ "https://mosaic01.ztat.net/base-assets/9-1-0/assets/style.css": { body: '@font-face {\n    font-family: "Tiempos";\n    src: url("https://mosaic02.ztat.net/zds/assets/fonts/Tiempos.woff2") format("woff2");\n}', headers: CSS } });
    const html = `<html><head><link rel="stylesheet" href="https://mosaic01.ztat.net/base-assets/9-1-0/assets/style.css"></head><body></body></html>`;
    expect((await run("https://www.zalando.de/", html))("font_preload_hint").status).toBe("WARN");
  });
});

describe("resource_hints_comprehensive", () => {
  it("counts modulepreload and dns-prefetch (allbirds.co.uk)", async () => {
    stubFetch({});
    const html = `<html><head><link rel="modulepreload" href="/cdn/shopifycloud/app.js"><link rel="preconnect" href="https://cdn.shopify.com" crossorigin><link rel="dns-prefetch" href="https://cdn.shopify.com"></head><body></body></html>`;
    expect((await run("https://www.allbirds.co.uk/", html))("resource_hints_comprehensive").status).toBe("PASS");
  });
  it("still WARNs a page with no hints at all (rakuten.co.jp)", async () => {
    stubFetch({});
    const html = `<html><head><link rel="canonical" href="https://www.rakuten.co.jp/"><link rel="stylesheet" href="https://r.r10s.jp/com/inc/home/20080930/css/common.css"></head><body></body></html>`;
    expect((await run("https://www.rakuten.co.jp/", html))("resource_hints_comprehensive").status).toBe("WARN");
  });
});
