import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, headRequest, platformIs, skip } from "./_types";

export async function runMissingPagesExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl, catchAll200 } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP")) {
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

  // On a catch-all host every path returns 200, so a status probe can't prove a
  // page exists — fall back to real in-page <a href>/content signals. routeFound()
  // returns true only when the host is NOT catch-all AND the path 200s.
  const routeFound = async (path: string) => !catchAll200 && (await headRequest(`${httpsUrl}${path}`)) === 200;
  const [
    legalFound, securityFound, apiDocsFound, sysReqFound, roadmapFound,
    partnersFound, affiliateFound, releaseNotesFound,
  ] = await Promise.all([
    routeFound("/legal"),
    routeFound("/security"),
    routeFound("/docs"),
    routeFound("/system-requirements"),
    routeFound("/roadmap"),
    routeFound("/partners"),
    routeFound("/affiliate"),
    routeFound("/release-notes"),
  ]);

  const hasLegalHub = legalFound || /href=["']\/legal["']/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "legal_hub_page", label: "/legal hub page", status: hasLegalHub ? "PASS" : "WARN", detail: hasLegalHub ? "/legal hub page found — all legal documents are aggregated in one place." : "No /legal hub page — a single /legal page linking to Privacy Policy, Terms, DPA, and cookie policy reduces support queries and improves trust." });

  const hasSecurityPage = securityFound || /href=["']\/security["']/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "security_dedicated_page", label: "/security dedicated page", status: hasSecurityPage ? "PASS" : "WARN", detail: hasSecurityPage ? "/security page found — dedicated security documentation is available." : "No /security page — enterprise buyers and security teams routinely request a dedicated security page covering certifications, pen testing, and data handling." });

  const hasApiDocs = apiDocsFound || /href=["']\/api|href=["']\/docs/i.test(html) || /api.*doc|developer.*doc/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "api_docs_page", label: "API documentation page", status: hasApiDocs ? "PASS" : "WARN", detail: hasApiDocs ? "API documentation page found." : "No API documentation page — developer-facing products need /docs or /api-docs with reference documentation to drive integration adoption." });

  const hasSysReq = sysReqFound || /system.*requirement|browser.*support|minimum.*requirement|compatibility/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "system_requirements_page", label: "System requirements / compatibility", status: hasSysReq ? "PASS" : "WARN", detail: hasSysReq ? "System requirements / compatibility information found." : "No system requirements page — document supported browsers, OS versions, and minimum specs to reduce support tickets from incompatible setups." });

  const hasRoadmapPage = roadmapFound || /href=["']\/roadmap|canny\.io|productboard|public.*roadmap/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "roadmap_public_page", label: "Public /roadmap page", status: hasRoadmapPage ? "PASS" : "WARN", detail: hasRoadmapPage ? "Public roadmap page found." : "No public roadmap page — a /roadmap page reduces inbound feature requests and helps prospects self-qualify based on upcoming capabilities." });

  const hasPricingTable = /pricing.*table|feature.*comparison|plan.*comparison|compare.*plan|plan.*feature/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "pricing_comparison_table", label: "Pricing comparison / feature matrix", status: hasPricingTable ? "PASS" : "WARN", detail: hasPricingTable ? "Pricing comparison table detected." : "No pricing comparison table — a feature matrix comparing plans helps prospects self-select without requiring a sales call." });

  const hasMigrationGuide = /href=["'].*migrat|migration.*guide|import.*guide|how.*to.*migrate|move.*from|switching.*from/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "migration_import_guide", label: "Migration / import guide", status: hasMigrationGuide ? "PASS" : "WARN", detail: hasMigrationGuide ? "Migration / import guide signals detected." : "No migration guide — a competitor migration guide reduces switching friction and directly addresses the #1 objection to changing tools." });

  const hasPartnersPage = partnersFound || /href=["']\/partner|href=["']\/ecosystem|partner.*program|ecosystem.*page/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "partners_ecosystem_page", label: "/partners or /ecosystem page", status: hasPartnersPage ? "PASS" : "WARN", detail: hasPartnersPage ? "Partners / ecosystem page found." : "No /partners page — a partner or ecosystem page signals distribution maturity and enables co-marketing opportunities." });

  const hasAffiliatePage = affiliateFound || /href=["']\/affiliate|affiliate.*program|referral.*program|earn.*commission|refer.*earn/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "affiliate_programme_page", label: "/affiliate programme page", status: hasAffiliatePage ? "PASS" : "WARN", detail: hasAffiliatePage ? "Affiliate programme page found." : "No affiliate programme page — an affiliate programme is one of the highest-ROI distribution channels for SaaS, especially in developer tools." });

  const hasReleaseNotes = releaseNotesFound || /href=["']\/release-notes|href=["']\/changelog|what.*new|release.*note/i.test(html);
  checks.push({ category: CATEGORIES.MISSING_PAGES, checkKey: "release_notes_page", label: "/release-notes page", status: hasReleaseNotes ? "PASS" : "WARN", detail: hasReleaseNotes ? "Release notes / changelog page found." : "No release notes page — regular release notes signal active development and give users confidence the product is improving." });

  return checks;
}
