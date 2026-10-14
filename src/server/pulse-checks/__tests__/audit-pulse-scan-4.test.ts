// @vitest-environment node
/**
 * Audit packet pulse-scan-4: findings reproduced against live sites (Oct 2026).
 *  - gov.uk scanned as "https://www.gov.uk/?utm_source=x#top" → robots.txt probed at
 *    "…#top/robots.txt" (the homepage) → false "No robots.txt".
 *  - stripe.com declares its sitemap in robots.txt (/sitemap/sitemap.xml) → false "No sitemap".
 *  - münchen.de: 72 H2/H3, no H1 → "No heading tags detected".
 *  - cal.com: Framer images with a valueless `alt` → 9/178 FAIL.
 *  - news.ycombinator.com: relative hrefs only → "Only 1 internal link".
 *  - has_word_count claimed a 300-word "recommendation" and "too thin for indexing".
 * The network is faked at the one SSRF-guarded transport; everything else is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import { runUrlChecks } from "@/server/pulse-scan";

const res = (status: number, body: string, contentType = "text/html; charset=utf-8") => {
  const r = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(r, "url", { value: "https://site.test/" });
  return r;
};

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const page = (body: string) =>
  `<!DOCTYPE html><html lang="en"><head><title>Site</title><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`;

function serve(home: string, files: Record<string, [number, string, string]> = {}): Route {
  return (url) => {
    const p = new URL(url).pathname;
    if (files[p]) return res(files[p][0], files[p][1], files[p][2]);
    if (p === "/") return res(200, home);
    return res(404, "<html><body>Not found</body></html>");
  };
}

async function scan(target = "https://site.test") {
  const out = await runUrlChecks(target, "MARKETING_SITE");
  return Object.fromEntries(out.checks.map((c) => [c.checkKey, c]));
}

beforeEach(() => { route = () => new Error("unset"); });

const HOME = page(`<h1>Welcome</h1><h2>About</h2><p>${words(400)}</p>`);

describe("robots.txt / sitemap are probed at the origin", () => {
  it("finds robots.txt and a robots-declared sitemap when the target has a query and fragment", async () => {
    route = serve(HOME, {
      "/robots.txt": [200, "Sitemap: https://site.test/sitemap/sitemap.xml\n\nUser-agent: *\nDisallow: /handoff\n", "text/plain; charset=utf-8"],
      "/sitemap/sitemap.xml": [200, '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://site.test/s1.xml</loc></sitemap></sitemapindex>', "application/xml"],
    });
    const c = await scan("https://site.test/?utm_source=x#top");
    expect(c.has_robots_txt.status).toBe("PASS");
    expect(c.has_sitemap.status).toBe("PASS");
    expect(c.has_sitemap.detail).toMatch(/declared in robots\.txt/);
  }, 60_000);

  it("still WARNs when neither file exists", async () => {
    route = serve(HOME);
    const c = await scan();
    expect(c.has_robots_txt.status).toBe("WARN");
    expect(c.has_sitemap.status).toBe("WARN");
  }, 60_000);

  it("does not pass a robots-declared sitemap that serves HTML", async () => {
    route = serve(HOME, {
      "/robots.txt": [200, "User-agent: *\nSitemap: https://site.test/missing.xml\n", "text/plain"],
    });
    const c = await scan();
    expect(c.has_robots_txt.status).toBe("PASS");
    expect(c.has_sitemap.status).toBe("WARN");
  }, 60_000);
});

describe("has_heading_hierarchy", () => {
  it("does not call a page with H2/H3 but no H1 'no headings'", async () => {
    route = serve(page(`<h2 class="teaser">Aktuelles</h2><h3>Veranstaltungen</h3><h3>Rathaus</h3><p>${words(400)}</p>`));
    const c = await scan();
    expect(c.has_heading_hierarchy.status).toBe("WARN");
    expect(c.has_heading_hierarchy.detail).not.toMatch(/No heading tags detected/);
  }, 60_000);

  it("still FAILs a page with no headings at all", async () => {
    route = serve(page(`<table><tr><td>${words(400)}</td></tr></table>`));
    const c = await scan();
    expect(c.has_heading_hierarchy.status).toBe("FAIL");
    expect(c.has_heading_hierarchy.detail).toMatch(/No heading tags detected/);
  }, 60_000);
});

describe("image_alt_coverage", () => {
  it("counts a valueless alt (Framer decorative image) as alt text", async () => {
    const framerImg = '<img decoding="async" width="500" height="500" src="https://framerusercontent.com/images/a.jpeg" alt style="display:block">';
    route = serve(page(`<h1>Cal</h1><h2>x</h2>${framerImg.repeat(8)}<img src="/b.png" alt="Logo"><p>${words(400)}</p>`));
    const c = await scan();
    expect(c.image_alt_coverage.status).toBe("PASS");
    expect(c.image_alt_coverage.detail).toMatch(/^9\/9 images/);
  }, 60_000);

  it("still FAILs images that have no alt attribute (and ignores data-alt)", async () => {
    const bare = "<img src='https://pss.bdstatic.com/static/superman/img/topnav/newfanyi-da0cea8f7e.png'/>";
    route = serve(page(`<h1>Baidu</h1><h2>x</h2>${bare.repeat(3)}<img src="/c.png" data-alt="x"><img src="/d.png" alt="ok"><p>${words(400)}</p>`));
    const c = await scan();
    expect(c.image_alt_coverage.status).toBe("FAIL");
    expect(c.image_alt_coverage.detail).toMatch(/^1\/5 images/);
  }, 60_000);
});

describe("internal_links_present", () => {
  it("counts relative hrefs (Hacker News shape) as internal links", async () => {
    const nav = ["news", "newest", "front", "newcomments", "ask", "show", "jobs", "submit", "login?goto=news", "item?id=50090369", "from?site=go.dev"]
      .map((h) => `<a href="${h}">${h}</a>`).join(" | ");
    route = serve(page(`<h1>HN</h1><h2>x</h2><a href="https://site.test"><img src="y18.svg" alt=""></a>${nav}<a href="https://go.dev/blog/http-connection-reuse">go</a><p>${words(400)}</p>`));
    const c = await scan();
    expect(c.internal_links_present.status).toBe("PASS");
  }, 60_000);

  it("still FAILs a page whose only links are external, mailto or fragments", async () => {
    route = serve(page(`<h1>Example Domain</h1><h2>x</h2><p>${words(400)}</p><a href="https://iana.org/domains/example">Learn more</a> <a href="mailto:hi@site.test">mail</a> <a href="#top">top</a> <a href="https://site.test.evil.example/x">x</a>`));
    const c = await scan();
    expect(c.internal_links_present.status).toBe("FAIL");
  }, 60_000);
});

describe("has_word_count", () => {
  it("does not invent an indexing threshold for a thin page, but still flags it", async () => {
    route = serve(page(`<h1>Get started</h1><h2>Deploy</h2><p>${words(24)}</p>`));
    const c = await scan();
    expect(c.has_word_count.status).toBe("FAIL");
    expect(c.has_word_count.detail).not.toMatch(/too thin for search engine indexing|recommended 300 words/);
  }, 60_000);

  it("does not cite a 300-word recommendation for a mid-length page", async () => {
    route = serve(page(`<h1>Shop</h1><h2>Items</h2><p>${words(140)}</p>`));
    const c = await scan();
    expect(c.has_word_count.status).toBe("WARN");
    expect(c.has_word_count.detail).not.toMatch(/recommended 300 words/);
  }, 60_000);

  it("leaves a content-rich page as PASS", async () => {
    route = serve(HOME);
    const c = await scan();
    expect(c.has_word_count.status).toBe("PASS");
  }, 60_000);
});
