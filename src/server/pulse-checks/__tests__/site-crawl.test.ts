import { describe, expect, it } from "vitest";
import {
  analysePage,
  classifyPage,
  evaluateSiteCrawl,
  isChallengePage,
  isSameSite,
  normaliseCandidate,
  pageKind,
  parseRobots,
  robotsAllows,
  sameDocument,
  selectPages,
  siteCrawlUnavailable,
  SITE_CRAWL_KEYS,
  sitemapLocs,
  type CrawlObservation,
  type CrawledPage,
  type FetchedPage,
} from "../site-crawl";

const HOME = "https://www.example.com/";

const SECURE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "strict-transport-security": "max-age=63072000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

/** A realistic page: nav, footer, its own main content. */
function html(opts: {
  title?: string | null;
  description?: string | null;
  lang?: string | null;
  viewport?: boolean;
  canonical?: string;
  noindex?: boolean;
  body?: string;
  head?: string;
}): string {
  const title = opts.title === null ? "" : `<title>${opts.title ?? "Page"}</title>`;
  const desc = opts.description === null ? "" : `<meta name="description" content="${opts.description ?? "A page"}">`;
  const lang = opts.lang === null ? "" : ` lang="${opts.lang ?? "en"}"`;
  return `<!doctype html><html${lang}><head><meta charset="utf-8">${opts.viewport === false ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1">'}${title}${desc}${opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : ""}${opts.noindex ? '<meta name="robots" content="noindex, follow">' : ""}${opts.head ?? ""}</head>
<body><nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/about">About</a><a href="/blog">Blog</a></nav>
<main>${opts.body ?? "<p>Content</p>"}</main><footer>Example Ltd, registered in England. Privacy. Terms.</footer></body></html>`;
}

function page(url: string, body: string, extra: Partial<FetchedPage> = {}): FetchedPage {
  return { url, finalUrl: url, status: 200, contentType: "text/html; charset=utf-8", headers: { ...SECURE_HEADERS }, body, ...extra };
}

const homeBody = html({ title: "Example: tools for teams", description: "Example builds tools for teams", body: "<h1>Tools for teams</h1><p>Plan, build and ship with Example. Trusted by product teams everywhere for planning work.</p>" });

function distinct(path: string, words: string, extra: Parameters<typeof html>[0] = {}): string {
  return html({ title: `${words} | Example`, description: `${words} at Example`, body: `<h1>${words}</h1><p>${words} explained in detail with unique wording about ${path} and nothing else ${words.repeat(3)}</p>`, ...extra });
}

function crawled(url: string, body: string, extra: Partial<FetchedPage> = {}, kind: CrawledPage["kind"] = null): CrawledPage {
  return { fetch: page(url, body, extra), kind, source: "link" };
}

function observation(over: Partial<CrawlObservation> = {}): CrawlObservation {
  return {
    home: page(HOME, homeBody),
    pages: [
      crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans"), {}, "pricing"),
      crawled("https://www.example.com/about", distinct("about", "About our company"), {}, "about"),
      crawled("https://www.example.com/blog/launch", distinct("launch", "Launch announcement"), {}, "article"),
    ],
    catchAll: { status: 404, body: "<html><title>Not found</title></html>" },
    linkChecks: [
      { url: "https://www.example.com/pricing", status: 200, from: [HOME] },
      { url: "https://www.example.com/about", status: 200, from: [HOME] },
    ],
    linksFound: 2,
    sitemap: { read: true, urlCount: 3, checks: [{ url: "https://www.example.com/pricing", status: 200 }, { url: "https://www.example.com/about", status: 200 }] },
    robotsBlocked: 0,
    budgetExhausted: false,
    ...over,
  };
}

const byKey = (checks: ReturnType<typeof evaluateSiteCrawl>) => Object.fromEntries(checks.map((c) => [c.checkKey, c]));

// ── URLs and selection ──────────────────────────────────────────────────────

