import { afterEach, describe, expect, it, vi } from "vitest";

// Stylesheet reads go through fetchScannableUrl; route them to the stubbed global fetch so no test touches the network.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runPerformanceExtended } from "../performance-extended";
import type { ExtendedCheckContext } from "../_types";

type Route = { body?: string; headers?: Record<string, string>; status?: number };

function stubFetch(routes: Record<string, Route>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const route = routes[String(input)];
      if (!route) return new Response("not found", { status: 404 });
      return new Response(init?.method === "HEAD" ? null : route.body ?? "", { status: route.status ?? 200, headers: route.headers ?? {} });
    }),
  );
}

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test/" },
    httpsUrl: "https://example.test/",
    hostname: "example.test",
    platform: "MARKETING_SITE",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function woff2(html: string) {
  const checks = await runPerformanceExtended(context(html));
  const c = checks.find((x) => x.checkKey === "woff2_font_format");
  if (!c) throw new Error("missing woff2_font_format");
  return c;
}

const CSS = { "content-type": "text/css" };
// Real HN news.css shape: system font stack, no @font-face.
const HN_CSS = "body  { font-family:Verdana, Geneva, sans-serif; font-size:10pt; color:#828282; }\n".repeat(20);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("woff2_font_format truthfulness", () => {
  it("does not warn on a page with no web fonts at all (example.com: inline CSS only)", async () => {
    stubFetch({});
    const r = await woff2(`<html><head><title>Example Domain</title><style>body{font-family:-apple-system, system-ui, sans-serif}</style></head><body><h1>Example Domain</h1></body></html>`);
    expect(r.status).toBe("PASS");
    expect(r.detail).not.toMatch(/No WOFF2 fonts detected/);
  });

  it("does not warn when the linked stylesheet uses system fonts (news.ycombinator.com)", async () => {
    stubFetch({ "https://example.test/news.css?wfQ75QS9UtdHcfDAqQsg": { body: HN_CSS, headers: CSS } });
    const r = await woff2(`<html><head><link rel="stylesheet" type="text/css" href="news.css?wfQ75QS9UtdHcfDAqQsg"></head><body></body></html>`);
    expect(r.status).toBe("PASS");
  });

  it("is INCONCLUSIVE, not PASS, when the linked stylesheet cannot be read", async () => {
    stubFetch({});
    const r = await woff2(`<html><head><link rel="stylesheet" type="text/css" href="news.css?wfQ75QS9UtdHcfDAqQsg"></head><body></body></html>`);
    expect(r.status).toBe("INCONCLUSIVE");
  });

  it("still warns when an external stylesheet declares only a TTF font (WordPress theme)", async () => {
    stubFetch({ "https://example.test/wp-content/themes/x/style.css": { body: '@font-face{font-family:Brand;src:url(fonts/brand.ttf) format("truetype")}', headers: CSS } });
    const r = await woff2(`<html><head><link rel="stylesheet" href="/wp-content/themes/x/style.css"></head><body></body></html>`);
    expect(r.status).toBe("WARN");
  });

  it("still passes when WOFF2 is referenced (figma.com style)", async () => {
    stubFetch({});
    const r = await woff2(`<link rel="preload" href="/_netlify/_next/static/media/7c42ed55a7834032-s.p.woff2" as="font" crossorigin="" type="font/woff2"/>`);
    expect(r.status).toBe("PASS");
    expect(r.detail).toMatch(/WOFF2 font format detected/);
  });

  it("still warns when only legacy WOFF/TTF fonts are referenced", async () => {
    stubFetch({});
    const r = await woff2(`<style>@font-face{font-family:Brand;src:url(/fonts/brand.woff) format("woff"),url(/fonts/brand.ttf) format("truetype")}</style>`);
    expect(r.status).toBe("WARN");
    expect(r.detail).toMatch(/Legacy font formats/);
  });

  it("warns on a legacy font embedded as a data: URI with no format() hint", async () => {
    stubFetch({});
    const r = await woff2(`<style>@font-face{font-family:Brand;src:url(data:application/font-woff;base64,d09GRgABAAAAA)}</style>`);
    expect(r.status).toBe("WARN");
  });

  it("passes when WOFF2 is offered alongside a WOFF fallback", async () => {
    stubFetch({});
    const r = await woff2(`<style>@font-face{font-family:Brand;src:url(/fonts/brand.woff2) format("woff2"),url(/fonts/brand.woff) format("woff")}</style>`);
    expect(r.status).toBe("PASS");
  });

  it("passes Google Fonts, which negotiates WOFF2 per browser (it would serve TTF to our probe's user-agent)", async () => {
    stubFetch({ "https://fonts.googleapis.com/css2?family=Inter&display=swap": { body: "@font-face{font-family:'Inter';src:url(https://fonts.gstatic.com/s/inter/v13/x.ttf) format('truetype')}", headers: CSS } });
    const r = await woff2(`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap" rel="stylesheet"></head><body></body></html>`);
    expect(r.status).toBe("PASS");
  });
});
