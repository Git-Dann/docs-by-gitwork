import { CATEGORIES } from "./categories";
// AEO & AI Discoverability — is the site legible to AI answer engines and crawlers?
//
// Distinct from "AI Readiness" (which grades AI *features* baked into a product —
// feedback loops, cost monitoring, guardrails). This category asks the inverse:
// can ChatGPT / Claude / Perplexity / Google's AI actually FIND, CRAWL and CITE
// this site? The checks are the AEO ("Answer Engine Optimisation") signals behind
// the AI-first-website pattern: an llms.txt guidance file, AI-crawler access in
// robots.txt, valid parseable structured data, server-rendered (non-JS) content,
// semantic HTML landmarks, and a machine-readable content feed.
//
// All deterministic (fetched files + parsed markup) → the `aeo_` prefix rule in
// confidence.ts stamps these HIGH. Overlap with SEO is deliberately avoided: SEO
// checks specific schema.org *types* + sitemaps/canonical; this checks JSON-LD
// *validity*, crawler *access*, and crawl-without-JS *legibility*.

import type { PulseScanCheckInput } from "@/types/pulse";
import { type ExtendedCheckContext, verifyFileExposure, fetchWithTimeout, probeInconclusive, platformIs, skip } from "./_types";

const CATEGORY = CATEGORIES.AEO;

const ALL_CHECKS: Array<[string, string]> = [
  ["aeo_llms_txt", "llms.txt AI guidance file"],
  ["aeo_ai_crawlers_allowed", "AI crawlers allowed in robots.txt"],
  ["aeo_structured_data_valid", "Valid structured data (JSON-LD)"],
  ["aeo_content_server_rendered", "Content readable without JavaScript"],
  ["aeo_semantic_html", "Semantic HTML landmarks"],
  ["aeo_content_feed", "Machine-readable content feed (RSS/Atom)"],
  ["aeo_canonical", "Canonical URL is declared"],
  ["aeo_language_alternates", "Language alternatives are declared"],
  ["aeo_question_answer", "Question-and-answer content is structured"],
  ["aeo_citation_links", "Claims include supporting links"],
  ["aeo_content_freshness", "Content exposes a published or updated date"],
  ["aeo_sitemap", "Crawler sitemap is declared"],
];

// The major AI / answer-engine crawlers. If robots.txt fully disallows any of
// these (or blocks everyone via `*`), the site is invisible to that engine.
const AI_BOTS = [
  "gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "anthropic-ai",
  "claude-web", "perplexitybot", "perplexity-user", "google-extended", "ccbot",
  "applebot-extended", "bytespider", "amazonbot", "meta-externalagent",
  "cohere-ai", "youbot", "diffbot", "claude-searchbot", "claude-user",
];

// Bots an engine uses at ANSWER time (search index, user-triggered fetch, grounding).
// GPTBot, ClaudeBot, CCBot, Bytespider... collect training data: blocking only those opts
// content out of model training, it does not remove the site from ChatGPT search or
// Perplexity answers (zalando.de blocks GPTBot + ClaudeBot but not OAI-SearchBot,
// ChatGPT-User or PerplexityBot).
const ANSWER_BOT_ENGINE: Record<string, string> = {
  "oai-searchbot": "ChatGPT",
  "chatgpt-user": "ChatGPT",
  "perplexitybot": "Perplexity",
  "perplexity-user": "Perplexity",
  "claude-searchbot": "Claude",
  "claude-user": "Claude",
  "google-extended": "Gemini",
  "youbot": "You.com",
};

function aiBlockImpact(blockedBots: string[]): string {
  const engines = Array.from(new Set(blockedBots.map((b) => ANSWER_BOT_ENGINE[b]).filter(Boolean)));
  if (engines.length > 0) {
    return `That includes answer-time bots, so pages can be left out of ${engines.join(", ")} answers. Remove the Disallow if you want AI visibility.`;
  }
  return "These are AI training / data-collection crawlers; the answer-time bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot) are not blocked, so this opts content out of model training rather than out of AI answers.";
}

interface RobotsGroup {
  agents: string[];
  disallowsRoot: boolean;
}

