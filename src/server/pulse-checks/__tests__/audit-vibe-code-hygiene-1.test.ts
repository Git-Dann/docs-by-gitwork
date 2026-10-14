import { describe, it, expect, vi, beforeEach } from "vitest";

const { headMock } = vi.hoisted(() => ({ headMock: vi.fn<(url: string) => Promise<number>>() }));

vi.mock("../_types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_types")>();
  return { ...actual, headRequest: vi.fn((url: string) => headMock(url)) };
});

import { runVibeCodeHygieneChecks } from "../vibe-code-hygiene";
import type { ExtendedCheckContext } from "../_types";
import { reclassifySpaChecks } from "@/server/pulse-lite/spa-detect";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "../categories";

function ctxFor(url: string, html: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }): ExtendedCheckContext {
  const u = new URL(url);
  return {
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 120, finalUrl: url },
    httpsUrl: url,
    hostname: u.hostname,
    platform: "MARKETING_SITE",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function run(url: string, html: string, headers?: Record<string, string>) {
  const checks = await runVibeCodeHygieneChecks(ctxFor(url, html, headers));
  return (key: string) => checks.find((c) => c.checkKey === key);
}

const page = (body: string, title = "Acme — Home") =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>Acme</h1><p>Real server-rendered copy about the product and what it does for teams.</p>${body}</main></body></html>`;

beforeEach(() => {
  headMock.mockReset();
  headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent-path-404") ? 404 : 200));
});

describe("spa_client_rendered is not rewritten to INCONCLUSIVE by the SPA reclassifier", () => {
  it("keeps the shell finding WARN while still reclassifying parse-dependent checks", () => {
    const input: PulseScanCheckInput[] = [
      { category: CATEGORIES.VIBE_HYGIENE, checkKey: "spa_client_rendered", label: "Content is server-rendered", status: "WARN", detail: "This is a client-rendered SPA" },
      { category: CATEGORIES.SEO, checkKey: "h1_present", label: "H1", status: "FAIL", detail: "No H1" },
    ];
    const out = reclassifySpaChecks(input);
    expect(out[0].status).toBe("WARN");
    expect(out[0].detail).not.toMatch(/Not assessable/);
    expect(out[1].status).toBe("INCONCLUSIVE");
  });
});

describe("vibe_placeholder_content", () => {
  it("a TODO inside an inline script comment (baidu) is a WARN, not a placeholder-content FAIL", async () => {
    const html = page(`<script>window.__initData__ = { commContent: {\n // TODO: 首页和结果页的实验变量不一样，异步能更新吗？待check\n resultPage: 0 } };</script>`);
    const get = await run("https://www.example-baidu-like.test", html);
    expect(get("vibe_placeholder_content")?.status).toBe("WARN");
    expect(get("vibe_placeholder_content")?.detail).toMatch(/developer comment/);
  });
  it("a TODO in visible text is still a FAIL", async () => {
    const get = await run("https://www.acme.test", page("<section><p>TODO: write the pricing copy</p></section>"));
    expect(get("vibe_placeholder_content")?.status).toBe("FAIL");
    expect(get("vibe_placeholder_content")?.detail).toMatch(/TODO\/FIXME marker/);
  });
  it("lorem ipsum is still a FAIL and a clean page passes", async () => {
    expect((await run("https://www.acme.test", page("<p>Lorem ipsum dolor sit amet</p>")))("vibe_placeholder_content")?.status).toBe("FAIL");
    expect((await run("https://www.acme.test", page("")))("vibe_placeholder_content")?.status).toBe("PASS");
  });
});

describe("vibe_default_title", () => {
  it("an empty 204 GraphQL response is not called a framework scaffold default", async () => {
    const get = await run("https://countries.trevorblades.com/graphql", "", { "access-control-allow-origin": "*", "x-powered-by": "Stellate" });
    expect(get("vibe_default_title")?.status).toBe("NOT_APPLICABLE");
    expect(get("vibe_default_title")?.detail).not.toMatch(/scaffold/);
  });
  it("Create Next App still WARNs as a scaffold default", async () => {
    const get = await run("https://nextjs-boilerplate-five-plum-29.vercel.app", page("", "Create Next App"));
    expect(get("vibe_default_title")?.status).toBe("WARN");
    expect(get("vibe_default_title")?.detail).toMatch(/create next app/);
  });
  it("an HTML page with no <title> still WARNs, worded as missing", async () => {
    const get = await run("https://www.acme.test", "<!doctype html><html><head></head><body><p>Hi there friends</p></body></html>");
    expect(get("vibe_default_title")?.status).toBe("WARN");
    expect(get("vibe_default_title")?.detail).toMatch(/no <title>/);
  });
});

