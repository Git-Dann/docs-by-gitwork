import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, verifyFileExposure, platformIs, skip } from "./_types";
import { imageSitemapVerdict, newsSitemapVerdict, readSitemaps } from "./sitemap-reader";

/** URL normalised for canonical comparison: host case, default port, fragment, one trailing slash, query order. */
export function normaliseCanonicalUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "/";
    return `${u.protocol}//${u.host}${path}${query}`;
  } catch {
    return null;
  }
}

/** True when the canonical href (absolute or relative) names the page it sits on. */
export function isSelfCanonical(canonicalHref: string, pageUrl: string): boolean {
  const a = normaliseCanonicalUrl(canonicalHref, pageUrl);
  const b = normaliseCanonicalUrl(pageUrl, pageUrl);
  return a !== null && a === b;
}

export async function runSeoExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORIES.SEO, [
      ["faqpage_schema", "FAQPage JSON-LD schema"],
      ["product_schema", "Product schema markup"],
      ["organization_schema", "Organization schema markup"],
      ["article_schema", "Article / BlogPosting schema"],
      ["review_schema", "AggregateRating / Review schema"],
      ["breadcrumb_schema", "BreadcrumbList schema"],
      ["local_business_schema", "LocalBusiness schema"],
      ["sitemap_index", "XML sitemap index"],
      ["image_sitemap_present", "Image sitemap"],
      ["news_sitemap_present", "Google News sitemap"],
      ["pagination_rel_links", "Pagination rel=prev/next links"],
      ["canonical_self_referencing", "Self-referencing canonical on key pages"],
      ["google_business_profile", "Google Business Profile signals"],
      ["bing_webmaster_verified", "Bing Webmaster Tools verification"],
      ["internal_link_depth", "Key pages within 3 clicks of homepage"],
    ], "Not applicable for this platform type.");
  }

  // Schema markup checks
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const schemaMatches = html.match(hasJsonLd) ?? [];
  const schemaContent = schemaMatches.join(" ").toLowerCase();

  const hasFaqSchema = schemaContent.includes('"faqpage"') || schemaContent.includes('"@type":"faqpage"');
  checks.push({ category: CATEGORIES.SEO, checkKey: "faqpage_schema", label: "FAQPage JSON-LD schema", status: hasFaqSchema ? "PASS" : "WARN", detail: hasFaqSchema ? "FAQPage schema detected — FAQ content is eligible for rich results in Google Search." : "No FAQPage schema — adding JSON-LD FAQPage markup enables rich results with expanded Q&A in search." });

  const hasProductSchema = schemaContent.includes('"product"') && (schemaContent.includes('"price"') || schemaContent.includes('"offers"'));
  checks.push({ category: CATEGORIES.SEO, checkKey: "product_schema", label: "Product schema markup", status: hasProductSchema ? "PASS" : "WARN", detail: hasProductSchema ? "Product schema with pricing detected." : "No Product schema detected — Product markup enables price, availability, and rating rich results in Google Shopping." });

  // Organization subtypes (schema.org) carry the same brand/knowledge-panel signal as a bare
  // Organization: OnlineStore (MercadoLivre), NewsMediaOrganization, LocalBusiness, NGO, ...
  // `(?!\s*:)` keeps it to string VALUES — a property name such as "sourceOrganization": is not
  // an Organization node.
  const hasOrgSchema = /"(?:[a-z]*organization|corporation|onlinestore|onlinebusiness|localbusiness|ngo)"(?!\s*:)/.test(schemaContent);
  checks.push({ category: CATEGORIES.SEO, checkKey: "organization_schema", label: "Organization schema markup", status: hasOrgSchema ? "PASS" : "WARN", detail: hasOrgSchema ? "Organization schema detected." : "No Organization schema — adding Organization markup improves brand knowledge panel appearance in Google and Bing." });

  const hasArticleSchema = schemaContent.includes('"article"') || schemaContent.includes('"blogposting"') || schemaContent.includes('"newsarticle"');
  checks.push({ category: CATEGORIES.SEO, checkKey: "article_schema", label: "Article / BlogPosting schema", status: hasArticleSchema ? "PASS" : "WARN", detail: hasArticleSchema ? "Article schema detected." : "No Article schema — blog content with Article markup gets date and author information displayed in search results." });

  const hasReviewSchema = schemaContent.includes('"aggregaterating"') || schemaContent.includes('"review"');
  checks.push({ category: CATEGORIES.SEO, checkKey: "review_schema", label: "AggregateRating / Review schema", status: hasReviewSchema ? "PASS" : "WARN", detail: hasReviewSchema ? "Review / rating schema detected — star ratings may appear in search results." : "No review schema — AggregateRating markup enables star ratings in Google search results, significantly improving CTR." });

  const hasBreadcrumbSchema = schemaContent.includes('"breadcrumblist"') || schemaContent.includes('"breadcrumb"');
  checks.push({ category: CATEGORIES.SEO, checkKey: "breadcrumb_schema", label: "BreadcrumbList schema", status: hasBreadcrumbSchema ? "PASS" : "WARN", detail: hasBreadcrumbSchema ? "BreadcrumbList schema detected — site hierarchy appears in search results." : "No BreadcrumbList schema — breadcrumb markup shows URL path in search results, improving click-through rates for inner pages." });

  const hasLocalBizSchema = schemaContent.includes('"localbusiness"') || schemaContent.includes('"store"') || schemaContent.includes('"restaurant"');
  checks.push({ category: CATEGORIES.SEO, checkKey: "local_business_schema", label: "LocalBusiness schema", status: hasLocalBizSchema ? "PASS" : "WARN", detail: hasLocalBizSchema ? "LocalBusiness schema detected." : "No LocalBusiness schema — if you have a physical location, LocalBusiness markup improves Google Maps and local search visibility." });

  // Sitemap files are content-verifiable: a real one is XML (<?xml / <urlset /
  // <sitemapindex), so verifyFileExposure rejects a catch-all HTML shell and these
  // checks stay correct on Vercel/SPA hosts.
  const isSitemapXml = (body: string, ct: string) =>
    ct.includes("xml") || /<\?xml|<urlset|<sitemapindex|<urlset|<sitemap/i.test(body);

  // Sitemap index. WordPress core, Webflow and MDN serve their index at /sitemap.xml, so probe
  // that too — but there only a real <sitemapindex> root counts (a plain <urlset> is not an index).
  const isSitemapIndexXml = (body: string) => /<sitemapindex/i.test(body);
  const [sitemapIndexA, sitemapIndexB, rootSitemapIsIndex] = await Promise.all([
    verifyFileExposure(`${httpsUrl}/sitemap_index.xml`, isSitemapXml),
    verifyFileExposure(`${httpsUrl}/sitemap-index.xml`, isSitemapXml),
    verifyFileExposure(`${httpsUrl}/sitemap.xml`, isSitemapIndexXml),
  ]);
  const hasSitemapIndex = sitemapIndexA || sitemapIndexB || rootSitemapIsIndex;
  checks.push({ category: CATEGORIES.SEO, checkKey: "sitemap_index", label: "XML sitemap index", status: hasSitemapIndex ? "PASS" : "WARN", detail: hasSitemapIndex ? "Sitemap index file found." : "No sitemap index found at /sitemap.xml, /sitemap_index.xml or /sitemap-index.xml — an index is only needed once a site has more than one sitemap (each sitemap is capped at 50,000 URLs / 50 MB); a single sitemap is fine for smaller sites." });

  // Image and news entries live inside the sitemaps themselves, so read them. The old image
  // check passed on any "image:" in the page (og:image:width, CSS background-image:) and the
  // news check gave every non-news site a free PASS.
  const sitemaps = await readSitemaps(httpsUrl);
  checks.push({ category: CATEGORIES.SEO, checkKey: "image_sitemap_present", label: "Image sitemap", ...imageSitemapVerdict(sitemaps) });
  const isNewsPublisher = /"(?:newsarticle|newsmediaorganization)"/.test(schemaContent);
  checks.push({ category: CATEGORIES.SEO, checkKey: "news_sitemap_present", label: "Google News sitemap", ...newsSitemapVerdict(sitemaps, isNewsPublisher) });

  // Pagination
  const hasPaginationRel = /<link[^>]+rel=["'](?:prev|next)["']/i.test(html);
  const hasPaginationCanonical = /rel=["']canonical["'][^>]*page=\d+/i.test(html);
  checks.push({ category: CATEGORIES.SEO, checkKey: "pagination_rel_links", label: "Pagination rel=prev/next or canonical", status: hasPaginationRel || hasPaginationCanonical ? "PASS" : "WARN", detail: hasPaginationRel ? "rel=prev/next pagination links detected." : hasPaginationCanonical ? "Paginated canonical URL detected." : "No pagination signals — for paginated content, use a canonical pointing to the first page, or rel=prev/next for Google to understand the series." });

  // Self-referencing canonical
  // Attribute order is free in HTML: <link href="…" rel="canonical"> (anthropic.com, webflow.com)
  // is as valid as the rel-first form, so find the tag first, then read its href.
  const canonicalTag = html.match(/<link\b[^>]*\brel=["']?canonical["']?[^>]*>/i)?.[0] ?? "";
  const canonicalUrl = canonicalTag.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
  // Self-referencing means it names THIS page (normalised), not merely any page on the
  // host: a canonical on /pricing pointing at / was a PASS before.
  const hasSelfCanonical = !!canonicalUrl && isSelfCanonical(canonicalUrl, ctx.pageResult.finalUrl || ctx.httpsUrl);
  checks.push({ category: CATEGORIES.SEO, checkKey: "canonical_self_referencing", label: "Self-referencing canonical on key pages", status: hasSelfCanonical ? "PASS" : "WARN", detail: hasSelfCanonical ? `Self-referencing canonical present: ${canonicalUrl}` : canonicalUrl ? `Canonical points to a different URL (${canonicalUrl}) rather than this page — confirm this is intentional (e.g. a deliberate cross-domain canonical).` : "No self-referencing canonical — add a canonical tag on every page pointing to itself to prevent duplicate content from URL parameters and sorting." });

  // Google Business Profile
  const hasGBP = /google\.com\/maps|maps\.google\.com|g\.page\/|google.*business.*profile|google.*my.*business/i.test(html);
  checks.push({ category: CATEGORIES.SEO, checkKey: "google_business_profile", label: "Google Business Profile signals", status: hasGBP ? "PASS" : "WARN", detail: hasGBP ? "Google Business Profile signals detected." : "No Google Business Profile signals — a verified GBP is essential for local SEO and appears in Knowledge Panel searches." });

  // Bing Webmaster
  const hasBingVerification = /msvalidate\.01|bing.*verification|bing-site-verification/i.test(html);
  checks.push({ category: CATEGORIES.SEO, checkKey: "bing_webmaster_verified", label: "Bing Webmaster Tools verification", status: hasBingVerification ? "PASS" : "WARN", detail: hasBingVerification ? "Bing Webmaster Tools verification detected." : "No Bing verification — Bing/Edge account for ~3% of global search. Submit to Bing Webmaster Tools for additional indexing signals." });

  // Internal link depth (proxy: check if nav has links 2+ levels deep)
  // Any internal page linked from a homepage <nav> is one click deep. Absolute same-host URLs
  // count too — WordPress, Anthropic and MercadoLivre write nav links as https://host/path.
  // Only <a href> anchors count: an SVG <use href="/icons/sprite.svg#menu"> is not a link.
  const navLinks = html.match(/<nav[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
  const siteHost = ctx.hostname.toLowerCase().replace(/^www\./, "");
  const deepLinks = Array.from(navLinks.join("").matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"'#][^"']*)["']/gi)).filter((m) => {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), httpsUrl);
      return /^https?:$/.test(u.protocol) && u.hostname.toLowerCase().replace(/^www\./, "") === siteHost && u.pathname.length > 1;
    } catch {
      return false;
    }
  });
  checks.push({ category: CATEGORIES.SEO, checkKey: "internal_link_depth", label: "Key pages within 3 clicks of homepage", status: deepLinks.length > 0 ? "PASS" : "WARN", detail: deepLinks.length > 0 ? "Homepage navigation links to internal pages — those pages are one click from the homepage." : "No internal page links found in a <nav> element of the static homepage HTML — ensure important pages are reachable within 3 clicks from the homepage (navigation rendered only by JavaScript may be invisible to some crawlers)." });

  return checks;
}
