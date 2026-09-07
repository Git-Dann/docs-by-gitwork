import { afterEach, describe, expect, it, vi } from "vitest";
import { runAiAeoChecks } from "../ai-aeo";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

function statusOf(checks: { checkKey: string; status: string }[], key: string) {
  return checks.find((check) => check.checkKey === key)?.status;
}

afterEach(() => vi.unstubAllGlobals());

describe("AEO page evidence", () => {
  it("recognises independently verifiable citation and discovery signals", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml", { headers: { "content-type": "text/plain" } });
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }));

    const checks = await runAiAeoChecks(context(`
      <link href="https://example.test/article" rel="canonical">
      <link hreflang="en" href="https://example.test/article" rel="alternate">
      <article><h2>How does the audit work?</h2><time datetime="2026-07-30">Today</time>
      <p>Evidence is collected from the live surface.</p>
      <a href="https://www.w3.org/TR/html/">HTML standard</a>
      <a href="https://www.rfc-editor.org/">RFC index</a></article>
    `));

    for (const key of ["aeo_canonical", "aeo_language_alternates", "aeo_question_answer", "aeo_citation_links", "aeo_content_freshness", "aeo_sitemap"]) {
      expect(statusOf(checks, key)).toBe("PASS");
    }
  });

  it("does not infer citations or freshness when page evidence is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404, headers: { "content-type": "text/plain" } })));
    const checks = await runAiAeoChecks(context("<main><p>Undated statement.</p></main>"));
    expect(statusOf(checks, "aeo_citation_links")).toBe("WARN");
    expect(statusOf(checks, "aeo_content_freshness")).toBe("WARN");
  });
});
