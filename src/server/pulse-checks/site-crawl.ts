/**
 * Site crawl: what Pulse finds on the pages BEYOND the one it was given.
 *
 * A website scan used to read the homepage and a fixed set of probes, so a broken link
 * on the pricing page, an http:// script on the checkout page or a canonical tag that
 * points every page at the homepage went unseen. The agent
 * (pulse-agents/site-crawl-agent.ts) fetches a bounded set of same-site pages; this
 * module is the PURE half: which pages to pick, how to read each one, and what the
 * evidence supports. No network here, so every rule is unit-tested.
 *
 * Honesty rules, each learned the hard way elsewhere in Pulse:
 *  - A 200 is not a page. Many hosts answer any path with the homepage (catch-all 200),
 *    so a page whose content IS the homepage, or IS the random-path baseline, is a
 *    soft 404 and is never counted as a page or judged as one.
 *  - A bot wall, a 401/403/429/5xx or a timeout is "could not read", never a finding.
 *  - An unrendered app shell cannot be judged on its content (titles, descriptions,
 *    images, canonical). Its static markup (lang, viewport, scripts, headers) is real.
 *  - A PASS needs at least MIN_PAGES_BEYOND_HOME readable pages beyond the homepage.
 *    A defect actually observed stands on whatever was read, and says how much that was.
 *  - Every detail names how many pages were read and lists the URLs it is about.
 */
import { CATEGORIES } from "./categories";
import { detectUrlSurfaceKind } from "./platform-applicability";
import { isEmptyShell } from "@/server/pulse-lite/spa-detect";
import type { PulseScanCheckInput } from "@/types/pulse";

// ── Bounds ──────────────────────────────────────────────────────────────────

export const CRAWL_LIMITS = {
  /** Pages fetched in total, the homepage included. */
  maxPages: 15,
  concurrency: 4,
  pageTimeoutMs: 8_000,
  totalBudgetMs: 45_000,
  maxBodyBytes: 2 * 1024 * 1024,
  /** Distinct internal link targets checked for 404/410. */
  maxLinkChecks: 40,
  /** Sitemap URLs whose status is checked. */
  maxSitemapChecks: 10,
  /** Legal and trust pages linked from the pages read, then one hop further from those. */
  maxTrustPages: 6,
  maxTrustSecondHop: 4,
} as const;

/** Readable pages beyond the homepage needed before a crawl check may PASS. */
export const MIN_PAGES_BEYOND_HOME = 2;
/** URLs quoted in a detail, so a reader can check by hand. */
const MAX_QUOTED = 5;

// ── URLs ────────────────────────────────────────────────────────────────────

/** `www.` and the apex are the same site; every other subdomain is a different one. */
export function siteHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export function isSameSite(url: string, home: string): boolean {
  try {
    return siteHost(new URL(url).hostname) === siteHost(new URL(home).hostname);
  } catch {
    return false;
  }
}

const ASSET_EXTENSION =
  /\.(?:pdf|jpe?g|png|gif|svg|webp|avif|ico|bmp|tiff?|css|js|mjs|map|json|xml|rss|atom|txt|csv|zip|gz|tgz|rar|7z|dmg|exe|msi|pkg|apk|ipa|mp3|mp4|m4a|m4v|mov|avi|webm|ogg|wav|woff2?|ttf|otf|eot|docx?|xlsx?|pptx?|psd|ai|eps)$/i;

/** Paths a crawler should not walk into: sign-out links, back offices, platform plumbing. */
const SKIP_PATH =
  /(?:^|\/)(?:log-?out|sign-?out|logoff|wp-admin|wp-login\.php|wp-json|xmlrpc\.php|admin|administrator|cdn-cgi|api|graphql|feed|rss|_next|static|assets|cart\/(?:add|clear|change)|unsubscribe)(?:\/|$|\?)/i;

const TRACKING_PARAM = /^(?:utm_[a-z]+|gclid|fbclid|mc_[a-z]+|ref|_hs[a-z]+|hsa_[a-z]+)$/i;

/**
 * Resolve an href against the page it was found on and return the URL Pulse would
 * request, or null when it is not a same-site HTML page worth visiting.
 */
export function normaliseCandidate(href: string, base: string, home: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(?:mailto|tel|sms|javascript|data|blob|ftp|file|about):/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isSameSite(url.toString(), home)) return null;
  if (ASSET_EXTENSION.test(url.pathname)) return null;
  if (SKIP_PATH.test(url.pathname)) return null;
  if (url.pathname.length > 300) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  // Pages that differ only by a long query (filters, sort orders, search results) are
  // not distinct pages a reviewer would pick, and can multiply without bound.
  if ([...url.searchParams.keys()].length > 2) return null;
  // The homepage's own protocol: a same-site http:// link is the same page.
  try {
    url.protocol = new URL(home).protocol;
  } catch {
    /* keep */
  }
  return url.toString();
}

