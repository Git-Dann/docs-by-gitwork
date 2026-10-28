// Site crawl collector.
//
// Reads a bounded set of same-site pages beyond the homepage — chosen from the
// homepage's own links and the sitemap — then checks the internal links found on
// them and a sample of the sitemap's URLs. Collect-only: every verdict is a pure
// function in pulse-checks/site-crawl.ts.
//
// Every request goes through fetchScannableUrl, which runs the SSRF guard on every
// hop, redirects included. Internal scans only: run-lite-scan.ts gates it on the
// same switch as the rendered-browser collectors, so the public embed never crawls.

import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertHostResponding, recordTimeout } from "@/server/pulse-checks/host-breaker";
import {
  analysePage,
  classifyPage,
  CRAWL_LIMITS,
  evaluateSiteCrawl,
  isSameSite,
  isSitemapIndex,
  isSitemapXml,
  normaliseCandidate,
  pageIdentity,
  parseRobots,
  selectPages,
  selectTrustPages,
  siteCrawlUnavailable,
  sitemapLocs,
  type CrawlCandidate,
  type CrawlObservation,
  type CrawledPage,
  type FetchedPage,
  type FoundLink,
  type TrustTopic,
  type LinkCheck,
  type RobotsRules,
  type SitemapCheck,
} from "@/server/pulse-checks/site-crawl";
import { pageAnchors } from "@/server/pulse-checks/page-claims";
import type { PulseScanCheckInput } from "@/types/pulse";

const USER_AGENT = "Gitwork-Pulse/1.0";
/** Headers the checks read; nothing else is kept. */
const KEPT_HEADERS = [
  "content-type",
  "strict-transport-security",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-type-options",
  "x-frame-options",
  "x-robots-tag",
  "cf-mitigated",
  "location",
];

export interface SiteCrawlResult {
  checks: PulseScanCheckInput[];
  observation: CrawlObservation | null;
  collectorError?: string;
}

interface Budget {
  deadline: number;
}

function remaining(budget: Budget): number {
  return budget.deadline - Date.now();
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytes += value.byteLength;
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return body.slice(0, maxBytes);
}

function keptHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = res.headers.get(name);
    if (value !== null) out[name] = value;
  }
  return out;
}