/** Minimal robots.txt parse: which AI bots are fully disallowed (`Disallow: /`)? */
function parseRobots(robots: string): { blockedBots: string[]; wildcardBlocked: boolean } {
  const lines = robots
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      // Consecutive User-agent lines share one group; a directive then starts a new one.
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowsRoot: false };
        groups.push(current);
      }
      current.agents.push(ua[1].trim().toLowerCase());
      lastWasAgent = true;
      continue;
    }
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis && current) {
      if (dis[1].trim() === "/") current.disallowsRoot = true;
      lastWasAgent = false;
      continue;
    }
    lastWasAgent = false;
  }

  const fullyBlocked = (agent: string) =>
    groups.some((g) => g.agents.includes(agent) && g.disallowsRoot);

  return {
    blockedBots: AI_BOTS.filter(fullyBlocked),
    wildcardBlocked: groups.some((g) => g.agents.includes("*") && g.disallowsRoot),
  };
}

export async function runAiAeoChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // Only web surfaces have crawlable HTML / robots.txt.
  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — this platform type has no crawlable web surface.");
  }

  const { httpsUrl, htmlLower } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  // 1. llms.txt — the emerging standard for guiding LLMs / answer engines to the
  //    content that matters. Content-verified so a catch-all HTML 200 doesn't count.
  const looksLikeText = (body: string, ct: string) =>
    !ct.includes("html") && body.trim().length > 10;
  // Same soft-200 guard verifyFileExposure applies (isHtmlShell in _types.ts, which is
  // not exported): a SPA shell served as text/plain must not read as an llms.txt.
  const looksLikeHtmlShell = (body: string) => {
    const head = body.trimStart().slice(0, 300).toLowerCase();
    return (
      head.startsWith("<!doctype html") ||
      head.startsWith("<html") ||
      head.includes("<head") ||
      head.includes("__next_data__") ||
      head.includes('id="root"') ||
      head.includes('id="__next"')
    );
  };
  // A probe that got no answer (network error, timeout, 429/5xx) is not evidence the file
  // is absent. verifyFileExposure collapses both to `false`, which a timeout turned into
  // "No /llms.txt" (squarespace.com does publish one, via a 301 to /assets/llms.txt).
  const probeLlms = async (path: string): Promise<"found" | "absent" | { error: string }> => {
    try {
      const res = await fetchWithTimeout(`${httpsUrl}${path}`, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Gitwork-Pulse/1.0" },
      });
      // Only 404/410 say the file is not there. 401/403 (a WAF or challenge answering
      // Pulse's UA), 429 and 5xx say nothing about whether it exists.
      if (res.status === 404 || res.status === 410) return "absent";
      if (res.status !== 200) return { error: `HTTP ${res.status}` };
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const body = (await res.text().catch(() => "")).slice(0, 2000);
      return looksLikeText(body, ct) && !looksLikeHtmlShell(body) ? "found" : "absent";
    } catch (error) {
      return { error: error instanceof Error ? error.message : "request failed" };
    }
  };
  const llmsProbe = await probeLlms("/llms.txt");
  const hasLlmsTxt = llmsProbe === "found" || (await probeLlms("/llms-full.txt")) === "found";
  if (!hasLlmsTxt && typeof llmsProbe === "object") {
    checks.push(probeInconclusive(CATEGORY, "aeo_llms_txt", "llms.txt AI guidance file",
      `The request for ${httpsUrl}/llms.txt did not return a usable answer (${llmsProbe.error}), so Pulse cannot say whether the file exists.`));
  } else checks.push({
    category: CATEGORY,
    checkKey: "aeo_llms_txt",
    label: "llms.txt AI guidance file",
    status: hasLlmsTxt ? "PASS" : "WARN",
    detail: hasLlmsTxt
      ? "llms.txt found — you publish machine-readable guidance telling LLMs and answer engines which content to prioritise."
      : "No /llms.txt. llms.txt is a proposed convention (llmstxt.org): a markdown file at the site root summarising what the site is and which pages matter, read by some AI tools and agents. It is not an official standard and answer-engine support varies, so treat it as optional.",
  });

  // 2. AI crawler access — many sites silently block AI bots and vanish from
  //    answer engines. Fetch + parse robots.txt directly (need the body, not just 200).
  let robotsBody = "";
  let robotsStatus = 0;
  // A fetch that never completed is not the same fact as a site with no robots.txt.
  // Conflating them turned every transient network error into "nothing blocks AI
  // crawlers" — a PASS asserted about a file Pulse never managed to read.
  let robotsProbeError: string | null = null;
  try {
    const res = await fetchWithTimeout(`${httpsUrl}/robots.txt`, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    robotsStatus = res.status;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    // A soft-200 HTML shell isn't a real robots.txt.
    if (res.status === 200 && !ct.includes("html")) {
      robotsBody = (await res.text().catch(() => "")).slice(0, 20_000);
    }
  } catch (error) {
    robotsProbeError = error instanceof Error ? error.message : "robots.txt request failed";
  }

  if (robotsProbeError) {
    checks.push(probeInconclusive(CATEGORY, "aeo_ai_crawlers_allowed", "AI crawlers allowed in robots.txt",
      `The request for ${httpsUrl}/robots.txt did not complete (${robotsProbeError}), so crawler rules could not be read.`));
  } else if (robotsStatus !== 200 && robotsStatus !== 404 && robotsStatus !== 410) {
    // 401/403/429/5xx is a WAF, challenge or outage answering Pulse's UA, not "no file":
    // zalando.de and a Vercel-challenged deployment both 403 Gitwork-Pulse while real
    // crawlers receive rules that block AI bots. RFC 9309 also treats 5xx as full disallow.
    checks.push(probeInconclusive(CATEGORY, "aeo_ai_crawlers_allowed", "AI crawlers allowed in robots.txt",
      `${httpsUrl}/robots.txt answered HTTP ${robotsStatus} to Pulse, so its crawler rules could not be read.`));
  } else if (!robotsBody) {
    checks.push({
      category: CATEGORY,
      checkKey: "aeo_ai_crawlers_allowed",
      label: "AI crawlers allowed in robots.txt",
      status: "PASS",
      detail: robotsStatus === 200
        ? "robots.txt has no crawler restrictions — AI answer engines can access the site."
        : "No robots.txt found — nothing blocks AI crawlers (they may access the whole site by default).",
    });
  } else {
    const { blockedBots, wildcardBlocked } = parseRobots(robotsBody);
    if (wildcardBlocked) {
      checks.push({
        category: CATEGORY,
        checkKey: "aeo_ai_crawlers_allowed",
        label: "AI crawlers allowed in robots.txt",
        status: "WARN",
        detail: "robots.txt blocks ALL crawlers (User-agent: * → Disallow: /) — the site is invisible to AI answer engines and search engines alike.",
        evidence: "User-agent: *  Disallow: /",
      });
    } else if (blockedBots.length > 0) {
      checks.push({
        category: CATEGORY,
        checkKey: "aeo_ai_crawlers_allowed",
        label: "AI crawlers allowed in robots.txt",
        status: "WARN",
        detail: `robots.txt explicitly blocks AI crawlers: ${blockedBots.join(", ")}. ${aiBlockImpact(blockedBots)}`,
        evidence: blockedBots.join(", "),
      });
    } else {
      checks.push({
        category: CATEGORY,
        checkKey: "aeo_ai_crawlers_allowed",
        label: "AI crawlers allowed in robots.txt",
        status: "PASS",
        detail: "AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) are allowed in robots.txt.",
      });
    }
  }

  // 3. Citation and retrieval signals. These are page-level facts that an
  // answer engine can verify from the rendered document; they never guess at
  // the truth of a claim.
  const canonical = /<link(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["'][^"']+)[^>]*>/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "aeo_canonical", label: "Canonical URL is declared", status: canonical ? "PASS" : "WARN", detail: canonical ? "Canonical URL detected." : "No canonical URL found; answer engines can split authority across duplicate URLs." });
  const alternates = /<link(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhreflang=["'][^"']+)[^>]*>/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "aeo_language_alternates", label: "Language alternatives are declared", status: alternates ? "PASS" : "WARN", detail: alternates ? "Language alternate metadata detected." : "No language alternatives found; add them when this site serves localized versions." });
  const qa = /<(?:h[2-4]|dt)[^>]*>[^<]{5,}\?<|FAQPage|\"(?:Question|Answer)\"/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "aeo_question_answer", label: "Question-and-answer content is structured", status: qa ? "PASS" : "WARN", detail: qa ? "Question-and-answer content pattern detected." : "No structured question-and-answer content found on this page." });
  // Count links that leave the site. Absolute links back to the scanned host (48 of the
  // Guardian homepage's absolute anchors point at www.theguardian.com) are navigation,
  // not supporting citations.
  const siteHost = ctx.hostname.toLowerCase().replace(/^www\./, "");
  const citations = Array.from(html.matchAll(/<a\s+[^>]*href=["']https?:\/\/([^/"':?#]+)/gi))
    .map((match) => match[1].toLowerCase().replace(/^www\./, ""))
    .filter((host) => host !== siteHost && !host.endsWith(`.${siteHost}`)).length >= 2;
  checks.push({ category: CATEGORY, checkKey: "aeo_citation_links", label: "Claims include supporting links", status: citations ? "PASS" : "WARN", detail: citations ? "Multiple supporting outbound links detected." : "Few supporting links found; cite primary sources for factual content." });
  const freshness = /(?:datePublished|dateModified|<time[^>]+datetime=|last updated|published on)/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "aeo_content_freshness", label: "Content exposes a published or updated date", status: freshness ? "PASS" : "WARN", detail: freshness ? "Content date metadata detected." : "No published or updated date found; freshness is hard for answer engines to assess." });
  const sitemap = /sitemap:\s*https?:\/\//i.test(robotsBody) || /<link[^>]+type=["']application\/xml["']/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "aeo_sitemap", label: "Crawler sitemap is declared", status: sitemap ? "PASS" : "WARN", detail: sitemap ? "Sitemap declaration detected." : "No sitemap declaration found in robots.txt or page metadata." });

  // 4. Structured data VALIDITY — SEO checks which schema types exist; this checks
  //    the JSON-LD actually parses into schema.org objects (answer engines need it valid).
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let totalBlocks = 0;
  let validBlocks = 0;
  let m: RegExpExecArray | null;
  while ((m = jsonLdRe.exec(html)) !== null) {
    totalBlocks++;
    try {
      const parsed = JSON.parse(m[1].trim());
      const objs = Array.isArray(parsed) ? parsed : [parsed];
      if (objs.some((o) => o && typeof o === "object" && ("@type" in o || "@context" in o || "@graph" in o))) {
        validBlocks++;
      }
    } catch {
      /* malformed JSON-LD block */
    }
  }
  checks.push({
    category: CATEGORY,
    checkKey: "aeo_structured_data_valid",
    label: "Valid structured data (JSON-LD)",
    status: validBlocks > 0 ? "PASS" : "WARN",
    detail:
      validBlocks > 0
        ? `${validBlocks} valid JSON-LD block${validBlocks === 1 ? "" : "s"} detected — schema.org markup answer engines can parse to understand and cite your content.`
        : totalBlocks > 0
          ? `${totalBlocks} JSON-LD block${totalBlocks === 1 ? "" : "s"} present but none parsed as valid schema.org objects — check for JSON syntax errors; broken markup is ignored by crawlers.`
          : "No JSON-LD structured data. Answer engines rely on schema.org markup to understand what your pages are about. Add JSON-LD (Organization, Product, Article, FAQPage…).",
  });

  // 4. Content readable without JS — most AI crawlers don't execute JavaScript, so
  //    a client-rendered SPA shell is a near-empty page to them. Measure server-HTML text.
  const strippedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = strippedText ? strippedText.split(" ").filter((w) => w.length > 1).length : 0;
  const serverRendered = wordCount >= 100;
  // Only claim client-side rendering when the HTML shows an app shell. A short static page
  // (example.com: ~26 words, all in the HTML) is fully readable without JS, and a WAF denial
  // body (rakuten.co.jp: 43 bytes, "Reference #18.0e0f0317...") is not the site at all.
  const appShell = /id=["'](?:root|__next|app|__nuxt|svelte)["']|<app-root\b|__NEXT_DATA__|<script[^>]+type=["']module["']/i.test(html);
  // <html>/<head>/<body> are optional in HTML5 and minifiers strip them, so their absence
  // alone does not make a body "not a page". Only a body with no HTML element at all, or
  // one carrying an Akamai denial reference, is treated as something other than the site.
  const hasAnyElement = /<[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/i.test(html);
  const akamaiDenial = /Reference(?:\s|&#32;)(?:#|&#35;)[0-9a-f]+\.[0-9a-f]+/i.test(html);
  const notAPage = !serverRendered && (!hasAnyElement || akamaiDenial);
  if (notAPage) {
    checks.push(probeInconclusive(CATEGORY, "aeo_content_server_rendered", "Content readable without JavaScript",
      `The homepage response (${html.length} bytes) was not a normal HTML page — likely a bot-protection or error response — so how the real page renders could not be assessed.`));
  } else checks.push({
    category: CATEGORY,
    checkKey: "aeo_content_server_rendered",
    label: "Content readable without JavaScript",
    status: serverRendered ? "PASS" : "WARN",
    detail: serverRendered
      ? `Server HTML contains ~${wordCount} words of readable text — crawlers that don't run JavaScript (most AI answer engines) can read your content.`
      : appShell
        ? `Server HTML has only ~${wordCount} words of text and an app-shell mount point — the page appears to render its content client-side. AI crawlers that don't execute JavaScript will see a near-empty page. Prefer static/server rendering for key content.`
        : `Server HTML has only ~${wordCount} words of text. Pulse found no sign of client-side rendering, so this looks like a genuinely short page: what is there is readable without JavaScript, but there is little for answer engines to read or cite.`,
  });

  // 5. Semantic HTML landmarks — machine-readable page structure vs "div soup".
  const landmarks: Array<[string, string]> = [
    ["<main", "<main>"],
    ["<article", "<article>"],
    ["<section", "<section>"],
    ["<header", "<header>"],
    ["<footer", "<footer>"],
    ["<nav", "<nav>"],
    ["<aside", "<aside>"],
  ];
  const present = landmarks.filter(([needle]) => htmlLower.includes(needle)).map(([, label]) => label);
  const hasSemantic = present.length >= 3;
  checks.push({
    category: CATEGORY,
    checkKey: "aeo_semantic_html",
    label: "Semantic HTML landmarks",
    status: hasSemantic ? "PASS" : "WARN",
    detail: hasSemantic
      ? `Semantic HTML5 landmarks detected (${present.join(", ")}) — gives AI and assistive tech a clear, machine-readable page structure.`
      : `Few semantic landmarks${present.length ? ` (only ${present.join(", ")})` : ""} — a page built from generic <div>s is harder for AI answer engines to segment. Use <main>, <article>, <nav>, <header>, <footer>.`,
  });

  // 6. Machine-readable content feed — helps aggregators + answer engines ingest
  //    fresh content. Link tag or a common feed path.
  const hasFeedLink = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["']/i.test(html);
  const isXml = (body: string, ct: string) => ct.includes("xml") || /<\?xml|<rss|<feed/i.test(body);
  const hasFeedFile = hasFeedLink || (await verifyFileExposure(`${httpsUrl}/rss.xml`, isXml));
  checks.push({
    category: CATEGORY,
    checkKey: "aeo_content_feed",
    label: "Machine-readable content feed (RSS/Atom)",
    status: hasFeedFile ? "PASS" : "WARN",
    detail: hasFeedFile
      ? "RSS/Atom feed detected — new content is available in a machine-readable format for aggregators and AI ingestion."
      : "No RSS/Atom feed. For content or blog sites, a feed helps answer engines and aggregators discover new posts quickly. (Minor for brochure sites.)",
  });

  return checks;
}