describe("vibe_no_custom_404", () => {
  it("probes the origin path, not a path appended after the query/fragment (gov.uk)", async () => {
    headMock.mockImplementation(async (url: string) => (url === "https://www.gov.uk/pulse-check-nonexistent-path-404" ? 404 : 200));
    const get = await run("https://www.gov.uk/?utm_source=x#top", page(""));
    expect(headMock).toHaveBeenCalledWith("https://www.gov.uk/pulse-check-nonexistent-path-404");
    expect(get("vibe_no_custom_404")?.status).toBe("PASS");
  });
  it("a real soft-200 catch-all still WARNs, without claiming the homepage is shown", async () => {
    headMock.mockImplementation(async () => 200);
    const get = await run("https://gitwork.co.uk", page(""));
    expect(get("vibe_no_custom_404")?.status).toBe("WARN");
    expect(get("vibe_no_custom_404")?.detail).not.toMatch(/see the homepage/);
  });
  it("a failed probe is INCONCLUSIVE, not WARN", async () => {
    headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent") ? 0 : 200));
    expect((await run("https://www.acme.test", page("")))("vibe_no_custom_404")?.status).toBe("INCONCLUSIVE");
  });
});

describe("vibe_empty_alt_images", () => {
  it("decorative alt=\"\" images (stripe) are not reported as missing alt text", async () => {
    const imgs = [
      '<img src="https://b.stripecdn.com/mkt-ssr-statics/assets/_next/static/media/wave-fallback-desktop-1x.fba6fa88.webp" alt="" aria-hidden="true"/>',
      '<img loading="lazy" width="1720" height="1352" alt="" srcSet="https://images.stripeassets.com/payment-bento-background.jpg?w=860 1x"/>',
      '<img loading="lazy" width="1104" height="1506" alt="" srcSet="https://images.stripeassets.com/wave_crop.jpg?w=296 296w"/>',
      '<img loading="lazy" width="2464" height="900" alt="" srcSet="https://images.stripeassets.com/connect-bento-card-background-image.jpg?w=1232 1x"/>',
    ].join("");
    const get = await run("https://stripe.com", page(imgs));
    expect(get("vibe_empty_alt_images")?.status).toBe("PASS");
    expect(get("vibe_empty_alt_images")?.detail).toMatch(/4 marked decorative/);
  });
  it("images with no alt attribute (including data-alt only) still WARN", async () => {
    const imgs = [
      '<img src="/hero.png">',
      '<img src="/team.jpg" data-alt="team">',
      '<img src="/product.webp" class="shot">',
      '<img src="/logo.svg" alt="Acme">',
    ].join("");
    const get = await run("https://www.acme.test", page(imgs));
    expect(get("vibe_empty_alt_images")?.status).toBe("WARN");
    expect(get("vibe_empty_alt_images")?.detail).toMatch(/^3 of 4 images have no alt attribute/);
  });
});

describe("vibe_broken_links", () => {
  const nav = '<nav><a href="/account">Account</a><a href="/collections/all">Shop</a><a href="/products/snowboard">Snowboard</a></nav>';
  it("a bot-protection 406 (hydrogen.shop/account) is unverified, not broken", async () => {
    headMock.mockImplementation(async (url: string) => (url.endsWith("/account") ? 406 : url.includes("pulse-check-nonexistent") ? 404 : 200));
    const get = await run("https://hydrogen.shop", page(nav));
    expect(get("vibe_broken_links")?.status).toBe("INCONCLUSIVE");
    expect(get("vibe_broken_links")?.detail).not.toMatch(/are broken/);
  });
  it("timeouts on every link (status 0) never produce a FAIL", async () => {
    headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent") ? 404 : 0));
    const get = await run("https://www.acme.test", page('<a href="/fr">fr</a><a href="/de">de</a><a href="/feature/design">d</a><a href="/pricing">p</a>'));
    expect(get("vibe_broken_links")?.status).toBe("INCONCLUSIVE");
  });
  it("a real 404 (gov.uk opensearch.xml) still WARNs with evidence", async () => {
    headMock.mockImplementation(async (url: string) => (url.endsWith("/search/opensearch.xml") || url.includes("pulse-check-nonexistent") ? 404 : 200));
    const html = page('<link title="Search" rel="search" type="application/opensearchdescription+xml" href="/search/opensearch.xml"><a href="/browse/benefits">Benefits</a><a href="/browse/tax">Tax</a>');
    const get = await run("https://www.gov.uk", html);
    expect(get("vibe_broken_links")?.status).toBe("WARN");
    expect(get("vibe_broken_links")?.evidence).toBe("https://www.gov.uk/search/opensearch.xml");
  });
  it("more than two real 404s still FAIL, and all-200 still PASSes", async () => {
    headMock.mockImplementation(async (url: string) => (url.includes("/gone") || url.includes("pulse-check-nonexistent") ? 404 : 200));
    const failing = await run("https://www.acme.test", page('<a href="/gone1">a</a><a href="/gone2">b</a><a href="/gone3">c</a><a href="/ok">d</a>'));
    expect(failing("vibe_broken_links")?.status).toBe("FAIL");
    const passing = await run("https://www.acme.test", page('<a href="/ok">d</a><a href="/about">e</a>'));
    expect(passing("vibe_broken_links")?.status).toBe("PASS");
  });
});
