import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSeoExtended } from "../seo-extended";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

function context(html: string, origin = "https://example.test"): ExtendedCheckContext {
  const hostname = new URL(origin).hostname;
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: origin },
    httpsUrl: origin,
    hostname,
    platform: "MARKETING_SITE",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

const find = (checks: { checkKey: string; status: string; detail?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key);

function stubFetch(routes: Record<string, { body: string; type: string }> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const r = routes[String(url)];
    if (r) return new Response(r.body, { status: 200, headers: { "content-type": r.type } });
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }));
}

beforeEach(() => stubFetch());
afterEach(() => vi.unstubAllGlobals());

describe("organization_schema recognises Organization subtypes", () => {
  it("passes an OnlineStore (MercadoLivre homepage)", async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"OnlineStore","name":"Mercado Livre","url":"https://www.mercadolivre.com.br"}</script>`;
    const checks = await runSeoExtended(context(html, "https://www.mercadolivre.com.br"));
    expect(find(checks, "organization_schema")?.status).toBe("PASS");
  });

  it("still warns on WebPage/BreadcrumbList-only markup (target.com homepage)", async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Target : Expect More. Pay Less.","url":"https://www.target.com/","breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@id":"https://www.target.com/","name":"Homepage"}}]}}</script>`;
    const checks = await runSeoExtended(context(html, "https://www.target.com"));
    expect(find(checks, "organization_schema")?.status).toBe("WARN");
  });
});

describe("sitemap_index probes /sitemap.xml for a real <sitemapindex>", () => {
  it("passes when /sitemap.xml is a sitemap index (webflow.com)", async () => {
    stubFetch({
      "https://webflow.com/sitemap.xml": {
        type: "application/xml; charset=utf-8",
        body: `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://webflow.com/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
      },
    });
    const checks = await runSeoExtended(context("<html></html>", "https://webflow.com"));
    expect(find(checks, "sitemap_index")?.status).toBe("PASS");
  });

  it("still warns when /sitemap.xml is a plain urlset (squarespace.com), without claiming Google requires an index", async () => {
    stubFetch({
      "https://www.squarespace.com/sitemap.xml": {
        type: "text/xml;charset=utf-8",
        body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.squarespace.com/</loc></url></urlset>`,
      },
    });
    const checks = await runSeoExtended(context("<html></html>", "https://www.squarespace.com"));
    const c = find(checks, "sitemap_index");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/required by Google/i);
  });
});

describe("canonical_self_referencing ignores attribute order", () => {
  it("passes an href-first canonical (anthropic.com)", async () => {
    const html = `<head><link href="https://www.anthropic.com" rel="canonical"/></head>`;
    const checks = await runSeoExtended(context(html, "https://www.anthropic.com"));
    expect(find(checks, "canonical_self_referencing")?.status).toBe("PASS");
  });

  it("still passes rel-first (cbc.ca) and still warns when there is no canonical (example.com)", async () => {
    const cbc = await runSeoExtended(context(`<link data-rh="true" rel="canonical" href="https://www.cbc.ca/"/>`, "https://www.cbc.ca"));
    expect(find(cbc, "canonical_self_referencing")?.status).toBe("PASS");
    const ex = await runSeoExtended(context(`<html><head><title>Example Domain</title></head><body><a href="https://iana.org/domains/example">Learn more</a></body></html>`, "https://example.com"));
    const c = find(ex, "canonical_self_referencing");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/No self-referencing canonical/);
  });

  it("warns on a cross-host canonical without claiming the tag is missing (notion.so)", async () => {
    const checks = await runSeoExtended(context(`<link rel="canonical" href="https://www.notion.com/" data-next-head=""/>`, "https://www.notion.so"));
    const c = find(checks, "canonical_self_referencing");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toContain("https://www.notion.com/");
    expect(c?.detail).not.toMatch(/^No self-referencing canonical/);
  });
});

describe("internal_link_depth counts absolute same-host nav links", () => {
  it("passes a nav of absolute same-host links (anthropic.com)", async () => {
    const html = `<nav><a href="https://www.anthropic.com/research">Research</a><a href="https://www.anthropic.com/research/team/alignment">Alignment</a></nav>`;
    const checks = await runSeoExtended(context(html, "https://www.anthropic.com"));
    expect(find(checks, "internal_link_depth")?.status).toBe("PASS");
  });

  it("still warns when nav has only anchors, external or homepage links, or there is no nav", async () => {
    const html = `<nav><a href="#main">Skip</a><a href="https://twitter.com/example">Twitter</a><a href="/">Home</a><a href="mailto:hi@example.test">Email</a></nav>`;
    const checks = await runSeoExtended(context(html));
    expect(find(checks, "internal_link_depth")?.status).toBe("WARN");
    const none = await runSeoExtended(context(`<body><a href="https://iana.org/domains/example">Learn more</a></body>`, "https://example.com"));
    expect(find(none, "internal_link_depth")?.status).toBe("WARN");
  });
});