/** The identity of a page for de-duplication: host without www, path, query. */
export function pageIdentity(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${siteHost(u.hostname)}${path.toLowerCase()}${u.search}`;
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function isHomePath(url: string): boolean {
  const p = pathOf(url).replace(/\/+$/, "");
  return p === "" || /^\/(?:index\.(?:html?|php))?$/i.test(p);
}

// ── Page selection ──────────────────────────────────────────────────────────

export type PageKind =
  | "pricing" | "signup" | "login" | "contact" | "about" | "product"
  | "article" | "blog" | "checkout" | "docs";

/** In the order a reviewer would reach for them. */
const KIND_PATTERNS: ReadonlyArray<{ kind: PageKind; re: RegExp }> = [
  { kind: "pricing", re: /(?:^|\/)(?:pricing|prices|plans|plans-and-pricing)(?:\/|$)/i },
  { kind: "signup", re: /(?:^|\/)(?:sign-?up|register|join|get-started|create-account|start-free|trial|free-trial)(?:\/|$)/i },
  { kind: "login", re: /(?:^|\/)(?:log-?in|sign-?in|account\/login)(?:\/|$)/i },
  { kind: "contact", re: /(?:^|\/)(?:contact(?:-us)?|get-in-touch|enquir(?:y|ies)|support)(?:\/|$)/i },
  { kind: "about", re: /(?:^|\/)(?:about(?:-us)?|company|team|our-story|who-we-are)(?:\/|$)/i },
  { kind: "product", re: /(?:^|\/)(?:product|products|features|platform|solutions|services|how-it-works|shop|collections)(?:\/|$)/i },
  { kind: "article", re: /(?:^|\/)(?:blog|news|articles|insights|stories|posts|journal)\/[^/]+/i },
  { kind: "blog", re: /(?:^|\/)(?:blog|news|articles|insights|stories|posts|journal)\/?$/i },
  { kind: "checkout", re: /(?:^|\/)(?:checkout|cart|basket|bag)(?:\/|$)/i },
  { kind: "docs", re: /(?:^|\/)(?:docs|documentation|help|guides|faq|resources)(?:\/|$)/i },
];

export function pageKind(url: string): PageKind | null {
  const path = pathOf(url);
  for (const { kind, re } of KIND_PATTERNS) if (re.test(path)) return kind;
  return null;
}

export interface CrawlCandidate {
  url: string;
  source: "link" | "sitemap";
}

/** How deep a URL sits, for "shallow first". */
function depth(url: string): number {
  return pathOf(url).split("/").filter(Boolean).length;
}

/**
 * Pick up to `limit` pages to read, the homepage excluded: one of each kind a reviewer
 * would pick first (shallowest wins), then the rest, homepage links before sitemap
 * entries and shallow before deep. Robots-disallowed and duplicate URLs never appear.
 */
export function selectPages(
  candidates: CrawlCandidate[],
  home: string,
  limit: number,
  robots: RobotsRules | null,
): { selected: Array<CrawlCandidate & { kind: PageKind | null }>; robotsBlocked: number } {
  const homeId = pageIdentity(home);
  // One entry per page; a homepage link beats a sitemap entry for the same page, because
  // the link is the address the site itself uses.
  const byId = new Map<string, CrawlCandidate>();
  const blocked = new Set<string>();
  for (const c of candidates) {
    const normalised = normaliseCandidate(c.url, home, home);
    if (!normalised) continue;
    const id = pageIdentity(normalised);
    // The homepage with a query string (gnu.org's ?distro= switcher) is the homepage again.
    if (id === homeId || pathOf(normalised).replace(/\/+$/, "") === pathOf(home).replace(/\/+$/, "") || blocked.has(id)) continue;
    if (robots && !robotsAllows(robots, pathAndQuery(normalised))) {
      blocked.add(id);
      continue;
    }
    const existing = byId.get(id);
    if (!existing || (existing.source === "sitemap" && c.source === "link")) byId.set(id, { url: normalised, source: c.source });
  }
  const unique = [...byId.values()];
  const robotsBlocked = blocked.size;
  const rank = (c: CrawlCandidate) => (c.source === "link" ? 0 : 1) * 100 + depth(c.url);
  const ordered = unique.map((c, index) => ({ c, index })).sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index).map((x) => x.c);

  const selected: Array<CrawlCandidate & { kind: PageKind | null }> = [];
  const taken = new Set<string>();
  for (const { kind } of KIND_PATTERNS) {
    if (selected.length >= limit) break;
    const pick = ordered.find((c) => !taken.has(c.url) && pageKind(c.url) === kind);
    if (pick) {
      selected.push({ ...pick, kind });
      taken.add(pick.url);
    }
  }
  for (const c of ordered) {
    if (selected.length >= limit) break;
    if (taken.has(c.url)) continue;
    selected.push({ ...c, kind: pageKind(c.url) });
    taken.add(c.url);
  }
  return { selected, robotsBlocked };
}

// ── Trust and legal pages ───────────────────────────────────────────────────
//
// A business publishes its sub-processor list, privacy notice, company details and
// policies on legal and trust pages, not the homepage. The checks that ask about them
// (crawl-evidence.ts) need those pages, which the pick above rarely reaches. So they are
// fetched as a separate, small set: from the links of every page already read, and one
// hop further from the trust pages themselves (a privacy policy that links "Your rights").

export type TrustTopic =
  | "subprocessors" | "privacy" | "rights" | "trust" | "security" | "legal" | "terms"
  | "imprint" | "ethics" | "sla";

/** In priority order. A link matches on its path or its readable text. */
const TRUST_PATTERNS: ReadonlyArray<{ topic: TrustTopic; path: RegExp; text: RegExp }> = [
  { topic: "subprocessors", path: /(?:^|\/)(?:sub-?processors?|subprocessor-list|sub-processor-list)(?:[/.]|$)/i, text: /^\s*(?:list of\s+)?sub-?processors?\b/i },
  { topic: "privacy", path: /(?:^|\/)(?:privacy(?:-policy|-notice|-statement)?|data-protection|datenschutz|gdpr)(?:[/.]|$)/i, text: /^\s*(?:our\s+)?(?:privacy(?:\s+(?:policy|notice|statement|centre|center))?|data protection(?:\s+(?:policy|notice))?|gdpr)\s*$/i },
  { topic: "rights", path: /(?:^|\/)(?:your-(?:privacy-)?rights|privacy-rights|data-subject-(?:rights|requests?)|individual-rights)(?:[/.]|$)/i, text: /\b(?:your\s+(?:privacy\s+|data\s+)?rights|data\s+subject\s+rights|individual\s+rights|privacy\s+rights)\b/i },
  { topic: "trust", path: /(?:^|\/)(?:trust(?:-center|-centre)?|compliance)(?:[/.]|$)/i, text: /^\s*(?:trust(?:\s+(?:center|centre|portal))?|compliance)\s*$/i },
  { topic: "security", path: /(?:^|\/)security(?:[/.]|$)/i, text: /^\s*security\s*$/i },
  { topic: "legal", path: /(?:^|\/)(?:legal|policies)(?:[/.]|$)/i, text: /^\s*(?:legal|policies|legal notices?)\s*$/i },
  { topic: "terms", path: /(?:^|\/)(?:terms(?:-of-(?:service|use))?|tos|terms-and-conditions)(?:[/.]|$)/i, text: /^\s*terms(?:\s+(?:of\s+(?:service|use)|(?:and|&)\s+conditions))?\s*$/i },
  { topic: "imprint", path: /(?:^|\/)(?:imprint|impressum|legal-notice|mentions-legales|company-information)(?:[/.]|$)/i, text: /^\s*(?:imprint|impressum|legal notice|mentions l[ée]gales|company information)\s*$/i },
  { topic: "ethics", path: /(?:^|\/)(?:modern-?slavery[\w-]*|whistle-?blow[\w-]*|speak-?up|anti-?bribery[\w-]*|code-of-conduct|ethics)(?:[/.]|$)/i, text: /\bmodern slavery\b|\bwhistle-?blow|\bspeak[- ]up\b|\banti-?bribery\b|\bcode of conduct\b|^\s*ethics\s*$/i },
  { topic: "sla", path: /(?:^|\/)(?:sla|service-level-agreement|support-policy)(?:[/.]|$)/i, text: /^\s*(?:sla|service level agreement|support policy)\s*$/i },
];

export function trustTopic(url: string, text = ""): TrustTopic | null {
  const path = pathOf(url);
  for (const { topic, path: p, text: t } of TRUST_PATTERNS) if (p.test(path) || (text && t.test(text))) return topic;
  return null;
}

export interface FoundLink {
  href: string;
  text: string;
  /** The page the link was found on, to resolve it against. */
  base: string;
}

/**
 * Up to `limit` legal and trust pages to read: one per topic first, in priority order and
 * shallowest first, then any others. Pages in `exclude` (already read, the homepage) and
 * robots-disallowed pages never appear.
 */
export function selectTrustPages(
  links: FoundLink[],
  home: string,
  exclude: ReadonlySet<string>,
  limit: number,
  robots: RobotsRules | null,
): Array<{ url: string; topic: TrustTopic }> {
  const byId = new Map<string, { url: string; topic: TrustTopic }>();
  for (const link of links) {
    const url = normaliseCandidate(link.href, link.base, home);
    if (!url) continue;
    const id = pageIdentity(url);
    if (exclude.has(id) || byId.has(id) || isHomePath(url)) continue;
    const topic = trustTopic(url, link.text);
    if (!topic) continue;
    if (robots && !robotsAllows(robots, pathAndQuery(url))) continue;
    byId.set(id, { url, topic });
  }
  const priority = (t: TrustTopic) => TRUST_PATTERNS.findIndex((p) => p.topic === t);
  const ordered = [...byId.values()].sort((a, b) => priority(a.topic) - priority(b.topic) || depth(a.url) - depth(b.url));
  const picked: Array<{ url: string; topic: TrustTopic }> = [];
  const topics = new Set<TrustTopic>();
  for (const c of ordered) {
    if (picked.length >= limit) break;
    if (topics.has(c.topic)) continue;
    picked.push(c);
    topics.add(c.topic);
  }
  for (const c of ordered) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

function pathAndQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}

// ── robots.txt ──────────────────────────────────────────────────────────────

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/**
 * The rules that apply to every crawler (`User-agent: *`). Consecutive User-agent lines
 * share the group that follows them, per RFC 9309.
 */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { allow: [], disallow: [] };
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    if (field !== "allow" && field !== "disallow") continue;
    inRules = true;
    if (!agents.includes("*")) continue;
    if (!value) continue; // "Disallow:" with nothing allows everything
    (field === "allow" ? rules.allow : rules.disallow).push(value);
  }
  return rules;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    `^${body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`,
  );
  return re.test(path);
}

/** Longest matching rule wins; on a tie, Allow wins (RFC 9309 §2.2.2). */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const [list, allow] of [[rules.disallow, false], [rules.allow, true]] as const) {
    for (const pattern of list) {
      if (!robotsPatternMatches(pattern, path)) continue;
      const length = pattern.length;
      if (!best || length > best.length || (length === best.length && allow)) best = { length, allow };
    }
  }
  return best ? best.allow : true;
}

// ── Sitemaps ────────────────────────────────────────────────────────────────

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => m[1].replace(/&amp;/g, "&"));
}

export const isSitemapIndex = (xml: string) => /<sitemapindex\b/i.test(xml);
export const isSitemapXml = (xml: string) => /<(?:urlset|sitemapindex)\b/i.test(xml);

// ── Reading a page ──────────────────────────────────────────────────────────

/** What the agent fetched. status 0 = the request failed or timed out. */
export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  body: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Markup with comments, script bodies and style bodies removed (tags kept). */
function stripNonMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>")
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, "$1</style>")
    .replace(/(<template\b[^>]*>)[\s\S]*?<\/template>/gi, "$1</template>");
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

function tags(markup: string, name: string): string[] {
  return [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);
}

const norm = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export interface PageAnalysis {
  title: string | null;
  metaDescription: string | null;
  lang: string | null;
  hasViewport: boolean;
  canonical: string | null;
  noindex: boolean;
  /** http:// subresources that browsers block on an https page. */
  activeMixed: string[];
  /** http:// images and media, which browsers upgrade or load with a warning. */
  passiveMixed: string[];
  insecureFormActions: string[];
  images: number;
  imagesMissingAlt: number;
  /** src of each content image with no alt attribute. */
  missingAltSrcs: string[];
  /** src of each content image. */
  imageSrcs: string[];
  links: string[];
  upgradeInsecureRequests: boolean;
}

export function analysePage(html: string, headers: Record<string, string> = {}): PageAnalysis {
  const markup = stripNonMarkup(html);
  // The page's title, not an inline SVG's own <title> (gov.uk's crown logo). It is not
  // restricted to <head>: Next.js streams metadata into <body> for some requests, and
  // browsers take the document title from there too.
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(markup.replace(/<svg\b[\s\S]*?<\/svg>/gi, " "));
  const title = titleMatch ? norm(titleMatch[1]) : null;

  let metaDescription: string | null = null;
  let hasViewport = false;
  let noindex = false;
  let cspMeta = "";
  for (const tag of tags(markup, "meta")) {
    const name = (attr(tag, "name") ?? "").toLowerCase();
    const httpEquiv = (attr(tag, "http-equiv") ?? "").toLowerCase();
    const content = attr(tag, "content") ?? "";
    if (name === "description" && metaDescription === null) metaDescription = norm(content);
    if (name === "viewport" && content.trim()) hasViewport = true;
    if ((name === "robots" || name === "googlebot") && /\bnoindex\b|\bnone\b/i.test(content)) noindex = true;
    if (httpEquiv === "content-security-policy") cspMeta += ` ${content}`;
  }
  if (/\bnoindex\b|\bnone\b/i.test(headers["x-robots-tag"] ?? "")) {
    // An X-Robots-Tag scoped to a named crawler ("otherbot: noindex") is not a general noindex.
    const general = (headers["x-robots-tag"] ?? "").split(",").some((part) => !/^\s*[a-z0-9_-]+\s*:/i.test(part) && /\bnoindex\b|\bnone\b/i.test(part));
    if (general) noindex = true;
  }

  const htmlTag = /<html\b[^>]*>/i.exec(markup)?.[0] ?? "";
  const langValue = htmlTag ? attr(htmlTag, "lang") ?? attr(htmlTag, "xml:lang") : null;
  const lang = langValue && langValue.trim() ? langValue.trim() : null;

  let canonical: string | null = null;
  for (const tag of tags(markup, "link")) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical") && canonical === null) canonical = attr(tag, "href");
  }

  // <noscript> content is only loaded when scripts are off, so a normal visit never
  // requests it (bbc.co.uk/iplayer's http:// comScore pixel lives in one).
  const live = markup.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const activeMixed: string[] = [];
  const passiveMixed: string[] = [];
  const isHttp = (v: string | null): v is string => Boolean(v && /^http:\/\//i.test(v.trim()));
  for (const tag of tags(live, "script")) {
    const src = attr(tag, "src");
    if (isHttp(src)) activeMixed.push(src.trim());
  }
  for (const tag of [...tags(live, "iframe"), ...tags(live, "frame"), ...tags(live, "embed")]) {
    const src = attr(tag, "src");
    if (isHttp(src)) activeMixed.push(src.trim());
  }
  for (const tag of tags(live, "object")) {
    const data = attr(tag, "data");
    if (isHttp(data)) activeMixed.push(data.trim());
  }
  for (const tag of tags(live, "link")) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr(tag, "href");
    if (!isHttp(href)) continue;
    if (rel.includes("stylesheet") || rel.includes("modulepreload") || (rel.includes("preload") && /^(?:script|style)$/i.test(attr(tag, "as") ?? ""))) {
      activeMixed.push(href.trim());
    } else if (rel.includes("icon") || rel.includes("apple-touch-icon")) {
      passiveMixed.push(href.trim());
    }
  }
  for (const name of ["img", "audio", "video", "source"]) {
    for (const tag of tags(live, name)) {
      const src = attr(tag, "src");
      if (isHttp(src)) passiveMixed.push(src.trim());
    }
  }

  const insecureFormActions: string[] = [];
  for (const tag of tags(markup, "form")) {
    const action = attr(tag, "action");
    if (isHttp(action)) insecureFormActions.push(action.trim());
  }

  // Images: alt="" is a deliberate "decorative" marker and is correct. Tracking pixels and
  // images hidden from assistive technology are not content images.
  let images = 0;
  let imagesMissingAlt = 0;
  const imageSrcs: string[] = [];
  const missingAltSrcs: string[] = [];
  for (const tag of tags(live, "img")) {
    const w = attr(tag, "width");
    const h = attr(tag, "height");
    if ((w !== null && /^[01](?:px)?$/.test(w.trim())) || (h !== null && /^[01](?:px)?$/.test(h.trim()))) continue;
    if (/aria-hidden\s*=\s*["']?true/i.test(tag) || /role\s*=\s*["']?(?:presentation|none)\b/i.test(tag)) continue;
    images += 1;
    const src = attr(tag, "src") ?? attr(tag, "data-src") ?? `inline-${images}`;
    imageSrcs.push(src);
    if (!/\salt(?=[\s=/>]|$)/i.test(tag)) {
      imagesMissingAlt += 1;
      missingAltSrcs.push(src);
    }
  }

  const links = tags(markup, "a").map((t) => attr(t, "href")).filter((h): h is string => Boolean(h && h.trim()));

  const csp = `${headers["content-security-policy"] ?? ""} ${cspMeta}`;
  return {
    title,
    metaDescription,
    lang,
    hasViewport,
    canonical,
    noindex,
    activeMixed,
    passiveMixed,
    insecureFormActions,
    images,
    imagesMissingAlt,
    missingAltSrcs,
    imageSrcs,
    links,
    upgradeInsecureRequests: /\bupgrade-insecure-requests\b/i.test(csp),
  };
}

// ── What a fetched page is ──────────────────────────────────────────────────

export type PageVerdict =
  | "page"          // a real, readable page
  | "not_found"     // 404 / 410
  | "soft_404"      // answered 200 with the homepage or the catch-all response
  | "shell_echo"    // answered with the same unrendered app shell as every other address
  | "redirect_home" // a redirect that landed on the homepage
  | "offsite"       // a redirect that left the site
  | "challenge"     // a bot wall or challenge page
  | "unreadable"    // 401 / 403 / 429 / 5xx / other non-200
  | "failed"        // the request failed or timed out
  | "not_html";

/** Bot walls by their own markup, beyond the interstitials platform-applicability knows. */
export function isChallengePage(page: Pick<FetchedPage, "status" | "body" | "headers">): boolean {
  const body = page.body.slice(0, 20_000);
  if (detectUrlSurfaceKind(body) === "ACCESS_INTERSTITIAL") return true;
  const title = (/<title\b[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(body)?.[1] ?? "").trim().toLowerCase();
  if (/^(?:just a moment|attention required|access denied|client challenge|one moment, please|please wait|ddos-guard|security check|are you a robot\??)/.test(title)) return true;
  if (/_incapsula_resource|\/_sec\/cp_challenge|cf-browser-verification|challenges\.cloudflare\.com\/turnstile.*(?:verify you are human)/i.test(body)) return true;
  if (page.headers["cf-mitigated"] === "challenge") return true;
  return false;
}

/** Visible words, for comparing two documents. */
function visibleWords(html: string): string[] {
  return norm(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " "),
  )
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 3000);
}

/**
 * Are these the same document? Same title and almost the same words. Nonces, tokens and
 * timestamps differ between two loads of one page; a distinct page has its own title or
 * its own content.
 */
export function sameDocument(a: string, b: string): boolean {
  const titleOf = (h: string) => norm(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] ?? "").toLowerCase();
  if (titleOf(a) !== titleOf(b)) return false;
  const wa = new Set(visibleWords(a));
  const wb = new Set(visibleWords(b));
  if (wa.size === 0 && wb.size === 0) {
    // Two empty shells with the same title: compare the markup itself.
    const strip = (h: string) => h.replace(/\s+/g, " ").replace(/(?:nonce|integrity|data-[a-z-]*id)="[^"]*"/gi, "").length;
    const la = strip(a);
    const lb = strip(b);
    return Math.abs(la - lb) <= Math.max(la, lb) * 0.05;
  }
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const union = wa.size + wb.size - shared;
  return union === 0 ? true : shared / union >= 0.95;
}

export function looksLikeHtml(page: Pick<FetchedPage, "contentType" | "body">): boolean {
  if (/text\/html|application\/xhtml/i.test(page.contentType)) return true;
  if (page.contentType && !/text\/plain|octet-stream/i.test(page.contentType)) return false;
  return /^\s*(?:<!doctype html|<html\b)/i.test(page.body.slice(0, 500));
}

export interface ClassifyContext {
  home: FetchedPage;
  /** The answer to a random path that cannot exist, when it answered 200. */
  catchAllBody: string | null;
}

export function classifyPage(page: FetchedPage, ctx: ClassifyContext): PageVerdict {
  if (page.status === 0) return "failed";
  if (page.status === 404 || page.status === 410) return "not_found";
  if (isChallengePage(page)) return "challenge";
  if (page.status !== 200) return "unreadable";
  if (!isSameSite(page.finalUrl || page.url, ctx.home.finalUrl || ctx.home.url)) return "offsite";
  if (!looksLikeHtml(page)) return "not_html";
  const homeId = pageIdentity(ctx.home.finalUrl || ctx.home.url);
  const requestedHome = isHomePath(page.url) || pageIdentity(page.url) === homeId;
  const landed = page.finalUrl || page.url;
  if (!requestedHome && (isHomePath(landed) || pageIdentity(landed) === homeId)) return "redirect_home";
  // The same document as the homepage, or as the answer to an address that cannot exist.
  // When that document is an unrendered app shell the page may well be real, but its
  // content is drawn by script, so it can be neither counted nor read.
  if (!requestedHome && sameDocument(page.body, ctx.home.body)) return isEmptyShell(page.body) ? "shell_echo" : "soft_404";
  if (ctx.catchAllBody !== null && sameDocument(page.body, ctx.catchAllBody)) return isEmptyShell(page.body) ? "shell_echo" : "soft_404";
  return "page";
}

// ── The observation the agent hands over ────────────────────────────────────

export interface CrawledPage {
  fetch: FetchedPage;
  kind: PageKind | null;
  source: "link" | "sitemap";
}

export interface LinkCheck {
  url: string;
  /** Final status; 0 = could not be checked (failed, timed out, or out of budget). */
  status: number;
  /** Pages the link was found on. */
  from: string[];
}

export interface SitemapCheck {
  url: string;
  /** First-hop status, redirects NOT followed. 0 = could not be checked. */
  status: number;
}

export interface CrawlObservation {
  home: FetchedPage;
  pages: CrawledPage[];
  /** null = the random-path probe could not be made, so soft 404s are judged on the homepage alone. */
  catchAll: { status: number; body: string } | null;
  linkChecks: LinkCheck[];
  /** Distinct same-site link targets found, before the cap. */
  linksFound: number;
  sitemap: { read: boolean; urlCount: number; checks: SitemapCheck[] };
  robotsBlocked: number;
  budgetExhausted: boolean;
  /**
   * Legal and trust pages read for the content checks (crawl-evidence.ts). Not judged by
   * the crawl_* checks, which keep to the pages a visitor reaches first.
   */
  trustPages?: Array<{ fetch: FetchedPage; topic: TrustTopic }>;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export const SITE_CRAWL_KEYS = [
  "crawl_pages_read",
  "crawl_broken_internal_links",
  "crawl_page_titles",
  "crawl_meta_descriptions",
  "crawl_mixed_content",
  "crawl_insecure_forms",
  "crawl_html_lang",
  "crawl_viewport_meta",
  "crawl_canonical_tags",
  "crawl_noindex_key_pages",
  "crawl_security_headers_consistent",
  "crawl_sitemap_urls",
  "crawl_image_alt_text",
] as const;
export type SiteCrawlKey = (typeof SITE_CRAWL_KEYS)[number];

type Row = Omit<PulseScanCheckInput, "checkKey" | "label" | "category">;

function inconclusive(why: string): Row {
  return { status: "INCONCLUSIVE", detail: why, confidence: "LOW", confidenceReason: "The crawl could not read enough of the site to answer this." };
}
function observed(status: PulseScanCheckInput["status"], detail: string, evidence?: unknown): Row {
  return {
    status,
    detail,
    confidence: "HIGH",
    confidenceReason: "Read directly from the pages the crawl fetched.",
    evidenceStrength: "VERIFIED",
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 2000) } : {}),
  };
}

function quote(urls: string[]): string {
  const unique = [...new Set(urls)];
  const shown = unique.slice(0, MAX_QUOTED).join(", ");
  return unique.length > MAX_QUOTED ? `${shown} and ${unique.length - MAX_QUOTED} more` : shown;
}

const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function evaluateSiteCrawl(obs: CrawlObservation): PulseScanCheckInput[] {
  const ctx: ClassifyContext = {
    home: obs.home,
    catchAllBody: obs.catchAll && obs.catchAll.status === 200 ? obs.catchAll.body : null,
  };
  const homeVerdict = classifyPage(obs.home, { home: obs.home, catchAllBody: null });
  const homeReadable = homeVerdict === "page";

  const verdicts = obs.pages.map((p) => ({ p, verdict: classifyPage(p.fetch, ctx) }));
  const readable = verdicts.filter((v) => v.verdict === "page").map((v) => v.p);
  // Pages judged on their content: real pages that are not unrendered shells.
  const all = homeReadable ? [{ fetch: obs.home, kind: null, source: "link" as const }, ...readable] : readable;
  const analysedAll = all.map((p) => ({ p, url: p.fetch.finalUrl || p.fetch.url, a: analysePage(p.fetch.body, p.fetch.headers), shell: isEmptyShell(p.fetch.body) }));
  const shells = analysedAll.filter((x) => x.shell).length;

  const beyond = readable.length;
  const enough = homeReadable && beyond >= MIN_PAGES_BEYOND_HOME;
  // With too little read, a defect seen on another page still stands, but the homepage
  // alone is the single-page checks' job: reporting it here would be the same finding twice.
  const analysed = enough ? analysedAll : analysedAll.filter((x) => x.p.fetch !== obs.home);
  const contentPages = analysed.filter((x) => !x.shell);
  const count = (verdict: PageVerdict) => verdicts.filter((v) => v.verdict === verdict).length;
  const notRead: string[] = [];
  if (count("shell_echo")) notRead.push(`${count("shell_echo")} served the same app shell as the homepage, with the content drawn by script, so they could not be read without a browser`);
  if (count("soft_404")) notRead.push(`${count("soft_404")} answered with the homepage or the site's catch-all page`);
  if (count("redirect_home")) notRead.push(`${count("redirect_home")} redirected to the homepage`);
  if (count("challenge")) notRead.push(`${count("challenge")} returned a bot check`);
  if (count("unreadable") + count("failed")) notRead.push(`${count("unreadable") + count("failed")} could not be read`);
  if (count("not_found")) notRead.push(`${count("not_found")} answered 404 or 410`);
  if (count("offsite") + count("not_html")) notRead.push(`${count("offsite") + count("not_html")} were not pages on this site`);
  const scope = `Read ${plural(all.length, "page")} (${homeReadable ? `the homepage and ${plural(beyond, "other page")}` : "the homepage could not be read"})${shells ? `, ${plural(shells, "of them", "of them")} an unrendered app shell` : ""}.`;
  const thin = `Only ${plural(beyond, "page")} beyond the homepage could be read${notRead.length ? ` (${notRead.join("; ")})` : ""}, so the site as a whole could not be judged. This is a gap in the scan, not a finding about the site.`;
  const thinContent = `Only ${plural(Math.max(0, contentPages.length - (homeReadable && !isEmptyShell(obs.home.body) ? 1 : 0)), "page")} beyond the homepage had readable content (unrendered app shells cannot be judged on their content), so this could not be judged across the site.`;
  const enoughContent = enough && contentPages.length - (homeReadable && !isEmptyShell(obs.home.body) ? 1 : 0) >= MIN_PAGES_BEYOND_HOME;

  const rows: Array<[SiteCrawlKey, Row]> = [];

  // ── Coverage ──
  rows.push(["crawl_pages_read", enough
    ? { ...observed("PASS", `${scope}${notRead.length ? ` Not counted: ${notRead.join("; ")}.` : ""}${obs.robotsBlocked ? ` ${plural(obs.robotsBlocked, "URL")} skipped because robots.txt disallows them.` : ""} Pages: ${quote(all.map((p) => p.fetch.finalUrl || p.fetch.url))}.`, { pages: all.map((p) => p.fetch.finalUrl || p.fetch.url) }), scoreEligible: false, completenessEligible: true }
    : { ...inconclusive(`${thin}${obs.budgetExhausted ? " The crawl ran out of time." : ""}`), scoreEligible: false, completenessEligible: true }]);

  // ── Broken internal links ──
  {
    const checked = obs.linkChecks.filter((l) => answered(l.status));
    const broken = checked.filter((l) => l.status === 404 || l.status === 410);
    const uncheckable = obs.linkChecks.length - checked.length;
    const sources = (l: LinkCheck) => (l.from.length ? ` (linked from ${l.from.slice(0, 2).join(", ")})` : "");
    const capNote = obs.linksFound > obs.linkChecks.length ? ` ${obs.linksFound} distinct internal links were found; the first ${obs.linkChecks.length} were checked.` : "";
    const uncheckNote = uncheckable ? ` ${plural(uncheckable, "link")} could not be checked (no answer, a bot check, or 401/403/429/5xx), which is not counted as broken.` : "";
    if (broken.length > 0) {
      rows.push(["crawl_broken_internal_links", observed(
        broken.length >= 3 ? "FAIL" : "WARN",
        `${plural(broken.length, "internal link")} answered 404 or 410: ${broken.slice(0, MAX_QUOTED).map((l) => `${l.url}${sources(l)}`).join("; ")}${broken.length > MAX_QUOTED ? ` and ${broken.length - MAX_QUOTED} more` : ""}. ${scope}${capNote}${uncheckNote} Fix or remove the links.`,
        { broken: broken.map((l) => ({ url: l.url, status: l.status, from: l.from.slice(0, 3) })) },
      )]);
    } else if (!enough || checked.length === 0) {
      rows.push(["crawl_broken_internal_links", inconclusive(checked.length === 0 ? `No internal links could be checked. ${scope}` : thin)]);
    } else if (ctx.catchAllBody !== null) {
      rows.push(["crawl_broken_internal_links", inconclusive(`${plural(checked.length, "internal link")} checked and none answered 404 or 410, but this site answers any address, even one that cannot exist, with a 200 page (after any redirect), so a missing page cannot be told apart from a real one by its status. ${scope}`)]);
    } else {
      rows.push(["crawl_broken_internal_links", observed("PASS", `${plural(checked.length, "internal link")} checked; none answered 404 or 410. ${scope}${capNote}${uncheckNote}`)]);
    }
  }

  // ── Titles ──
  {
    // A missing title fails people on every page (WCAG 2.4.2); a duplicated one matters for
    // search, so pages that ask not to be indexed (a login page) are not compared.
    const missing = contentPages.filter((x) => !x.a.title).map((x) => x.url);
    const dupes = duplicates(contentPages.filter((x) => x.a.title && !x.a.noindex).map((x) => ({ value: `${(x.a.lang ?? "").toLowerCase()}|${x.a.title!.toLowerCase()}`, url: x.url })));
    const problems: string[] = [];
    if (missing.length) problems.push(`${plural(missing.length, "page")} with no <title>: ${quote(missing)}`);
    if (dupes.length) problems.push(`the same title on different pages: ${dupes.slice(0, 3).map((d) => `"${d.value.slice(d.value.indexOf("|") + 1)}" on ${quote(d.urls)}`).join("; ")}`);
    if (problems.length) rows.push(["crawl_page_titles", observed("WARN", `${capitalise(problems.join(", and "))}. ${scope} Each page needs its own title so search results and browser tabs tell them apart.`, { missing, duplicates: dupes })]);
    else if (!enoughContent) rows.push(["crawl_page_titles", inconclusive(enough ? thinContent : thin)]);
    else rows.push(["crawl_page_titles", observed("PASS", `Every page read has its own title. ${scope}`)]);
  }

  // ── Meta descriptions ──
  {
    // A description is for search results: a page that asks not to be indexed needs none.
    const indexed = contentPages.filter((x) => !x.a.noindex);
    const missing = indexed.filter((x) => !x.a.metaDescription).map((x) => x.url);
    const dupes = duplicates(indexed.filter((x) => x.a.metaDescription).map((x) => ({ value: `${(x.a.lang ?? "").toLowerCase()}|${x.a.metaDescription!.toLowerCase()}`, url: x.url })));
    const problems: string[] = [];
    if (missing.length) problems.push(`${plural(missing.length, "page")} with no meta description: ${quote(missing)}`);
    if (dupes.length) problems.push(`the same description on different pages: ${dupes.slice(0, 2).map((d) => `${quote(d.urls)}`).join("; ")}`);
    if (problems.length) rows.push(["crawl_meta_descriptions", observed("WARN", `${capitalise(problems.join(", and "))}. ${scope} Search engines show the description under the title; without one they pick text from the page.`, { missing, duplicates: dupes })]);
    else if (!enoughContent) rows.push(["crawl_meta_descriptions", inconclusive(enough ? thinContent : thin)]);
    else rows.push(["crawl_meta_descriptions", observed("PASS", `Every page read has its own meta description. ${scope}`)]);
  }

  // ── Mixed content (static markup is real on a shell too) ──
  {
    const https = analysed.filter((x) => /^https:/i.test(x.url));
    const active = https.filter((x) => x.a.activeMixed.length && !x.a.upgradeInsecureRequests);
    const passive = https.filter((x) => x.a.passiveMixed.length && !x.a.upgradeInsecureRequests);
    const upgraded = https.filter((x) => x.a.upgradeInsecureRequests && (x.a.activeMixed.length || x.a.passiveMixed.length));
    if (active.length) {
      rows.push(["crawl_mixed_content", observed("FAIL", `${plural(active.length, "page")} served over https ${verb(active.length, "loads", "load")} scripts, stylesheets or frames over plain http, which browsers block: ${active.slice(0, MAX_QUOTED).map((x) => `${x.url} loads ${x.a.activeMixed[0]}`).join("; ")}. ${scope} Serve them over https.`, { pages: active.map((x) => ({ url: x.url, resources: x.a.activeMixed.slice(0, 5) })) })]);
    } else if (passive.length) {
      rows.push(["crawl_mixed_content", observed("WARN", `${plural(passive.length, "page")} served over https ${verb(passive.length, "loads", "load")} images or media over plain http, which browsers flag as not fully secure: ${passive.slice(0, MAX_QUOTED).map((x) => `${x.url} loads ${x.a.passiveMixed[0]}`).join("; ")}. ${scope}`, { pages: passive.map((x) => ({ url: x.url, resources: x.a.passiveMixed.slice(0, 5) })) })]);
    } else if (!enough) {
      rows.push(["crawl_mixed_content", inconclusive(thin)]);
    } else {
      rows.push(["crawl_mixed_content", observed("PASS", `No page read loads scripts, stylesheets, frames or images over plain http${upgraded.length ? ` (${plural(upgraded.length, "page")} reference http:// resources but set upgrade-insecure-requests, so browsers fetch them over https)` : ""}. ${scope}`)]);
    }
  }

  // ── Forms posting over http ──
  {
    const insecure = analysed.filter((x) => /^https:/i.test(x.url) && x.a.insecureFormActions.length);
    if (insecure.length) rows.push(["crawl_insecure_forms", observed("FAIL", `${plural(insecure.length, "page")} served over https ${verb(insecure.length, "submits", "submit")} a form to a plain http address, so what people type is sent unencrypted: ${insecure.slice(0, MAX_QUOTED).map((x) => `${x.url} posts to ${x.a.insecureFormActions[0]}`).join("; ")}. ${scope}`, { pages: insecure.map((x) => ({ url: x.url, actions: x.a.insecureFormActions.slice(0, 3) })) })]);
    else if (!enough) rows.push(["crawl_insecure_forms", inconclusive(thin)]);
    else rows.push(["crawl_insecure_forms", observed("PASS", `No form on the pages read submits to a plain http address. ${scope}`)]);
  }

  // ── <html lang> ──
  {
    const missing = analysed.filter((x) => !x.a.lang).map((x) => x.url);
    if (missing.length) rows.push(["crawl_html_lang", observed("WARN", `${plural(missing.length, "page")} ${verb(missing.length, "does", "do")} not declare a language on <html lang>, so screen readers may read them with the wrong pronunciation: ${quote(missing)}. ${scope}`, { missing })]);
    else if (!enough) rows.push(["crawl_html_lang", inconclusive(thin)]);
    else rows.push(["crawl_html_lang", observed("PASS", `Every page read declares its language. ${scope}`)]);
  }

  // ── viewport ──
  {
    const missing = analysed.filter((x) => !x.a.hasViewport).map((x) => x.url);
    if (missing.length) rows.push(["crawl_viewport_meta", observed("WARN", `${plural(missing.length, "page")} ${verb(missing.length, "has", "have")} no viewport meta tag, so phones show them zoomed out at desktop width: ${quote(missing)}. ${scope}`, { missing })]);
    else if (!enough) rows.push(["crawl_viewport_meta", inconclusive(thin)]);
    else rows.push(["crawl_viewport_meta", observed("PASS", `Every page read sets a viewport for phones. ${scope}`)]);
  }

  // ── Canonical tags (content pages only: an app shell's canonical may be set by script) ──
  {
    const homeId = pageIdentity(obs.home.finalUrl || obs.home.url);
    const nonHome = contentPages.filter((x) => pageIdentity(x.url) !== homeId);
    const withCanonical = nonHome.filter((x) => x.a.canonical);
    const resolved = withCanonical.map((x) => {
      let target = "";
      try { target = new URL(x.a.canonical!, x.url).toString(); } catch { /* unparseable */ }
      return { url: x.url, target };
    });
    const toHome = resolved.filter((r) => r.target && pageIdentity(r.target) === homeId);
    const offSite = resolved.filter((r) => r.target && !isSameSite(r.target, obs.home.finalUrl || obs.home.url));
    if (toHome.length >= 2 && toHome.length === withCanonical.length) {
      rows.push(["crawl_canonical_tags", observed("FAIL", `Every page read that has a canonical tag points it at the homepage (${quote(toHome.map((r) => r.url))}). That tells search engines these pages are copies of the homepage, so they drop out of results. ${scope} Point each page's canonical at its own URL.`, { toHome })]);
    } else if (toHome.length || offSite.length) {
      const parts: string[] = [];
      if (toHome.length) parts.push(`${plural(toHome.length, "page")} ${verb(toHome.length, "points its", "point their")} canonical tag at the homepage: ${quote(toHome.map((r) => r.url))}`);
      if (offSite.length) parts.push(`${plural(offSite.length, "page")} ${verb(offSite.length, "points its", "point their")} canonical tag at another site: ${offSite.slice(0, MAX_QUOTED).map((r) => `${r.url} to ${r.target}`).join("; ")}`);
      rows.push(["crawl_canonical_tags", observed("WARN", `${capitalise(parts.join(", and "))}. Search engines then index the other address instead of this one; that is right only for genuine copies. ${scope}`, { toHome, offSite })]);
    } else if (!enoughContent) {
      rows.push(["crawl_canonical_tags", inconclusive(enough ? thinContent : thin)]);
    } else {
      rows.push(["crawl_canonical_tags", observed("PASS", `No page read points its canonical tag at the homepage or at another site${withCanonical.length < nonHome.length ? ` (${plural(nonHome.length - withCanonical.length, "page")} ${verb(nonHome.length - withCanonical.length, "has", "have")} no canonical tag, which is allowed)` : ""}. ${scope}`)]);
    }
  }

  // ── noindex on pages that should be found ──
  {
    const SHOULD_INDEX = new Set<PageKind>(["pricing", "product", "article", "blog", "about", "docs"]);
    const homeNoindex = homeReadable && analysePage(obs.home.body, obs.home.headers).noindex;
    const keyPages = analysed.filter((x) => x.p.kind && SHOULD_INDEX.has(x.p.kind));
    const hidden = keyPages.filter((x) => x.a.noindex);
    if (homeNoindex) {
      rows.push(["crawl_noindex_key_pages", inconclusive(`The homepage itself asks search engines not to index it, so noindex on other pages looks like a choice for the whole site (a staging or private site) rather than a mistake. ${scope}`)]);
    } else if (hidden.length) {
      rows.push(["crawl_noindex_key_pages", observed("WARN", `${plural(hidden.length, "page")} that people normally find through search ${verb(hidden.length, "asks", "ask")} search engines not to index them (noindex): ${quote(hidden.map((x) => `${x.url} (${x.p.kind})`))}. If that is not deliberate, remove the noindex. ${scope}`, { pages: hidden.map((x) => ({ url: x.url, kind: x.p.kind })) })]);
    } else if (!enough) {
      rows.push(["crawl_noindex_key_pages", inconclusive(thin)]);
    } else if (keyPages.length === 0) {
      rows.push(["crawl_noindex_key_pages", inconclusive(`None of the pages read was a pricing, product, about, blog or docs page, so this could not be checked. ${scope}`)]);
    } else {
      rows.push(["crawl_noindex_key_pages", observed("PASS", `None of the ${plural(keyPages.length, "pricing, product, about, blog or docs page")} read is marked noindex. ${scope}`)]);
    }
  }

  // ── Security headers present on the homepage but missing elsewhere ──
  {
    let homeHost = "";
    try { homeHost = new URL(obs.home.finalUrl || obs.home.url).host; } catch { /* none */ }
    const sameHost = readable.filter((p) => {
      try { return new URL(p.fetch.finalUrl || p.fetch.url).host === homeHost; } catch { return false; }
    });
    const homeHeaders = obs.home.headers;
    const frameProtected = (h: Record<string, string>) => Boolean(h["x-frame-options"]) || /frame-ancestors/i.test(h["content-security-policy"] ?? "");
    const HEADERS: Array<{ name: string; has: (h: Record<string, string>) => boolean }> = [
      { name: "Strict-Transport-Security", has: (h) => Boolean(h["strict-transport-security"]) },
      { name: "Content-Security-Policy", has: (h) => Boolean(h["content-security-policy"] || h["content-security-policy-report-only"]) },
      { name: "X-Content-Type-Options", has: (h) => Boolean(h["x-content-type-options"]) },
      { name: "X-Frame-Options or frame-ancestors", has: frameProtected },
    ];
    const gaps: Array<{ header: string; pages: string[] }> = [];
    if (homeReadable) {
      for (const header of HEADERS) {
        if (!header.has(homeHeaders)) continue;
        const missing = sameHost.filter((p) => !header.has(p.fetch.headers)).map((p) => p.fetch.finalUrl || p.fetch.url);
        if (missing.length) gaps.push({ header: header.name, pages: missing });
      }
    }
    if (gaps.length) {
      rows.push(["crawl_security_headers_consistent", observed("WARN", `The homepage sends security headers that other pages do not: ${gaps.map((g) => `${g.header} is missing on ${quote(g.pages)}`).join("; ")}. A visitor who lands on those pages first is not protected. ${scope}`, { gaps })]);
    } else if (!homeReadable || sameHost.length < MIN_PAGES_BEYOND_HOME) {
      rows.push(["crawl_security_headers_consistent", inconclusive(homeReadable ? `Fewer than ${MIN_PAGES_BEYOND_HOME} pages on the homepage's own host could be read, so the headers could not be compared. ${scope}` : thin)]);
    } else {
      rows.push(["crawl_security_headers_consistent", observed("PASS", `The ${plural(sameHost.length, "other page")} read send the same security headers as the homepage. ${scope}`)]);
    }
  }

  // ── Sitemap URLs ──
  {
    const checked = obs.sitemap.checks.filter((c) => answered(c.status));
    const gone = checked.filter((c) => c.status === 404 || c.status === 410);
    // A permanent redirect means the sitemap lists an old address. A temporary one
    // (302/303/307) is often by location or session (stripe.com/legal 307s to /gb/legal
    // for a UK visitor), which says nothing about the sitemap, so it is not counted.
    const moved = checked.filter((c) => c.status === 301 || c.status === 308);
    const temporary = checked.filter((c) => c.status === 302 || c.status === 303 || c.status === 307);
    if (!obs.sitemap.read) {
      rows.push(["crawl_sitemap_urls", inconclusive("No sitemap could be read, so the URLs it lists could not be checked.")]);
    } else if (gone.length || moved.length) {
      const parts: string[] = [];
      if (gone.length) parts.push(`${plural(gone.length, "URL")} ${verb(gone.length, "answers", "answer")} 404 or 410: ${quote(gone.map((c) => c.url))}`);
      if (moved.length) parts.push(`${plural(moved.length, "URL")} ${verb(moved.length, "redirects", "redirect")} permanently elsewhere: ${quote(moved.map((c) => c.url))}`);
      rows.push(["crawl_sitemap_urls", observed("WARN", `Of ${plural(checked.length, "sitemap URL")} checked (the sitemap lists ${obs.sitemap.urlCount}), ${parts.join(", and ")}. A sitemap should list only live pages at their final address.`, { gone, moved })]);
    } else if (obs.sitemap.checks.length === 0) {
      rows.push(["crawl_sitemap_urls", inconclusive(`A sitemap was read but it lists no pages on this site that could be checked (it lists ${plural(obs.sitemap.urlCount, "URL")} in all).`)]);
    } else if (checked.length - temporary.length < 2) {
      rows.push(["crawl_sitemap_urls", inconclusive(`The sitemap was read but only ${checked.length - temporary.length} of its URLs on this site gave a definite answer${temporary.length ? ` (${temporary.length} redirected temporarily, which can depend on the visitor's location)` : ""}; the rest gave no answer, a bot check, or 401/403/429/5xx. That is too few to judge it.`)]);
    } else {
      rows.push(["crawl_sitemap_urls", observed("PASS", `${plural(checked.length - temporary.length, "sitemap URL")} checked (the sitemap lists ${obs.sitemap.urlCount}); none answered 404 or 410 or redirected permanently${temporary.length ? `. ${temporary.length} more redirected temporarily, which can depend on the visitor's location, and were not counted` : ""}.`)]);
    }
  }

  // ── Images without alt text ──
  {
    // Counted by image, not by appearance: a logo in the header of every page is one image.
    const resolveSrc = (src: string, base: string) => { try { return new URL(src, base).toString(); } catch { return src; } };
    const allSrcs = new Set(contentPages.flatMap((x) => x.a.imageSrcs.map((src) => resolveSrc(src, x.url))));
    const missingSrcs = new Set(contentPages.flatMap((x) => x.a.missingAltSrcs.map((src) => resolveSrc(src, x.url))));
    const totalImages = allSrcs.size;
    const totalMissing = missingSrcs.size;
    const pagesMissing = contentPages.filter((x) => x.a.imagesMissingAlt > 0);
    const share = totalImages ? totalMissing / totalImages : 0;
    if (totalMissing >= 3 && share >= 0.1) {
      rows.push(["crawl_image_alt_text", observed("WARN", `${totalMissing} of ${totalImages} distinct images on the pages read have no alt attribute, so screen readers announce them as unlabelled (use alt="" for decorative images): ${quote(pagesMissing.map((x) => `${x.url} (${x.a.imagesMissingAlt})`))}. ${scope}`, { totalImages, totalMissing, pages: pagesMissing.map((x) => ({ url: x.url, missing: x.a.imagesMissingAlt })) })]);
    } else if (!enoughContent) {
      rows.push(["crawl_image_alt_text", inconclusive(enough ? thinContent : thin)]);
    } else if (totalImages === 0) {
      rows.push(["crawl_image_alt_text", inconclusive(`No images were found in the static markup of the pages read, so alt text could not be judged (images added by script are not in it). ${scope}`)]);
    } else {
      rows.push(["crawl_image_alt_text", observed("PASS", `${totalImages - totalMissing} of ${totalImages} distinct images on the pages read have an alt attribute${totalMissing ? ` (${totalMissing} without, below the reporting threshold of 3 images and 10%)` : ""}. ${scope}`)]);
    }
  }

  return rows.map(([key, row]) => ({ category: SITE_CRAWL_CATEGORY[key], checkKey: key, label: SITE_CRAWL_LABELS[key], ...row }));
}

/** A status that answers the question. 401/403/429/5xx and failures do not. */
function answered(status: number): boolean {
  return (status >= 200 && status < 400) || status === 404 || status === 410;
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Page 2 of a list is the same listing as page 1: sharing its title is not a duplicate. */
function listingIdentity(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (/^(?:p|page|pg|paged|offset|start)$/i.test(key)) u.searchParams.delete(key);
    return pageIdentity(u.toString());
  } catch {
    return url;
  }
}

function duplicates(entries: Array<{ value: string; url: string }>): Array<{ value: string; urls: string[] }> {
  const by = new Map<string, string[]>();
  for (const e of entries) by.set(e.value, [...(by.get(e.value) ?? []), e.url]);
  const out: Array<{ value: string; urls: string[] }> = [];
  for (const [value, urls] of by) {
    if (new Set(urls.map(listingIdentity)).size > 1) out.push({ value, urls: [...new Set(urls)] });
  }
  return out;
}

export const SITE_CRAWL_LABELS: Record<SiteCrawlKey, string> = {
  crawl_pages_read: "Pages read beyond the homepage",
  crawl_broken_internal_links: "No broken internal links",
  crawl_page_titles: "Every page has its own title",
  crawl_meta_descriptions: "Every page has its own meta description",
  crawl_mixed_content: "No http resources on https pages",
  crawl_insecure_forms: "No forms submit over plain http",
  crawl_html_lang: "Every page declares its language",
  crawl_viewport_meta: "Every page sets a mobile viewport",
  crawl_canonical_tags: "Canonical tags point at the right page",
  crawl_noindex_key_pages: "Key pages are not hidden from search",
  crawl_security_headers_consistent: "Security headers are sent on every page",
  crawl_sitemap_urls: "Sitemap lists only live pages",
  crawl_image_alt_text: "Images across the site have alt text",
};

export const SITE_CRAWL_CATEGORY: Record<SiteCrawlKey, PulseScanCheckInput["category"]> = {
  crawl_pages_read: CATEGORIES.SEO,
  crawl_broken_internal_links: CATEGORIES.SEO,
  crawl_page_titles: CATEGORIES.SEO,
  crawl_meta_descriptions: CATEGORIES.SEO,
  crawl_mixed_content: CATEGORIES.SECURITY,
  crawl_insecure_forms: CATEGORIES.SECURITY,
  crawl_html_lang: CATEGORIES.ACCESSIBILITY,
  crawl_viewport_meta: CATEGORIES.MOBILE,
  crawl_canonical_tags: CATEGORIES.SEO,
  crawl_noindex_key_pages: CATEGORIES.SEO,
  crawl_security_headers_consistent: CATEGORIES.SECURITY,
  crawl_sitemap_urls: CATEGORIES.SEO,
  crawl_image_alt_text: CATEGORIES.ACCESSIBILITY,
};

/** Every key INCONCLUSIVE, for a crawl that could not run at all. */
export function siteCrawlUnavailable(reason: string): PulseScanCheckInput[] {
  return SITE_CRAWL_KEYS.map((key) => ({
    category: SITE_CRAWL_CATEGORY[key],
    checkKey: key,
    label: SITE_CRAWL_LABELS[key],
    ...inconclusive(`Not checked: ${reason} This is a gap in the scan, not a finding about the site.`),
    ...(key === "crawl_pages_read" ? { scoreEligible: false, completenessEligible: true } : {}),
  }));
}