/** GET (or HEAD) a URL within the budget. status 0 = failed, timed out or out of budget. */
async function fetchOne(
  url: string,
  budget: Budget,
  opts: { method?: "GET" | "HEAD"; maxBytes?: number; timeoutMs?: number; follow?: boolean } = {},
): Promise<FetchedPage> {
  const empty: FetchedPage = { url, finalUrl: url, status: 0, contentType: "", headers: {}, body: "" };
  const full = opts.timeoutMs ?? CRAWL_LIMITS.pageTimeoutMs;
  const timeout = Math.min(full, remaining(budget));
  if (timeout < 500) return empty;
  // A request cut short because the crawl's own budget ran out says nothing about the
  // host, so only a request that had its full time counts towards the host breaker.
  const budgetCut = timeout < full;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    assertHostResponding(url);
    const res = await fetchScannableUrl(
      url,
      {
        method: opts.method ?? "GET",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      },
      {},
      { followRedirects: opts.follow ?? true },
    ).catch((e) => {
      if (controller.signal.aborted && !budgetCut) recordTimeout(url);
      throw e;
    });
    const headers = keptHeaders(res);
    const body = opts.method === "HEAD" ? "" : await readCapped(res, opts.maxBytes ?? CRAWL_LIMITS.maxBodyBytes);
    if (opts.method === "HEAD") res.body?.cancel().catch(() => {});
    return { url, finalUrl: res.url || url, status: res.status, contentType: headers["content-type"] ?? "", headers, body };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `work` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readSitemapUrls(origin: string, robotsText: string, budget: Budget): Promise<{ read: boolean; urls: string[] }> {
  const declared = [...robotsText.matchAll(/^\s*sitemap\s*:\s*(https?:\/\/\S+)/gim)].map((m) => m[1]).slice(0, 3);
  const queue = [...new Set([...declared, `${origin}/sitemap.xml`])];
  const urls: string[] = [];
  let read = false;
  let fetches = 0;
  while (queue.length && fetches < 5 && remaining(budget) > 2_000) {
    const url = queue.shift()!;
    fetches += 1;
    if (!isSameSite(url, origin) || /\.gz$/i.test(url)) continue;
    const res = await fetchOne(url, budget, { timeoutMs: 6_000 });
    if (res.status !== 200 || !isSitemapXml(res.body)) continue;
    read = true;
    const locs = sitemapLocs(res.body);
    if (isSitemapIndex(res.body)) {
      // One level down, the first few children. Page sitemaps before image/video ones.
      const children = locs.sort((a, b) => Number(/image|video|news/i.test(a)) - Number(/image|video|news/i.test(b)));
      queue.push(...children.slice(0, 3));
    } else {
      urls.push(...locs);
    }
    if (urls.length >= 2_000) break;
  }
  return { read, urls };
}

export async function runSiteCrawlAgent(homeUrl: string): Promise<SiteCrawlResult> {
  const budget: Budget = { deadline: Date.now() + CRAWL_LIMITS.totalBudgetMs };
  try {
    const home = await fetchOne(homeUrl, budget);
    if (home.status === 0) {
      return { checks: siteCrawlUnavailable("the homepage did not answer the crawl."), observation: null, collectorError: "homepage did not answer" };
    }
    const homeBase = home.finalUrl || homeUrl;
    const origin = new URL(homeBase).origin;

    const [robots, catchAll] = await Promise.all([
      fetchOne(`${origin}/robots.txt`, budget, { maxBytes: 512 * 1024, timeoutMs: 5_000 }),
      fetchOne(`${origin}/__pulse_crawl_${Math.random().toString(36).slice(2, 10)}`, budget, { maxBytes: 512 * 1024, timeoutMs: 6_000 }),
    ]);
    const robotsText = robots.status === 200 && !/<html\b/i.test(robots.body.slice(0, 500)) ? robots.body : "";
    const rules: RobotsRules | null = robotsText ? parseRobots(robotsText) : null;
    const sitemap = await readSitemapUrls(origin, robotsText, budget);

    const homeLinks = analysePage(home.body, home.headers).links;
    const candidates: CrawlCandidate[] = [
      ...homeLinks.map((url) => ({ url, source: "link" as const })),
      ...sitemap.urls.map((url) => ({ url, source: "sitemap" as const })),
    ];
    const { selected, robotsBlocked } = selectPages(candidates, homeBase, CRAWL_LIMITS.maxPages - 1, rules);

    const fetched = await pool(selected, CRAWL_LIMITS.concurrency, (c) => fetchOne(c.url, budget));
    const pages: CrawledPage[] = selected.map((c, i) => ({ fetch: fetched[i], kind: c.kind, source: c.source }));

    // Internal links found on every page that is really a page.
    const ctx = { home, catchAllBody: catchAll.status === 200 ? catchAll.body : null };
    const readablePages = [home, ...pages.filter((p) => classifyPage(p.fetch, ctx) === "page").map((p) => p.fetch)];

    // Legal and trust pages, for the checks that ask what the business publishes
    // (crawl-evidence.ts): linked from the pages read, then one hop on from those.
    const fetchedIds = new Set<string>([pageIdentity(homeBase), ...pages.map((p) => pageIdentity(p.fetch.finalUrl || p.fetch.url)), ...selected.map((c) => pageIdentity(c.url))]);
    const linksOn = (list: FetchedPage[]): FoundLink[] =>
      list.flatMap((page) => pageAnchors(page.body).map((a) => ({ href: a.href, text: a.text, base: page.finalUrl || page.url })));
    const readTrust = async (picks: Array<{ url: string; topic: TrustTopic }>) => {
      for (const p of picks) fetchedIds.add(pageIdentity(p.url));
      const got = await pool(picks, CRAWL_LIMITS.concurrency, (p) => fetchOne(p.url, budget));
      return picks.map((p, i) => ({ fetch: got[i], topic: p.topic }));
    };
    const trustPages = await readTrust(selectTrustPages(linksOn(readablePages), homeBase, fetchedIds, CRAWL_LIMITS.maxTrustPages, rules));
    const trustReadable = trustPages.filter((t) => classifyPage(t.fetch, ctx) === "page").map((t) => t.fetch);
    for (const t of trustReadable) fetchedIds.add(pageIdentity(t.finalUrl || t.url));
    trustPages.push(...await readTrust(selectTrustPages(linksOn(trustReadable), homeBase, fetchedIds, CRAWL_LIMITS.maxTrustSecondHop, rules)));
    const linkSources = new Map<string, { url: string; from: Set<string> }>();
    for (const page of readablePages) {
      const base = page.finalUrl || page.url;
      for (const href of analysePage(page.body, page.headers).links) {
        const target = normaliseCandidate(href, base, homeBase);
        if (!target) continue;
        const id = pageIdentity(target);
        const entry = linkSources.get(id) ?? { url: target, from: new Set<string>() };
        entry.from.add(base);
        linkSources.set(id, entry);
      }
    }
    // A crawled page already answered: reuse its status rather than asking twice.
    const known = new Map<string, number>();
    for (const p of pages) if (p.fetch.status !== 0) known.set(pageIdentity(p.fetch.url), p.fetch.status);
    known.set(pageIdentity(homeBase), home.status);
    const allLinks = [...linkSources.values()];
    const toCheck = allLinks.slice(0, CRAWL_LIMITS.maxLinkChecks);
    const linkChecks: LinkCheck[] = await pool(toCheck, CRAWL_LIMITS.concurrency, async (link) => {
      const from = [...link.from];
      const cached = known.get(pageIdentity(link.url));
      if (cached !== undefined) return { url: link.url, status: cached, from };
      const head = await fetchOne(link.url, budget, { method: "HEAD", timeoutMs: 6_000 });
      if (head.status >= 200 && head.status < 400) return { url: link.url, status: head.status, from };
      // Many servers answer HEAD with 404/405 where GET works. Only a GET 404/410 counts.
      const get = await fetchOne(link.url, budget, { maxBytes: 64 * 1024, timeoutMs: 6_000 });
      return { url: link.url, status: get.status, from };
    });

    // Sitemap URLs on this site, first hop only so a redirect is visible.
    const sitemapSample = [...new Set(sitemap.urls.filter((u) => isSameSite(u, homeBase)))].slice(0, CRAWL_LIMITS.maxSitemapChecks);
    const sitemapChecks: SitemapCheck[] = await pool(sitemapSample, CRAWL_LIMITS.concurrency, async (url) => {
      let res = await fetchOne(url, budget, { method: "HEAD", follow: false, timeoutMs: 6_000 });
      if (res.status === 405 || res.status === 501 || res.status === 403 || res.status === 404) {
        res = await fetchOne(url, budget, { follow: false, maxBytes: 16 * 1024, timeoutMs: 6_000 });
      }
      // A redirect that only adds or removes a trailing slash, or upgrades to https on the
      // same path, is still a redirect, and is reported as one: the sitemap should list
      // the final address.
      return { url, status: res.status };
    });

    const observation: CrawlObservation = {
      home,
      pages,
      catchAll: catchAll.status === 0 ? null : { status: catchAll.status, body: catchAll.body },
      linkChecks,
      linksFound: allLinks.length,
      sitemap: { read: sitemap.read, urlCount: sitemap.urls.length, checks: sitemapChecks },
      robotsBlocked,
      budgetExhausted: remaining(budget) <= 0,
      trustPages,
    };
    return { checks: evaluateSiteCrawl(observation), observation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "crawl failed";
    return { checks: siteCrawlUnavailable("the crawl could not run."), observation: null, collectorError: message.slice(0, 160) };
  }
}
