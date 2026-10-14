import { afterEach, describe, expect, it, vi } from "vitest";
import { runAiAeoChecks } from "../ai-aeo";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

function context(html: string, hostname = "example.test"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

type Route = Response | (() => Response) | Error;

function stubFetch(routes: Record<string, Route>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    const route = routes[path];
    if (route instanceof Error) throw route;
    if (typeof route === "function") return route();
    if (route) return route.clone();
    return new Response("<!doctype html><html><body>Not found</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  }));
}

const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const find = (checks: { checkKey: string; status: string; detail?: string | null }[], key: string) =>
  checks.find((check) => check.checkKey === key)!;

const PAGE = "<!doctype html><html><body><main><p>Hello</p></main></body></html>";

afterEach(() => vi.unstubAllGlobals());

describe("aeo_ai_crawlers_allowed — only claim what robots.txt actually says", () => {
  it("does not claim ChatGPT/Perplexity invisibility when only training crawlers are blocked (zalando.de)", async () => {
    stubFetch({
      "/robots.txt": text("User-agent: ClaudeBot\nUser-agent: AI2Bot\nUser-agent: Bytespider\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"),
    });
    const check = find(await runAiAeoChecks(context(PAGE)), "aeo_ai_crawlers_allowed");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("gptbot");
    expect(check.detail).not.toContain("won't appear in ChatGPT, Claude or Perplexity");
    expect(check.detail).toContain("model training");
  });

  it("still warns about answer visibility when search bots are blocked (cbc.ca)", async () => {
    stubFetch({
      "/robots.txt": text("User-agent: GPTBot\nDisallow: /\n\nUser-agent: ChatGPT-User\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-Agent: PerplexityBot\nDisallow: /\n"),
    });
    const check = find(await runAiAeoChecks(context(PAGE)), "aeo_ai_crawlers_allowed");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("ChatGPT, Perplexity answers");
  });

  it("is INCONCLUSIVE when robots.txt answers 403 to Pulse, not 'No robots.txt found'", async () => {
    stubFetch({
      "/robots.txt": new Response("<!DOCTYPE html><title>Vercel Security Checkpoint</title>", { status: 403, headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    const check = find(await runAiAeoChecks(context(PAGE)), "aeo_ai_crawlers_allowed");
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.detail).toContain("HTTP 403");
  });

  it("still PASSes when robots.txt is genuinely absent (404)", async () => {
    stubFetch({});
    const check = find(await runAiAeoChecks(context(PAGE)), "aeo_ai_crawlers_allowed");
    expect(check.status).toBe("PASS");
    expect(check.detail).toContain("No robots.txt found");
  });
});

describe("aeo_llms_txt — a failed probe is not an absent file", () => {
  it("is INCONCLUSIVE when the llms.txt request fails", async () => {
    stubFetch({ "/llms.txt": new TypeError("fetch failed") });
    const check = find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt");
    expect(check.status).toBe("INCONCLUSIVE");
  });

  it("is INCONCLUSIVE on a 503", async () => {
    stubFetch({ "/llms.txt": text("Service Unavailable", 503) });
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("INCONCLUSIVE");
  });

  it("is INCONCLUSIVE when a WAF answers 403, and still WARNs on a 410", async () => {
    stubFetch({ "/llms.txt": new Response("<!DOCTYPE html><title>Vercel Security Checkpoint</title>", { status: 403, headers: { "content-type": "text/html" } }) });
    const blocked = find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt");
    expect(blocked.status).toBe("INCONCLUSIVE");
    expect(blocked.detail).toContain("HTTP 403");
    stubFetch({ "/llms.txt": text("Gone", 410) });
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("WARN");
  });

  it("PASSes a real text/plain llms.txt (squarespace.com body)", async () => {
    stubFetch({ "/llms.txt": text("# Squarespace\n\n> Squarespace is an all-in-one website-building and ecommerce platform. This\n> file indexes resources useful for answering questions about Squarespace\n") });
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("PASS");
  });

  it("still WARNs on a genuine 404 (cbc.ca) and on an HTML soft-200", async () => {
    stubFetch({});
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("WARN");
    stubFetch({ "/llms.txt": new Response("<!doctype html><html><body>App</body></html>", { headers: { "content-type": "text/html" } }) });
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("WARN");
  });

  it("does not PASS an app shell served as text/plain that starts with a comment", async () => {
    stubFetch({ "/llms.txt": text('\n<!-- build 42 -->\n<head><title>App</title></head><div id="root"></div>') });
    expect(find(await runAiAeoChecks(context(PAGE)), "aeo_llms_txt").status).toBe("WARN");
  });
});

describe("aeo_content_server_rendered — no client-side claim without a shell", () => {
  const EXAMPLE_COM = "<!doctype html><html lang=en><head><meta charset=utf-8><link rel=icon href=data:,><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Example Domain</title><style>html{color-scheme:light dark}</style></head><body><p>This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.</p><script src=/s.js></script></body></html>";

  it("does not tell a short static page (example.com) it renders client-side", async () => {
    stubFetch({});
    const check = find(await runAiAeoChecks(context(EXAMPLE_COM)), "aeo_content_server_rendered");
    expect(check.status).toBe("WARN");
    expect(check.detail).not.toContain("client-side.");
    expect(check.detail).toContain("no sign of client-side rendering");
  });

  it("is INCONCLUSIVE for a WAF denial body (rakuten.co.jp)", async () => {
    stubFetch({});
    const check = find(await runAiAeoChecks(context("Reference #18.0e0f0317.1792000607.3d3ec236")), "aeo_content_server_rendered");
    expect(check.status).toBe("INCONCLUSIVE");
  });

  it("still grades a short minified page with optional <html>/<body> stripped (not INCONCLUSIVE)", async () => {
    stubFetch({});
    const check = find(await runAiAeoChecks(context("<main><p>Undated statement.</p></main>")), "aeo_content_server_rendered");
    expect(check.status).toBe("WARN");
  });

  it("still warns about client-side rendering on a real SPA shell", async () => {
    stubFetch({});
    const shell = '<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>';
    const check = find(await runAiAeoChecks(context(shell)), "aeo_content_server_rendered");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("appears to render its content client-side");
  });

  it("still PASSes a content-rich server-rendered page", async () => {
    stubFetch({});
    const rich = `<!doctype html><html><body><main><p>${"scheduling ".repeat(150)}</p></main></body></html>`;
    expect(find(await runAiAeoChecks(context(rich)), "aeo_content_server_rendered").status).toBe("PASS");
  });
});

describe("aeo_citation_links — self-links are not citations", () => {
  it("does not PASS a page whose only absolute links point back at itself", async () => {
    stubFetch({});
    const html = '<html><body><nav><a href="https://www.theguardian.com/uk/news">News</a><a href="https://www.theguardian.com/uk/sport">Sport</a><a class="x" href="https://jobs.theguardian.com/">Jobs</a></nav></body></html>';
    expect(find(await runAiAeoChecks(context(html, "www.theguardian.com")), "aeo_citation_links").status).toBe("WARN");
  });

  it("still PASSes when the page links to other sites (Guardian footer)", async () => {
    stubFetch({});
    const html = '<html><body><a href="https://www.theguardian.com/uk/news">News</a><a href="https://theguardian.newspapers.com/">Digital archive</a><a href="https://uploads.guim.co.uk/2026/01/modern-slavery.pdf">Modern slavery statement</a></body></html>';
    expect(find(await runAiAeoChecks(context(html, "www.theguardian.com")), "aeo_citation_links").status).toBe("PASS");
  });
});
