import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";
import type { CheckCategory } from "./categories";
import { type PageProbeState, classifyTopicPage, fetchSnippet, pageTitle } from "./path-probe";

/**
 * Probe a path for a page about a topic. A 200 is not an answer: hosts serve their
 * homepage (or a "Menu" page) for paths they do not have, so the page has to name
 * itself — see classifyTopicPage.
 */
export async function probeTopicPage(httpsUrl: string, path: string, topic: RegExp, homeTitle: string | null): Promise<PageProbeState> {
  const probe = await fetchSnippet(`${httpsUrl}${path}`, 4000, 65_536);
  return classifyTopicPage(probe, path, topic, homeTitle);
}

export const UNESTABLISHED_PAGE_DETAIL =
  "The path answered, but with a page that does not name itself as this — often the homepage served for any path — so whether it exists could not be established.";

/**
 * The verdict for a page check: an in-page signal or a page that names itself is a
 * PASS; a real 404 is the check's existing WARN; anything we could not read as the
 * page is INCONCLUSIVE rather than a guess in either direction.
 */
export function topicPageCheck(
  base: { category: CheckCategory; checkKey: string; label: string },
  inPageSignal: boolean,
  probe: PageProbeState,
  path: string,
  passDetail: string,
  warnDetail: string,
): PulseScanCheckInput {
  if (inPageSignal || probe === "present") return { ...base, status: "PASS", detail: passDetail };
  if (probe === "absent") return { ...base, status: "WARN", detail: warnDetail };
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: probe === "failed"
      ? `The request to ${path} did not complete, and the homepage carries no link or mention of it, so whether it exists could not be established.`
      : `${path}: ${UNESTABLISHED_PAGE_DETAIL}`,
  };
}

/**
 * The homepage links a security page of THIS site: a relative /security or /trust path
 * (with or without ./ or a trailing slash), the same as an absolute same-site URL, or a
 * trust./security. subdomain of the scanned site (trust.anthropic.com). Off-site links
 * (github.com/security, claude.com/product/claude-security) do not count, and the host
 * must end where the scanned site's name ends, so trust.example.com.evil.net does not.
 */
export function linksSecurityPage(html: string, hostname: string): boolean {
  const siteBase = hostname.replace(/^www\./i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!siteBase) return false;
  const re = new RegExp(
    `href=["'](?:https?:\\/\\/(?:[a-z0-9-]+\\.)*${siteBase})?\\.?\\/(?:security|trust)\\/?["']`
      + `|href=["']https?:\\/\\/(?:trust|security)\\.(?:[a-z0-9-]+\\.)*${siteBase}(?=[\\/:?#"'])`,
    "i",
  );
  return re.test(html);
}