describe("same site and candidates", () => {
  it("treats www and the apex as one site, and other subdomains as different", () => {
    expect(isSameSite("https://example.com/pricing", HOME)).toBe(true);
    expect(isSameSite("https://www.example.com/x", "https://example.com/")).toBe(true);
    expect(isSameSite("https://app.example.com/login", HOME)).toBe(false);
    expect(isSameSite("https://example.com.evil.net/", HOME)).toBe(false);
  });

  it("drops assets, mail links, fragments, sign-out and admin paths; keeps pages", () => {
    expect(normaliseCandidate("/pricing#plans", HOME, HOME)).toBe("https://www.example.com/pricing");
    expect(normaliseCandidate("/brochure.pdf", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("mailto:hi@example.com", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("tel:+441234", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("#top", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("/logout", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("/wp-admin/edit.php", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("https://other.com/x", HOME, HOME)).toBeNull();
    expect(normaliseCandidate("/about?utm_source=x", HOME, HOME)).toBe("https://www.example.com/about");
  });

  it("classifies pages a reviewer would pick", () => {
    expect(pageKind("https://x.com/pricing")).toBe("pricing");
    expect(pageKind("https://x.com/blog/hello-world")).toBe("article");
    expect(pageKind("https://x.com/blog")).toBe("blog");
    expect(pageKind("https://x.com/sign-up")).toBe("signup");
    expect(pageKind("https://x.com/careers/role")).toBeNull();
  });

  it("puts priority pages first, then shallow homepage links before sitemap entries", () => {
    const { selected } = selectPages(
      [
        { url: "https://www.example.com/careers/engineer/senior", source: "link" },
        { url: "https://www.example.com/legal", source: "link" },
        { url: "https://www.example.com/deep/sitemap/only", source: "sitemap" },
        { url: "https://example.com/pricing", source: "sitemap" },
        { url: "https://www.example.com/contact", source: "link" },
        { url: "https://www.example.com/pricing/", source: "link" },
      ],
      HOME,
      4,
      null,
    );
    expect(selected.map((s) => s.url)).toEqual([
      "https://www.example.com/pricing/",
      "https://www.example.com/contact",
      "https://www.example.com/legal",
      "https://www.example.com/careers/engineer/senior",
    ]);
  });

  it("skips the homepage with a query string (gnu.org's ?distro= links)", () => {
    const { selected } = selectPages([{ url: "/?distro=guix", source: "link" }, { url: "/about", source: "link" }], HOME, 5, null);
    expect(selected.map((s) => s.url)).toEqual(["https://www.example.com/about"]);
  });

  it("never selects the homepage again or a duplicate", () => {
    const { selected } = selectPages([{ url: "/", source: "link" }, { url: "https://example.com/", source: "sitemap" }, { url: "/a", source: "link" }, { url: "/a/", source: "link" }], HOME, 10, null);
    expect(selected.map((s) => s.url)).toEqual(["https://www.example.com/a"]);
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(`User-agent: Googlebot\nDisallow: /nothing-for-google\n\nUser-agent: *\nDisallow: /private/\nDisallow: /*.json$\nAllow: /private/open\n`);

  it("honours Disallow for every crawler", () => {
    expect(robotsAllows(rules, "/private/secret")).toBe(false);
    expect(robotsAllows(rules, "/data.json")).toBe(false);
  });
  it("lets a longer Allow win and ignores other crawlers' groups", () => {
    expect(robotsAllows(rules, "/private/open/page")).toBe(true);
    expect(robotsAllows(rules, "/nothing-for-google")).toBe(true);
    expect(robotsAllows(rules, "/pricing")).toBe(true);
  });
  it("an empty Disallow allows everything", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "/anything")).toBe(true);
  });
  it("selection skips disallowed pages and counts them", () => {
    const { selected, robotsBlocked } = selectPages([{ url: "/private/x", source: "link" }, { url: "/pricing", source: "link" }], HOME, 5, rules);
    expect(selected.map((s) => s.url)).toEqual(["https://www.example.com/pricing"]);
    expect(robotsBlocked).toBe(1);
  });
});

describe("sitemaps", () => {
  it("reads <loc> entries, CDATA and entities included", () => {
    expect(sitemapLocs("<urlset><url><loc>https://x.com/a?b=1&amp;c=2</loc></url><url><loc><![CDATA[https://x.com/b]]></loc></url></urlset>"))
      .toEqual(["https://x.com/a?b=1&c=2", "https://x.com/b"]);
  });
});

// ── What a page is ──────────────────────────────────────────────────────────

describe("classifying a fetched page", () => {
  const home = page(HOME, homeBody);
  const ctx = { home, catchAllBody: null };

  it("a real distinct page is a page", () => {
    expect(classifyPage(page("https://www.example.com/pricing", distinct("pricing", "Pricing plans")), ctx)).toBe("page");
  });

  it("a path that answers 200 with the homepage is a soft 404, not a page", () => {
    // vercel.com-style: same document, only a nonce differs.
    const echo = homeBody.replace("<head>", '<head><script nonce="abc123"></script>');
    expect(classifyPage(page("https://www.example.com/pricing", echo), ctx)).toBe("soft_404");
  });

  it("a page matching the random-path catch-all answer is a soft 404", () => {
    const shell = '<!doctype html><html lang="en"><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(classifyPage(page("https://www.example.com/pricing", shell), { home, catchAllBody: shell })).toBe("shell_echo");
  });

  it("a page matching a branded 200 'not found' page is a soft 404", () => {
    const notFound = html({ title: "Page not found | Example", body: "<h1>Sorry, we could not find that page</h1><p>Try the homepage instead.</p>" });
    expect(classifyPage(page("https://www.example.com/old-offer", notFound), { home, catchAllBody: notFound })).toBe("soft_404");
    // Same template, its own content: still a page.
    expect(classifyPage(page("https://www.example.com/pricing", distinct("pricing", "Pricing plans")), { home, catchAllBody: notFound })).toBe("page");
  });

  it("a redirect that lands on the homepage is not a page", () => {
    expect(classifyPage(page("https://www.example.com/old", homeBody, { finalUrl: HOME }), ctx)).toBe("redirect_home");
  });

  it("bot walls and refusals are unreadable, never pages and never findings", () => {
    const cf = "<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";
    expect(classifyPage(page("https://www.example.com/pricing", cf, { status: 403 }), ctx)).toBe("challenge");
    expect(classifyPage(page("https://www.example.com/pricing", cf), ctx)).toBe("challenge");
    expect(classifyPage(page("https://www.example.com/pricing", "", { status: 429 }), ctx)).toBe("unreadable");
    expect(classifyPage(page("https://www.example.com/pricing", "", { status: 0 }), ctx)).toBe("failed");
    expect(classifyPage(page("https://www.example.com/pricing", "", { status: 404 }), ctx)).toBe("not_found");
  });

  it("a page with the same template but its own content is not the same document", () => {
    expect(sameDocument(homeBody, distinct("about", "About our company"))).toBe(false);
  });

  it("recognises Akamai-style access denied and Cloudflare challenge headers", () => {
    expect(isChallengePage({ status: 403, body: "<html><head><title>Access Denied</title></head><body>Reference #18.abc</body></html>", headers: {} })).toBe(true);
    expect(isChallengePage({ status: 200, body: "<html></html>", headers: { "cf-mitigated": "challenge" } })).toBe(true);
    expect(isChallengePage({ status: 200, body: homeBody, headers: {} })).toBe(false);
  });
});

// ── Reading markup ──────────────────────────────────────────────────────────

describe("analysePage", () => {
  it("finds active and passive mixed content, but not plain <a> links or text in scripts", () => {
    const a = analysePage(html({
      head: '<script src="http://cdn.old.com/lib.js"></script><link rel="stylesheet" href="http://cdn.old.com/s.css"><link rel="preconnect" href="http://fonts.example">',
      body: '<img src="http://img.old.com/a.png" alt="a"><a href="http://other.com/">link</a><script>var u = "<script src=\\"http://x.com/y.js\\">"</script>',
    }));
    expect(a.activeMixed).toEqual(["http://cdn.old.com/lib.js", "http://cdn.old.com/s.css"]);
    expect(a.passiveMixed).toEqual(["http://img.old.com/a.png"]);
  });

  it("counts images with no alt, but not alt=\"\" decorative images or tracking pixels", () => {
    const a = analysePage(html({ body: '<img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="C"><img src="/p.gif" width="1" height="1"><img src="/d.png" aria-hidden="true">' }));
    expect(a.images).toBe(3);
    expect(a.imagesMissingAlt).toBe(1);
  });

  it("reads noindex from meta robots and from a general X-Robots-Tag, not a crawler-scoped one", () => {
    expect(analysePage(html({ noindex: true })).noindex).toBe(true);
    expect(analysePage(html({}), { "x-robots-tag": "noindex" }).noindex).toBe(true);
    expect(analysePage(html({}), { "x-robots-tag": "otherbot: noindex" }).noindex).toBe(false);
    expect(analysePage(html({})).noindex).toBe(false);
  });

  it("takes the title from <head>, not from an inline SVG in the body (gov.uk's crown logo)", () => {
    const svgOnly = html({ title: null, body: '<svg><title>GOV.UK</title><circle r="1"></circle></svg>' });
    expect(analysePage(svgOnly).title).toBeNull();
    const both = html({ title: "Contact - GOV.UK", body: '<svg><title>GOV.UK</title></svg>' });
    expect(analysePage(both).title).toBe("Contact - GOV.UK");
    // A title streamed into <body> (Next.js streaming metadata) is still the page's title.
    expect(analysePage('<html lang="en"><head></head><body><main>x</main><title>Docs</title></body></html>').title).toBe("Docs");
  });

  it("a bare alt attribute (alt, alt/) is an empty alt, not a missing one (w3.org)", () => {
    const a = analysePage(html({ body: '<img src="/a.svg" alt><img src="/b.svg" alt/><img src="/c.svg" alt aria-label="x"><img src="/d.svg" data-alt="x">' }));
    expect(a.images).toBe(4);
    expect(a.imagesMissingAlt).toBe(1);
  });

  it("ignores <noscript> resources, which a normal visit never loads (bbc.co.uk/iplayer)", () => {
    const a = analysePage(html({ body: '<noscript><img src="http://b.scorecardresearch.com/p?c1=2"></noscript><noscript><script src="http://x.example/a.js"></script></noscript>' }));
    expect(a.passiveMixed).toEqual([]);
    expect(a.activeMixed).toEqual([]);
  });

  it("ignores markup inside comments", () => {
    const a = analysePage(html({ body: '<!-- <form action="http://old.example/post"></form> -->' }));
    expect(a.insecureFormActions).toEqual([]);
  });
});

// ── Verdicts ────────────────────────────────────────────────────────────────

describe("evaluateSiteCrawl", () => {
  it("emits every key exactly once", () => {
    expect(evaluateSiteCrawl(observation()).map((c) => c.checkKey).sort()).toEqual([...SITE_CRAWL_KEYS].sort());
    expect(siteCrawlUnavailable("x").map((c) => c.checkKey).sort()).toEqual([...SITE_CRAWL_KEYS].sort());
  });

  it("a healthy site passes everything it could check, and names how many pages were read", () => {
    const c = byKey(evaluateSiteCrawl(observation()));
    for (const key of ["crawl_pages_read", "crawl_broken_internal_links", "crawl_page_titles", "crawl_meta_descriptions", "crawl_mixed_content", "crawl_insecure_forms", "crawl_html_lang", "crawl_viewport_meta", "crawl_canonical_tags", "crawl_noindex_key_pages", "crawl_security_headers_consistent", "crawl_sitemap_urls"]) {
      expect(c[key].status, key).toBe("PASS");
    }
    expect(c.crawl_page_titles.detail).toContain("Read 4 pages (the homepage and 3 other pages)");
    // No images in the static markup: not a vacuous pass.
    expect(c.crawl_image_alt_text.status).toBe("INCONCLUSIVE");
  });

  it("fewer than two readable pages beyond the homepage: no PASS anywhere", () => {
    const echo = homeBody.replace("<head>", '<head><meta name="x" content="1">');
    const obs = observation({
      pages: [
        crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans"), {}, "pricing"),
        crawled("https://www.example.com/about", echo), // soft 404
        crawled("https://www.example.com/blog", "", { status: 403 }),
      ],
    });
    const checks = evaluateSiteCrawl(obs);
    // The sitemap sample is its own evidence, independent of how many pages were read.
    expect(checks.filter((c) => c.status === "PASS" && c.checkKey !== "crawl_sitemap_urls").map((c) => c.checkKey)).toEqual([]);
    expect(byKey(checks).crawl_pages_read.detail).toContain("answered with the homepage");
  });

  it("with too little read, the homepage alone is not reported twice (example.com has no description)", () => {
    const bare = page(HOME, html({ title: "Example Domain", description: null }));
    const c = byKey(evaluateSiteCrawl(observation({ home: bare, pages: [] })));
    expect(c.crawl_meta_descriptions.status).toBe("INCONCLUSIVE");
    // A defect on another page still stands, and says how little was read.
    const thin = byKey(evaluateSiteCrawl(observation({ home: bare, pages: [crawled("https://www.example.com/about", distinct("about", "About our company", { description: null }), {}, "about")] })));
    expect(thin.crawl_meta_descriptions.status).toBe("WARN");
    expect(thin.crawl_meta_descriptions.detail).toContain("https://www.example.com/about");
    expect(thin.crawl_meta_descriptions.detail).not.toContain("https://www.example.com/,");
    expect(thin.crawl_meta_descriptions.detail).toContain("the homepage and 1 other page");
  });

  it("soft 404s are never judged as pages: a homepage echo's title is not a duplicate", () => {
    const echo = homeBody.replace("<head>", '<head><meta name="x" content="2">');
    const obs = observation();
    obs.pages.push(crawled("https://www.example.com/missing", echo));
    expect(byKey(evaluateSiteCrawl(obs)).crawl_page_titles.status).toBe("PASS");
  });

  describe("broken internal links", () => {
    it("a 404 or 410 is reported with the page it was linked from", () => {
      const obs = observation({ linkChecks: [...observation().linkChecks, { url: "https://www.example.com/old-page", status: 404, from: ["https://www.example.com/about"] }] });
      const c = byKey(evaluateSiteCrawl(obs)).crawl_broken_internal_links;
      expect(c.status).toBe("WARN");
      expect(c.detail).toContain("https://www.example.com/old-page (linked from https://www.example.com/about)");
    });
    it("three or more is a FAIL", () => {
      const broken = ["a", "b", "c"].map((p) => ({ url: `https://www.example.com/${p}`, status: 410, from: [HOME] }));
      expect(byKey(evaluateSiteCrawl(observation({ linkChecks: broken }))).crawl_broken_internal_links.status).toBe("FAIL");
    });
    it("403, 429, 5xx and no answer are could-not-check, never broken", () => {
      const links = [403, 429, 500, 503, 0].map((status, i) => ({ url: `https://www.example.com/p${i}`, status, from: [HOME] }));
      const c = byKey(evaluateSiteCrawl(observation({ linkChecks: links }))).crawl_broken_internal_links;
      expect(c.status).toBe("INCONCLUSIVE");
      const mixed = byKey(evaluateSiteCrawl(observation({ linkChecks: [...links, { url: "https://www.example.com/ok", status: 200, from: [HOME] }] }))).crawl_broken_internal_links;
      expect(mixed.status).toBe("PASS");
      expect(mixed.detail).toContain("5 links could not be checked");
    });
    it("on a catch-all host no 404 is not proof: INCONCLUSIVE, not PASS", () => {
      const c = byKey(evaluateSiteCrawl(observation({ catchAll: { status: 200, body: "<html><title>x</title><div id=\"root\"></div></html>" } }))).crawl_broken_internal_links;
      expect(c.status).toBe("INCONCLUSIVE");
    });
  });

  describe("titles and descriptions", () => {
    it("a missing title and a duplicated title are reported", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { title: null }), {}, "pricing");
      obs.pages[2] = crawled("https://www.example.com/blog/launch", distinct("launch", "Launch announcement", { title: "About our company | Example" }), {}, "article");
      const c = byKey(evaluateSiteCrawl(obs)).crawl_page_titles;
      expect(c.status).toBe("WARN");
      expect(c.detail).toContain("no <title>: https://www.example.com/pricing");
      expect(c.detail).toContain("the same title on different pages");
    });
    it("duplicate meta descriptions are reported", () => {
      const obs = observation();
      obs.pages[1] = crawled("https://www.example.com/about", distinct("about", "About our company", { description: "Pricing plans at Example" }), {}, "about");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_meta_descriptions.status).toBe("WARN");
    });
    it("a noindex page needs no description and is not compared for duplicate titles (HN's /submit)", () => {
      const obs = observation();
      obs.pages.push(crawled("https://www.example.com/login", distinct("login", "Log in", { description: null, title: "Example: tools for teams", noindex: true }), {}, "login"));
      const c = byKey(evaluateSiteCrawl(obs));
      expect(c.crawl_meta_descriptions.status).toBe("PASS");
      expect(c.crawl_page_titles.status).toBe("PASS");
      // The same page, indexable: both are findings.
      const obs2 = observation();
      obs2.pages.push(crawled("https://www.example.com/login", distinct("login", "Log in", { description: null, title: "Example: tools for teams" }), {}, "login"));
      const c2 = byKey(evaluateSiteCrawl(obs2));
      expect(c2.crawl_meta_descriptions.status).toBe("WARN");
      expect(c2.crawl_page_titles.status).toBe("WARN");
    });
    it("translations sharing a title are not duplicates, but two pages in one language are (w3.org/ja/)", () => {
      const obs = observation();
      obs.pages.push(crawled("https://www.example.com/ja/", distinct("ja", "Japanese home", { title: "Example: tools for teams", lang: "ja" })));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_page_titles.status).toBe("PASS");
      const obs2 = observation();
      obs2.pages.push(crawled("https://www.example.com/teams", distinct("teams", "Teams page", { title: "Example: tools for teams" })));
      expect(byKey(evaluateSiteCrawl(obs2)).crawl_page_titles.status).toBe("WARN");
    });
    it("page 2 of a listing sharing the listing's title is not a duplicate", () => {
      const obs = observation();
      obs.pages.push(crawled("https://www.example.com/?p=2", homeBody.replace("Plan, build and ship", "Page two of the list with other items")));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_page_titles.status).toBe("PASS");
    });
    it("unrendered app shells are not judged on their content", () => {
      const shell = (t: string) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>${t}</title></head><body><div id="root"></div><script src="/assets/${t}.js"></script></body></html>`;
      const obs = observation({
        home: page(HOME, shell("home")),
        pages: [crawled("https://www.example.com/pricing", shell("pricing"), {}, "pricing"), crawled("https://www.example.com/about", shell("about"), {}, "about")],
      });
      const c = byKey(evaluateSiteCrawl(obs));
      expect(c.crawl_meta_descriptions.status).toBe("INCONCLUSIVE");
      expect(c.crawl_page_titles.status).toBe("INCONCLUSIVE");
      // Static markup still counts.
      expect(c.crawl_html_lang.status).toBe("PASS");
    });
  });

  describe("mixed content and forms", () => {
    it("an http script on an https page is a FAIL; an http image is a WARN", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { head: '<script src="http://cdn.old.com/a.js"></script>' }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_mixed_content.status).toBe("FAIL");
      const obs2 = observation();
      obs2.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { body: '<img src="http://img.old.com/a.png" alt="x">' }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs2)).crawl_mixed_content.status).toBe("WARN");
    });
    it("upgrade-insecure-requests means browsers fetch them over https", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { head: '<script src="http://cdn.old.com/a.js"></script>' }), { headers: { ...SECURE_HEADERS, "content-security-policy": "upgrade-insecure-requests" } }, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_mixed_content.status).toBe("PASS");
    });
    it("a form posting to http from an https page is a FAIL; to https is fine", () => {
      const obs = observation();
      obs.pages[1] = crawled("https://www.example.com/about", distinct("about", "About our company", { body: '<form action="http://example.com/contact" method="post"></form>' }), {}, "about");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_insecure_forms.status).toBe("FAIL");
      const ok = observation();
      ok.pages[1] = crawled("https://www.example.com/about", distinct("about", "About our company", { body: '<form action="https://example.com/contact"></form><form action="/search"></form>' }), {}, "about");
      expect(byKey(evaluateSiteCrawl(ok)).crawl_insecure_forms.status).toBe("PASS");
    });
  });

  describe("lang and viewport", () => {
    it("a page without <html lang> or a viewport is named", () => {
      const obs = observation();
      obs.pages[2] = crawled("https://www.example.com/blog/launch", distinct("launch", "Launch announcement", { lang: null, viewport: false }), {}, "article");
      const c = byKey(evaluateSiteCrawl(obs));
      expect(c.crawl_html_lang.status).toBe("WARN");
      expect(c.crawl_html_lang.detail).toContain("https://www.example.com/blog/launch");
      expect(c.crawl_viewport_meta.status).toBe("WARN");
    });
  });

  describe("canonical tags", () => {
    it("every page canonicalised to the homepage is a FAIL", () => {
      const obs = observation();
      obs.pages = obs.pages.map((p) => crawled(p.fetch.url, p.fetch.body.replace("</head>", `<link rel="canonical" href="${HOME}"></head>`), {}, p.kind));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_canonical_tags.status).toBe("FAIL");
    });
    it("self-referencing canonicals (with or without www and trailing slash) pass", () => {
      const obs = observation();
      obs.pages = obs.pages.map((p) => crawled(p.fetch.url, p.fetch.body.replace("</head>", `<link rel="canonical" href="${p.fetch.url.replace("www.", "")}/"></head>`), {}, p.kind));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_canonical_tags.status).toBe("PASS");
    });
    it("a canonical on another site is a WARN", () => {
      const obs = observation();
      obs.pages[2] = crawled("https://www.example.com/blog/launch", distinct("launch", "Launch announcement", { canonical: "https://medium.com/@x/launch" }), {}, "article");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_canonical_tags.status).toBe("WARN");
    });
  });

  describe("noindex on key pages", () => {
    it("a noindex pricing page is a WARN", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { noindex: true }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_noindex_key_pages.status).toBe("WARN");
    });
    it("a noindex login page is fine", () => {
      const obs = observation();
      obs.pages.push(crawled("https://www.example.com/login", distinct("login", "Log in", { noindex: true }), {}, "login"));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_noindex_key_pages.status).toBe("PASS");
    });
    it("a noindex homepage makes it look deliberate: not judged", () => {
      const obs = observation({ home: page(HOME, homeBody.replace("</head>", '<meta name="robots" content="noindex"></head>')) });
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { noindex: true }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_noindex_key_pages.status).toBe("INCONCLUSIVE");
    });
  });

  describe("security headers", () => {
    it("a header on the homepage but not on another page is a WARN naming both", () => {
      const obs = observation();
      const { ["x-frame-options"]: _drop, ...rest } = SECURE_HEADERS;
      void _drop;
      obs.pages[1] = crawled("https://www.example.com/about", distinct("about", "About our company"), { headers: rest }, "about");
      const c = byKey(evaluateSiteCrawl(obs)).crawl_security_headers_consistent;
      expect(c.status).toBe("WARN");
      expect(c.detail).toContain("X-Frame-Options or frame-ancestors is missing on https://www.example.com/about");
    });
    it("frame-ancestors in CSP counts as frame protection", () => {
      const obs = observation();
      const { ["x-frame-options"]: _drop, ...rest } = SECURE_HEADERS;
      void _drop;
      obs.pages[1] = crawled("https://www.example.com/about", distinct("about", "About our company"), { headers: { ...rest, "content-security-policy": "frame-ancestors 'self'" } }, "about");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_security_headers_consistent.status).toBe("PASS");
    });
    it("a header missing everywhere is not an inconsistency (the single-page checks own that)", () => {
      const noHsts = { "content-type": "text/html" };
      const obs = observation({ home: page(HOME, homeBody, { headers: noHsts }) });
      obs.pages = obs.pages.map((p) => crawled(p.fetch.url, p.fetch.body, { headers: noHsts }, p.kind));
      expect(byKey(evaluateSiteCrawl(obs)).crawl_security_headers_consistent.status).toBe("PASS");
    });
  });

  describe("sitemap URLs", () => {
    it("404 and redirecting sitemap URLs are a WARN", () => {
      const c = byKey(evaluateSiteCrawl(observation({ sitemap: { read: true, urlCount: 50, checks: [{ url: "https://www.example.com/gone", status: 404 }, { url: "https://www.example.com/moved", status: 301 }, { url: "https://www.example.com/ok", status: 200 }] } }))).crawl_sitemap_urls;
      expect(c.status).toBe("WARN");
      expect(c.detail).toContain("https://www.example.com/gone");
      expect(c.detail).toContain("https://www.example.com/moved");
    });
    it("temporary redirects (by location, like stripe.com/legal to /gb/legal) are not counted", () => {
      const checks = ["a", "b", "c"].map((p) => ({ url: `https://www.example.com/${p}`, status: 307 }));
      expect(byKey(evaluateSiteCrawl(observation({ sitemap: { read: true, urlCount: 3, checks } }))).crawl_sitemap_urls.status).toBe("INCONCLUSIVE");
      const permanent = ["a", "b", "c"].map((p) => ({ url: `https://www.example.com/${p}`, status: 308 }));
      expect(byKey(evaluateSiteCrawl(observation({ sitemap: { read: true, urlCount: 3, checks: permanent } }))).crawl_sitemap_urls.status).toBe("WARN");
    });
    it("no sitemap, or only refusals, is INCONCLUSIVE", () => {
      expect(byKey(evaluateSiteCrawl(observation({ sitemap: { read: false, urlCount: 0, checks: [] } }))).crawl_sitemap_urls.status).toBe("INCONCLUSIVE");
      expect(byKey(evaluateSiteCrawl(observation({ sitemap: { read: true, urlCount: 2, checks: [{ url: "https://www.example.com/a", status: 403 }, { url: "https://www.example.com/b", status: 0 }] } }))).crawl_sitemap_urls.status).toBe("INCONCLUSIVE");
    });
  });

  describe("image alt text", () => {
    it("many images without alt is a WARN", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { body: '<img src="/1.png"><img src="/2.png"><img src="/3.png"><img src="/4.png" alt="ok">' }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_image_alt_text.status).toBe("WARN");
    });
    it("one logo without alt repeated on every page is one image, not one per page", () => {
      const obs = observation();
      obs.pages = obs.pages.map((p) => crawled(p.fetch.url, p.fetch.body.replace("<main>", '<main><img src="/logo.svg" width="18" height="18"><img src="/hero.png" alt="Hero">'), {}, p.kind));
      const c = byKey(evaluateSiteCrawl(obs)).crawl_image_alt_text;
      expect(c.status).toBe("PASS");
      expect(c.detail).toContain("1 of 2 distinct images");
    });
    it("decorative alt=\"\" images pass", () => {
      const obs = observation();
      obs.pages[0] = crawled("https://www.example.com/pricing", distinct("pricing", "Pricing plans", { body: '<img src="/1.png" alt=""><img src="/2.png" alt=""><img src="/3.png" alt="Chart">' }), {}, "pricing");
      expect(byKey(evaluateSiteCrawl(obs)).crawl_image_alt_text.status).toBe("PASS");
    });
  });

  it("every detail stays in plain UK English with no em dashes", () => {
    for (const c of evaluateSiteCrawl(observation())) expect(c.detail ?? "").not.toContain("\u2014");
  });
});

describe("wiring", () => {
  it("runs only on the internal website path, behind the same switch as the browser collectors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/server/pulse-lite/run-lite-scan.ts", "utf8");
    // The switch: renderJs (off for the public embed and MCP), a reachable website, not a store listing.
    expect(src).toMatch(/const runRenderedA11y = collectorPlan\.browser && renderJs && !storeTarget && !urlTargetBlocked/);
    expect(src).toMatch(/runRenderedA11y\s*\?\s*Promise\.allSettled\(\[runSiteCrawlAgent\(safeUrl\)\]\)/);
    expect(src.match(/runSiteCrawlAgent\(/g)?.length).toBe(1);
  });

  it("records itself as a URL-only collector", async () => {
    const { URL_ONLY_COLLECTORS } = await import("../collector-health");
    expect(URL_ONLY_COLLECTORS).toContain("site-crawl");
  });
});
