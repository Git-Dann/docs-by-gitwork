/**
 * Read a site's sitemaps and say what they contain.
 *
 * Image and news entries live INSIDE ordinary sitemaps, under the image: and news:
 * namespaces, so the only evidence that counts is a sitemap body carrying them. The old
 * image check passed on any "image:" in the page HTML (og:image:width, CSS
 * background-image:), and the news check gave every non-news site a free PASS.
 */
import { fetchSnippet } from "./path-probe";

const SITEMAP_ROOT = /<(?:urlset|sitemapindex)\b/i;
const MAX_FETCHES = 9;
const MAX_BYTES = 512 * 1024;

export interface SitemapRead {
  /** Bodies that were real sitemap XML. */
  bodies: string[];
  /** URLs that were tried. */
  tried: string[];
  /** True when an index listed more children than were read. */
  incomplete: boolean;
}

/**
 * robots.txt Sitemap: lines first, then the conventional paths; a sitemap index is
 * followed one level to its first few children. Bounded to a handful of requests.
 */
export async function readSitemaps(httpsUrl: string): Promise<SitemapRead> {
  const origin = new URL(httpsUrl).origin;
  const tried: string[] = [];
  const bodies: string[] = [];
  let incomplete = false;
  const robots = await fetchSnippet(`${origin}/robots.txt`, 4000, 64 * 1024);
  const declared = robots.status === 200
    ? [...robots.body.matchAll(/^\s*sitemap\s*:\s*(https?:\/\/\S+)/gim)].map((m) => m[1]).slice(0, 3)
    : [];
  const queue = [...declared, `${origin}/sitemap.xml`, `${origin}/image-sitemap.xml`, `${origin}/news-sitemap.xml`];
  while (queue.length > 0 && tried.length < MAX_FETCHES) {
    const url = queue.shift()!;
    if (tried.includes(url)) continue;
    tried.push(url);
    const res = await fetchSnippet(url, 5000, MAX_BYTES);
    if (res.status !== 200 || !SITEMAP_ROOT.test(res.body)) continue;
    bodies.push(res.body);
    if (/<sitemapindex\b/i.test(res.body)) {
      // News and image sitemaps first: they are what the checks below look for.
      const children = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"))
        .sort((a, b) => Number(/news|image/i.test(b)) - Number(/news|image/i.test(a)));
      if (children.length > 4) incomplete = true;
      queue.unshift(...children.slice(0, 4));
    }
  }
  if (queue.length > 0) incomplete = true;
  return { bodies, tried, incomplete };
}

type Verdict = { status: "PASS" | "WARN" | "INCONCLUSIVE" | "NOT_APPLICABLE"; detail: string; evidence?: string };

export function imageSitemapVerdict(read: SitemapRead): Verdict {
  if (read.bodies.length === 0) {
    return { status: "INCONCLUSIVE", detail: `No sitemap could be read (tried ${read.tried.length} location${read.tried.length === 1 ? "" : "s"}, including any listed in robots.txt), so whether it lists images could not be established.` };
  }
  if (read.bodies.some((b) => /<image:image\b/i.test(b))) {
    return { status: "PASS", detail: "The site's sitemap lists images (<image:image> entries), which helps search engines find images they would not discover from the page markup.", evidence: "<image:image>" };
  }
  return { status: "NOT_APPLICABLE", detail: `The ${read.bodies.length} sitemap file${read.bodies.length === 1 ? "" : "s"} read list${read.bodies.length === 1 ? "s" : ""} no images. Image entries are optional: search engines find most images through the pages themselves, so this is not a finding.` };
}

export function newsSitemapVerdict(read: SitemapRead, isNewsPublisher: boolean): Verdict {
  if (!isNewsPublisher) {
    return { status: "NOT_APPLICABLE", detail: "Not applicable: the page carries no NewsArticle or NewsMediaOrganization markup, and Google News sitemaps are for news publishers." };
  }
  if (read.bodies.some((b) => /<news:news\b/i.test(b))) {
    return { status: "PASS", detail: "The site's sitemap carries Google News entries (<news:news>).", evidence: "<news:news>" };
  }
  if (read.bodies.length === 0 || read.incomplete) {
    return { status: "INCONCLUSIVE", detail: read.bodies.length === 0
      ? "The page is marked up as news, but no sitemap could be read, so whether a Google News sitemap exists could not be established."
      : "The page is marked up as news. The sitemaps Pulse read carry no Google News entries, but the sitemap index lists more files than were read, so a news sitemap may still exist." };
  }
  return { status: "WARN", detail: `The page is marked up as news, but none of the ${read.bodies.length} sitemap file${read.bodies.length === 1 ? "" : "s"} read carries Google News entries (<news:news>). A news sitemap helps recent articles appear in Google News.` };
}
