import { type ExtendedCheckContext, type PulseScanCheckInput, headRequest, platformIs, skip } from "./_types";

export async function runSeoExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP")) {
    return skip("SEO", [
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
  checks.push({ category: "SEO", checkKey: "faqpage_schema", label: "FAQPage JSON-LD schema", status: hasFaqSchema ? "PASS" : "WARN", detail: hasFaqSchema ? "FAQPage schema detected — FAQ content is eligible for rich results in Google Search." : "No FAQPage schema — adding JSON-LD FAQPage markup enables rich results with expanded Q&A in search." });

  const hasProductSchema = schemaContent.includes('"product"') && (schemaContent.includes('"price"') || schemaContent.includes('"offers"'));
  checks.push({ category: "SEO", checkKey: "product_schema", label: "Product schema markup", status: hasProductSchema ? "PASS" : "WARN", detail: hasProductSchema ? "Product schema with pricing detected." : "No Product schema detected — Product markup enables price, availability, and rating rich results in Google Shopping." });

  const hasOrgSchema = schemaContent.includes('"organization"') || schemaContent.includes('"corporation"');
  checks.push({ category: "SEO", checkKey: "organization_schema", label: "Organization schema markup", status: hasOrgSchema ? "PASS" : "WARN", detail: hasOrgSchema ? "Organization schema detected." : "No Organization schema — adding Organization markup improves brand knowledge panel appearance in Google and Bing." });

  const hasArticleSchema = schemaContent.includes('"article"') || schemaContent.includes('"blogposting"') || schemaContent.includes('"newsarticle"');
  checks.push({ category: "SEO", checkKey: "article_schema", label: "Article / BlogPosting schema", status: hasArticleSchema ? "PASS" : "WARN", detail: hasArticleSchema ? "Article schema detected." : "No Article schema — blog content with Article markup gets date and author information displayed in search results." });

  const hasReviewSchema = schemaContent.includes('"aggregaterating"') || schemaContent.includes('"review"');
  checks.push({ category: "SEO", checkKey: "review_schema", label: "AggregateRating / Review schema", status: hasReviewSchema ? "PASS" : "WARN", detail: hasReviewSchema ? "Review / rating schema detected — star ratings may appear in search results." : "No review schema — AggregateRating markup enables star ratings in Google search results, significantly improving CTR." });

  const hasBreadcrumbSchema = schemaContent.includes('"breadcrumblist"') || schemaContent.includes('"breadcrumb"');
  checks.push({ category: "SEO", checkKey: "breadcrumb_schema", label: "BreadcrumbList schema", status: hasBreadcrumbSchema ? "PASS" : "WARN", detail: hasBreadcrumbSchema ? "BreadcrumbList schema detected — site hierarchy appears in search results." : "No BreadcrumbList schema — breadcrumb markup shows URL path in search results, improving click-through rates for inner pages." });

  const hasLocalBizSchema = schemaContent.includes('"localbusiness"') || schemaContent.includes('"store"') || schemaContent.includes('"restaurant"');
  checks.push({ category: "SEO", checkKey: "local_business_schema", label: "LocalBusiness schema", status: hasLocalBizSchema ? "PASS" : "WARN", detail: hasLocalBizSchema ? "LocalBusiness schema detected." : "No LocalBusiness schema — if you have a physical location, LocalBusiness markup improves Google Maps and local search visibility." });

  // Sitemap index
  const sitemapIndexStatus = await headRequest(`${httpsUrl}/sitemap_index.xml`);
  const sitemapIndexStatus2 = await headRequest(`${httpsUrl}/sitemap-index.xml`);
  const hasSitemapIndex = sitemapIndexStatus === 200 || sitemapIndexStatus2 === 200;
  checks.push({ category: "SEO", checkKey: "sitemap_index", label: "XML sitemap index", status: hasSitemapIndex ? "PASS" : "WARN", detail: hasSitemapIndex ? "Sitemap index file found." : "No sitemap index file — for large sites with multiple sitemaps, a sitemap index file is required by Google Webmaster guidelines." });

  // Image sitemap
  const imageSitemapStatus = await headRequest(`${httpsUrl}/image-sitemap.xml`);
  const hasSitemapWithImages = html.includes("image:") || imageSitemapStatus === 200;
  checks.push({ category: "SEO", checkKey: "image_sitemap_present", label: "Image sitemap", status: hasSitemapWithImages ? "PASS" : "WARN", detail: hasSitemapWithImages ? "Image sitemap signals detected." : "No image sitemap — an image sitemap helps Google discover and index product photos, blog images, and other visual content." });

  // News sitemap
  const newsSitemapStatus = await headRequest(`${httpsUrl}/news-sitemap.xml`);
  const hasNewsSitemap = newsSitemapStatus === 200;
  const isNewsSite = /news|blog|article|press/i.test(ctx.httpsUrl) || hasArticleSchema;
  checks.push({ category: "SEO", checkKey: "news_sitemap_present", label: "Google News sitemap", status: isNewsSite ? (hasNewsSitemap ? "PASS" : "WARN") : "PASS", detail: isNewsSite ? (hasNewsSitemap ? "News sitemap found." : "News/blog content detected but no news sitemap — submit a news sitemap to appear in Google News and Top Stories.") : "Not applicable — no news/blog content signals detected." });

  // Pagination
  const hasPaginationRel = /<link[^>]+rel=["'](?:prev|next)["']/i.test(html);
  const hasPaginationCanonical = /rel=["']canonical["'][^>]*page=\d+/i.test(html);
  checks.push({ category: "SEO", checkKey: "pagination_rel_links", label: "Pagination rel=prev/next or canonical", status: hasPaginationRel || hasPaginationCanonical ? "PASS" : "WARN", detail: hasPaginationRel ? "rel=prev/next pagination links detected." : hasPaginationCanonical ? "Paginated canonical URL detected." : "No pagination signals — for paginated content, use a canonical pointing to the first page, or rel=prev/next for Google to understand the series." });

  // Self-referencing canonical
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const canonicalUrl = canonicalMatch?.[1] ?? "";
  const hasSelfCanonical = !!canonicalUrl && (canonicalUrl.includes(ctx.hostname) || canonicalUrl.startsWith("/"));
  checks.push({ category: "SEO", checkKey: "canonical_self_referencing", label: "Self-referencing canonical on key pages", status: hasSelfCanonical ? "PASS" : "WARN", detail: hasSelfCanonical ? `Self-referencing canonical present: ${canonicalUrl}` : "No self-referencing canonical — add a canonical tag on every page pointing to itself to prevent duplicate content from URL parameters and sorting." });

  // Google Business Profile
  const hasGBP = /google\.com\/maps|maps\.google\.com|g\.page\/|google.*business.*profile|google.*my.*business/i.test(html);
  checks.push({ category: "SEO", checkKey: "google_business_profile", label: "Google Business Profile signals", status: hasGBP ? "PASS" : "WARN", detail: hasGBP ? "Google Business Profile signals detected." : "No Google Business Profile signals — a verified GBP is essential for local SEO and appears in Knowledge Panel searches." });

  // Bing Webmaster
  const hasBingVerification = /msvalidate\.01|bing.*verification|bing-site-verification/i.test(html);
  checks.push({ category: "SEO", checkKey: "bing_webmaster_verified", label: "Bing Webmaster Tools verification", status: hasBingVerification ? "PASS" : "WARN", detail: hasBingVerification ? "Bing Webmaster Tools verification detected." : "No Bing verification — Bing/Edge account for ~3% of global search. Submit to Bing Webmaster Tools for additional indexing signals." });

  // Internal link depth (proxy: check if nav has links 2+ levels deep)
  const navLinks = html.match(/<nav[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
  const deepLinks = navLinks.join("").match(/href=["']\/[^"'\/]+\/[^"'\/]+/g) ?? [];
  checks.push({ category: "SEO", checkKey: "internal_link_depth", label: "Key pages within 3 clicks of homepage", status: deepLinks.length > 0 ? "PASS" : "WARN", detail: deepLinks.length > 0 ? "Multi-level internal navigation detected — key pages appear to be within 2–3 clicks." : "No deep internal navigation links in nav — ensure important pages are reachable within 3 clicks from the homepage for optimal crawl depth." });

  return checks;
}
