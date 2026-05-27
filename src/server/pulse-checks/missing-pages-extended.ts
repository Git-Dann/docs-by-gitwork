import { type ExtendedCheckContext, type PulseScanCheckInput, headRequest, platformIs, skip } from "./_types";

export async function runMissingPagesExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP")) {
    return skip("Missing Pages", [
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

  const [
    legalStatus, securityStatus, apiDocsStatus, sysReqStatus, roadmapStatus,
    partnersStatus, affiliateStatus, releaseNotesStatus,
  ] = await Promise.all([
    headRequest(`${httpsUrl}/legal`),
    headRequest(`${httpsUrl}/security`),
    headRequest(`${httpsUrl}/docs`),
    headRequest(`${httpsUrl}/system-requirements`),
    headRequest(`${httpsUrl}/roadmap`),
    headRequest(`${httpsUrl}/partners`),
    headRequest(`${httpsUrl}/affiliate`),
    headRequest(`${httpsUrl}/release-notes`),
  ]);

  const hasLegalHub = legalStatus === 200 || /href=["']\/legal["']/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "legal_hub_page", label: "/legal hub page", status: hasLegalHub ? "PASS" : "WARN", detail: hasLegalHub ? "/legal hub page found — all legal documents are aggregated in one place." : "No /legal hub page — a single /legal page linking to Privacy Policy, Terms, DPA, and cookie policy reduces support queries and improves trust." });

  const hasSecurityPage = securityStatus === 200 || /href=["']\/security["']/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "security_dedicated_page", label: "/security dedicated page", status: hasSecurityPage ? "PASS" : "WARN", detail: hasSecurityPage ? "/security page found — dedicated security documentation is available." : "No /security page — enterprise buyers and security teams routinely request a dedicated security page covering certifications, pen testing, and data handling." });

  const hasApiDocs = apiDocsStatus === 200 || /href=["']\/api|href=["']\/docs/i.test(html) || /api.*doc|developer.*doc/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "api_docs_page", label: "API documentation page", status: hasApiDocs ? "PASS" : "WARN", detail: hasApiDocs ? "API documentation page found." : "No API documentation page — developer-facing products need /docs or /api-docs with reference documentation to drive integration adoption." });

  const hasSysReq = sysReqStatus === 200 || /system.*requirement|browser.*support|minimum.*requirement|compatibility/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "system_requirements_page", label: "System requirements / compatibility", status: hasSysReq ? "PASS" : "WARN", detail: hasSysReq ? "System requirements / compatibility information found." : "No system requirements page — document supported browsers, OS versions, and minimum specs to reduce support tickets from incompatible setups." });

  const hasRoadmapPage = roadmapStatus === 200 || /href=["']\/roadmap|canny\.io|productboard|public.*roadmap/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "roadmap_public_page", label: "Public /roadmap page", status: hasRoadmapPage ? "PASS" : "WARN", detail: hasRoadmapPage ? "Public roadmap page found." : "No public roadmap page — a /roadmap page reduces inbound feature requests and helps prospects self-qualify based on upcoming capabilities." });

  const hasPricingTable = /pricing.*table|feature.*comparison|plan.*comparison|compare.*plan|plan.*feature/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "pricing_comparison_table", label: "Pricing comparison / feature matrix", status: hasPricingTable ? "PASS" : "WARN", detail: hasPricingTable ? "Pricing comparison table detected." : "No pricing comparison table — a feature matrix comparing plans helps prospects self-select without requiring a sales call." });

  const hasMigrationGuide = /href=["'].*migrat|migration.*guide|import.*guide|how.*to.*migrate|move.*from|switching.*from/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "migration_import_guide", label: "Migration / import guide", status: hasMigrationGuide ? "PASS" : "WARN", detail: hasMigrationGuide ? "Migration / import guide signals detected." : "No migration guide — a competitor migration guide reduces switching friction and directly addresses the #1 objection to changing tools." });

  const hasPartnersPage = partnersStatus === 200 || /href=["']\/partner|href=["']\/ecosystem|partner.*program|ecosystem.*page/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "partners_ecosystem_page", label: "/partners or /ecosystem page", status: hasPartnersPage ? "PASS" : "WARN", detail: hasPartnersPage ? "Partners / ecosystem page found." : "No /partners page — a partner or ecosystem page signals distribution maturity and enables co-marketing opportunities." });

  const hasAffiliatePage = affiliateStatus === 200 || /href=["']\/affiliate|affiliate.*program|referral.*program|earn.*commission|refer.*earn/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "affiliate_programme_page", label: "/affiliate programme page", status: hasAffiliatePage ? "PASS" : "WARN", detail: hasAffiliatePage ? "Affiliate programme page found." : "No affiliate programme page — an affiliate programme is one of the highest-ROI distribution channels for SaaS, especially in developer tools." });

  const hasReleaseNotes = releaseNotesStatus === 200 || /href=["']\/release-notes|href=["']\/changelog|what.*new|release.*note/i.test(html);
  checks.push({ category: "Missing Pages", checkKey: "release_notes_page", label: "/release-notes page", status: hasReleaseNotes ? "PASS" : "WARN", detail: hasReleaseNotes ? "Release notes / changelog page found." : "No release notes page — regular release notes signal active development and give users confidence the product is improving." });

  return checks;
}
