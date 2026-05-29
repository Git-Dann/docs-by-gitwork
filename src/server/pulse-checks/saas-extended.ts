import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";

export async function runSaasExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP")) {
    return skip("SaaS Readiness", [
      ["saml_sso_available", "SAML / SSO enterprise tier"],
      ["scim_user_provisioning", "SCIM user provisioning"],
      ["custom_branding_available", "White-label / custom branding"],
      ["enterprise_pricing_tier", "Enterprise pricing tier"],
      ["keyboard_shortcuts_ui", "Keyboard shortcut hints"],
      ["dark_mode_supported", "Dark mode (prefers-color-scheme)"],
      ["bulk_operations_ui", "Bulk select / bulk operations"],
      ["data_export_csv_pdf", "Data export (CSV / PDF / Excel)"],
      ["data_import_capability", "Data import / migration"],
      ["community_forum_slack", "Community forum or Slack workspace"],
      ["app_marketplace_listed", "App marketplace listing"],
      ["public_roadmap", "Public product roadmap"],
      ["partner_reseller_program", "Partner / reseller programme"],
      ["g2_capterra_listed", "G2 or Capterra listing"],
      ["volume_discount_signals", "Volume discounts"],
    ], "Not applicable for this platform type.");
  }

  // SAML SSO
  const hasSaml = /saml|single.*sign.on|sso.*enterprise|enterprise.*sso|okta.*integration|azure.*ad.*sso/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "saml_sso_available", label: "SAML / SSO enterprise tier", status: hasSaml ? "PASS" : "WARN", detail: hasSaml ? "SAML / SSO signals detected." : "No SAML/SSO signals — enterprise deals routinely require SSO support. Okta and Azure AD integrations unlock company accounts with >100 seats." });

  // SCIM
  const hasScim = /scim|user.*provisioning|deprovisioning|directory.*sync|automatic.*provisioning/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "scim_user_provisioning", label: "SCIM user provisioning", status: hasScim ? "PASS" : "WARN", detail: hasScim ? "SCIM provisioning signals detected." : "No SCIM signals — SCIM automates user lifecycle management from the customer's identity provider, reducing IT admin overhead." });

  // Custom branding
  const hasCustomBranding = /custom.*brand|white.label|your.*logo|brand.*settings|custom.*domain|custom.*subdomain/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "custom_branding_available", label: "White-label / custom branding", status: hasCustomBranding ? "PASS" : "WARN", detail: hasCustomBranding ? "Custom branding signals detected." : "No white-label/custom branding signals — custom branding (logo, domain, colours) is a common enterprise tier differentiator." });

  // Enterprise pricing tier
  const hasEnterpriseTier = /enterprise.*plan|enterprise.*pricing|enterprise.*tier|talk.*to.*sales|contact.*sales.*enterprise|custom.*pricing/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "enterprise_pricing_tier", label: "Enterprise pricing tier", status: hasEnterpriseTier ? "PASS" : "WARN", detail: hasEnterpriseTier ? "Enterprise pricing tier signals detected." : "No enterprise pricing tier — a clearly labelled enterprise plan (with custom pricing and SSO) is necessary to close larger deals." });

  // Keyboard shortcuts
  const hasKeyboardShortcuts = /keyboard.*shortcut|shortcut.*key|⌘|ctrl\+|hotkey|keybinding/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "keyboard_shortcuts_ui", label: "Keyboard shortcut hints", status: hasKeyboardShortcuts ? "PASS" : "WARN", detail: hasKeyboardShortcuts ? "Keyboard shortcut signals detected." : "No keyboard shortcuts detected — power users expect keyboard shortcuts; they improve adoption and reduce churn among technical users." });

  // Dark mode
  const hasDarkMode = /dark.*mode|prefers-color-scheme.*dark|dark.*theme|theme.*toggle|light.*dark.*toggle/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "dark_mode_supported", label: "Dark mode (prefers-color-scheme)", status: hasDarkMode ? "PASS" : "WARN", detail: hasDarkMode ? "Dark mode signals detected." : "No dark mode detected — dark mode is now a standard expectation; support prefers-color-scheme and a manual toggle." });

  // Bulk operations
  const hasBulkOps = /bulk.*select|select.*all|bulk.*delete|bulk.*export|bulk.*action|bulk.*update|multi.*select/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "bulk_operations_ui", label: "Bulk select / bulk operations", status: hasBulkOps ? "PASS" : "WARN", detail: hasBulkOps ? "Bulk operation signals detected." : "No bulk operations detected — enterprise users managing large datasets need bulk select, delete, and export to be productive." });

  // Data export
  const hasDataExport = /export.*csv|download.*csv|export.*excel|export.*pdf|download.*report|export.*data/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "data_export_csv_pdf", label: "Data export (CSV / PDF / Excel)", status: hasDataExport ? "PASS" : "WARN", detail: hasDataExport ? "Data export signals detected." : "No data export signals — users and compliance teams need to export their data. CSV, PDF, and Excel are the minimum expectation." });

  // Data import
  const hasDataImport = /import.*csv|upload.*csv|import.*data|data.*migration|migrate.*from|import.*from/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "data_import_capability", label: "Data import / migration", status: hasDataImport ? "PASS" : "WARN", detail: hasDataImport ? "Data import / migration signals detected." : "No data import signals — making it easy to migrate from competitors reduces switch friction." });

  // Community
  const hasCommunity = /community.*forum|slack.*community|discord.*community|forum\.|\bjoin.*community|community.*slack/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "community_forum_slack", label: "Community forum or Slack workspace", status: hasCommunity ? "PASS" : "WARN", detail: hasCommunity ? "Community signals detected." : "No community forum or Slack workspace — a community reduces support load, increases retention, and creates user-to-user advocacy." });

  // Marketplace
  const hasMarketplace = /app.*marketplace|extension.*marketplace|plugin.*marketplace|integration.*marketplace|atlassian.*marketplace|zapier.*integration/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "app_marketplace_listed", label: "App marketplace listing", status: hasMarketplace ? "PASS" : "WARN", detail: hasMarketplace ? "App marketplace signals detected." : "No marketplace signals — listing on Zapier, Make, HubSpot, or platform-specific marketplaces drives distribution." });

  // Public roadmap
  const hasRoadmap = /public.*roadmap|product.*roadmap|roadmap\.canny|canny\.io|trello.*roadmap|productboard/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "public_roadmap", label: "Public product roadmap", status: hasRoadmap ? "PASS" : "WARN", detail: hasRoadmap ? "Public roadmap signals detected." : "No public roadmap — a public roadmap (Canny, Linear, Trello) reduces support queries about upcoming features and builds trust." });

  // Partner / reseller
  const hasPartner = /partner.*program|reseller.*program|affiliate.*program|channel.*partner|become.*partner|referral.*partner/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "partner_reseller_program", label: "Partner / reseller programme", status: hasPartner ? "PASS" : "WARN", detail: hasPartner ? "Partner / reseller programme signals detected." : "No partner programme signals — a channel partner programme multiplies distribution without proportional headcount." });

  // G2 / Capterra
  const hasReviewPlatform = /g2\.com|capterra\.com|getapp\.com|trustpilot|trustradius|g2.*review|capterra.*review/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "g2_capterra_listed", label: "G2 or Capterra listing", status: hasReviewPlatform ? "PASS" : "WARN", detail: hasReviewPlatform ? "G2 or Capterra listing signals detected." : "No G2/Capterra listing signals — B2B buyers increasingly use G2 and Capterra for shortlisting; build your presence early." });

  // Volume discounts
  const hasVolumeDiscount = /volume.*discount|volume.*pricing|seats.*discount|custom.*quote|discount.*team|bulk.*pricing/i.test(html);
  checks.push({ category: "SaaS Readiness", checkKey: "volume_discount_signals", label: "Volume discount signals", status: hasVolumeDiscount ? "PASS" : "WARN", detail: hasVolumeDiscount ? "Volume discount signals detected." : "No volume discount signals — clearly signalling volume discounts reduces friction in procurement conversations." });

  return checks;
}
