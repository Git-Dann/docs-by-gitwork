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
  "cohere-ai", "youbot", "diffbot",
];

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
  const hasLlmsTxt =
    (await verifyFileExposure(`${httpsUrl}/llms.txt`, looksLikeText)) ||
    (await verifyFileExposure(`${httpsUrl}/llms-full.txt`, looksLikeText));
  checks.push({
    category: CATEGORY,
    checkKey: "aeo_llms_txt",
    label: "llms.txt AI guidance file",
    status: hasLlmsTxt ? "PASS" : "WARN",
    detail: hasLlmsTxt
      ? "llms.txt found — you publish machine-readable guidance telling LLMs and answer engines which content to prioritise."
      : "No /llms.txt. This emerging standard (like robots.txt, but for LLMs) tells ChatGPT, Claude and Perplexity what your site is and which pages matter. Add a markdown llms.txt at the site root.",
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
        detail: `robots.txt explicitly blocks AI crawlers: ${blockedBots.join(", ")}. Your content won't appear in ChatGPT, Claude or Perplexity answers. Remove the Disallow if you want AI visibility.`,
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
  const citations = (html.match(/<a\s+[^>]*href=["']https?:\/\//gi) ?? []).length >= 2;
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
  checks.push({
    category: CATEGORY,
    checkKey: "aeo_content_server_rendered",
    label: "Content readable without JavaScript",
    status: serverRendered ? "PASS" : "WARN",
    detail: serverRendered
      ? `Server HTML contains ~${wordCount} words of readable text — crawlers that don't run JavaScript (most AI answer engines) can read your content.`
      : `Server HTML has only ~${wordCount} words of text — the page appears to render its content client-side. AI crawlers that don't execute JavaScript will see a near-empty page. Prefer static/server rendering for key content.`,
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