export async function runMissingPagesExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORIES.MISSING_PAGES, [
      ["legal_hub_page", "/legal hub page"],
      ["security_dedicated_page", "/security dedicated page"],
      ["api_docs_page", "API docs page"],
      ["system_requirements_page", "System requirements page"],
      ["roadmap_public_page", "Public /roadmap page"],
      ["pricing_comparison_table", "Pricing comparison / feature table"],
      ["migration_import_guide", "Migration / import guide"],
      ["partners_ecosystem_page", "/partners or /ecosystem page"],
      ["affiliate_programme_page", "/affiliate programme page"],
      ["release_notes_page", "/release-notes page"],
    ], "Not applicable for this platform type.");
  }

  // A status alone cannot prove a page exists (soft-routed hosts answer 200 with
  // their homepage), so each path must answer with a page that names its topic.
  // In-page <a href>/content signals still count on their own.
  const homeTitle = pageTitle(html) || null;
  const probe = (path: string, topic: RegExp) => probeTopicPage(httpsUrl, path, topic, homeTitle);
  const [
    legalState, securityState, apiDocsState, sysReqState, roadmapState,
    partnersState, affiliateState, releaseNotesState,
  ] = await Promise.all([
    probe("/legal", /\blegal\b/),
    probe("/security", /\bsecurity\b|\btrust (center|centre|portal)\b/),
    probe("/docs", /\bdocs?\b|documentation|\bapi\b|\bdevelopers?\b/),
    probe("/system-requirements", /requirements|compatib|supported (browsers|platforms|devices)/),
    probe("/roadmap", /road ?map/),
    probe("/partners", /partner|ecosystem/),
    probe("/affiliate", /affiliate|referral/),
    probe("/release-notes", /release|changelog|what.?s new/),
  ]);
  const MP = CATEGORIES.MISSING_PAGES;

  checks.push(topicPageCheck({ category: MP, checkKey: "legal_hub_page", label: "/legal hub page" },
    /href=["']\/legal["']/i.test(html), legalState, "/legal",
    "/legal hub page found — all legal documents are aggregated in one place.",
    "No /legal hub page — a single /legal page linking to Privacy Policy, Terms, DPA, and cookie policy reduces support queries and improves trust."));

  checks.push(topicPageCheck({ category: MP, checkKey: "security_dedicated_page", label: "/security dedicated page" },
    linksSecurityPage(html, ctx.hostname), securityState, "/security",
    "/security page found — dedicated security documentation is available.",
    "No /security page — enterprise buyers and security teams routinely request a dedicated security page covering certifications, pen testing, and data handling."));

  checks.push(topicPageCheck({ category: MP, checkKey: "api_docs_page", label: "API documentation page" },
    /href=["']\/api|href=["']\/docs/i.test(html) || /api.*doc|developer.*doc/i.test(html), apiDocsState, "/docs",
    "API documentation page found.",
    "No API documentation page — developer-facing products need /docs or /api-docs with reference documentation to drive integration adoption."));

  checks.push(topicPageCheck({ category: MP, checkKey: "system_requirements_page", label: "System requirements / compatibility" },
    /system.*requirement|browser.*support|minimum.*requirement|compatibility/i.test(html), sysReqState, "/system-requirements",
    "System requirements / compatibility information found.",
    "No system requirements page — document supported browsers, OS versions, and minimum specs to reduce support tickets from incompatible setups."));

  checks.push(topicPageCheck({ category: MP, checkKey: "roadmap_public_page", label: "Public /roadmap page" },
    /href=["']\/roadmap|canny\.io|productboard|public.*roadmap/i.test(html), roadmapState, "/roadmap",
    "Public roadmap page found.",
    "No public roadmap page — a /roadmap page reduces inbound feature requests and helps prospects self-qualify based on upcoming capabilities."));

  const hasPricingTable = /pricing.*table|feature.*comparison|plan.*comparison|compare.*plan|plan.*feature/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "pricing_comparison_table", label: "Pricing comparison / feature matrix", status: hasPricingTable ? "PASS" : "WARN", detail: hasPricingTable ? "Pricing comparison table detected." : "No pricing comparison table — a feature matrix comparing plans helps prospects self-select without requiring a sales call." });

  const hasMigrationGuide = /href=["'].*migrat|migration.*guide|import.*guide|how.*to.*migrate|move.*from|switching.*from/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "migration_import_guide", label: "Migration / import guide", status: hasMigrationGuide ? "PASS" : "WARN", detail: hasMigrationGuide ? "Migration / import guide signals detected." : "No migration guide — a competitor migration guide reduces switching friction and directly addresses the #1 objection to changing tools." });

  checks.push(topicPageCheck({ category: MP, checkKey: "partners_ecosystem_page", label: "/partners or /ecosystem page" },
    /href=["']\/partner|href=["']\/ecosystem|partner.*program|ecosystem.*page/i.test(html), partnersState, "/partners",
    "Partners / ecosystem page found.",
    "No /partners page — a partner or ecosystem page signals distribution maturity and enables co-marketing opportunities."));

  checks.push(topicPageCheck({ category: MP, checkKey: "affiliate_programme_page", label: "/affiliate programme page" },
    /href=["']\/affiliate|affiliate.*program|referral.*program|earn.*commission|refer.*earn/i.test(html), affiliateState, "/affiliate",
    "Affiliate programme page found.",
    "No affiliate programme page — an affiliate programme is one of the highest-ROI distribution channels for SaaS, especially in developer tools."));

  checks.push(topicPageCheck({ category: MP, checkKey: "release_notes_page", label: "/release-notes page" },
    /href=["']\/release-notes|href=["']\/changelog|what.*new|release.*note/i.test(html), releaseNotesState, "/release-notes",
    "Release notes / changelog page found.",
    "No release notes page — regular release notes signal active development and give users confidence the product is improving."));

  return checks;
}
