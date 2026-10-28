import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";
import { claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";
import { reviewPlatformEvidence, roadmapEvidence } from "./vendor-evidence";

export async function runSaasExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORIES.SAAS, [
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
  checks.push({ category: CATEGORIES.SAAS, checkKey: "saml_sso_available", label: "SAML / SSO enterprise tier", status: hasSaml ? "PASS" : "WARN", detail: hasSaml ? "SAML / SSO signals detected." : "No SAML/SSO signals — enterprise deals routinely require SSO support. Okta and Azure AD integrations unlock company accounts with >100 seats." });

  // SCIM
  const hasScim = /scim|user.*provisioning|deprovisioning|directory.*sync|automatic.*provisioning/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "scim_user_provisioning", label: "SCIM user provisioning", status: hasScim ? "PASS" : "WARN", detail: hasScim ? "SCIM provisioning signals detected." : "No SCIM signals — SCIM automates user lifecycle management from the customer's identity provider, reducing IT admin overhead." });

  // Custom branding
  // Readable text, one block at a time (page-claims.ts): `your.*logo` matched the word
  // 'your' followed anywhere by the site's own logo class or alt text.
  const runs = proseRuns(ctx.contentHtml ?? html);
  const brandingBase = { category: CATEGORIES.SAAS, checkKey: "custom_branding_available", label: "White-label / custom branding" };
  const brandingQuote = findClaim(runs, /\bwhite[- ]?label(?:ed|ing)?\b|\bcustom\s+(?:branding|brand(?:ed)?\s+(?:domains?|portals?|emails?|pages?)|domains?|subdomains?|logos?|colou?rs?\s+and\s+logos?)\b|\b(?:your|own)\s+(?:own\s+)?(?:logo|branding|brand\s+colou?rs?)\b|\b(?:add|upload|use)\s+your\s+(?:own\s+)?logo\b/i);
  checks.push(brandingQuote
    ? claimSeen(brandingBase, "The page offers customers their own branding, logo or domain.", brandingQuote)
    : claimUnseen(brandingBase, "The scanned page does not mention white-label or custom branding. Plan features are often listed on a pricing page rather than here, so this does not show it is unavailable."));

  // Enterprise pricing tier
  const hasEnterpriseTier = /enterprise.*plan|enterprise.*pricing|enterprise.*tier|talk.*to.*sales|contact.*sales.*enterprise|custom.*pricing/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "enterprise_pricing_tier", label: "Enterprise pricing tier", status: hasEnterpriseTier ? "PASS" : "WARN", detail: hasEnterpriseTier ? "Enterprise pricing tier signals detected." : "No enterprise pricing tier — a clearly labelled enterprise plan (with custom pricing and SSO) is necessary to close larger deals." });

  // Keyboard shortcuts
  const hasKeyboardShortcuts = /keyboard.*shortcut|shortcut.*key|⌘|ctrl\+|hotkey|keybinding/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "keyboard_shortcuts_ui", label: "Keyboard shortcut hints", status: hasKeyboardShortcuts ? "PASS" : "WARN", detail: hasKeyboardShortcuts ? "Keyboard shortcut signals detected." : "No keyboard shortcuts detected — power users expect keyboard shortcuts; they improve adoption and reduce churn among technical users." });

  // Dark mode
  // Concrete dark-theme markers only: greedy .* across minified HTML passed stripe.com on
  // "palette-light…webp … dark … toggle". Toggle wording counts when the words are adjacent.
  const hasDarkMode = /prefers-color-scheme\s*:\s*dark|\bcolor-scheme\s*:\s*(?:light\s+)?dark\b|name=["']color-scheme["'][^>]*content=["'][^"']*\bdark\b|\bdata-(?:theme|color-mode|mode|bs-theme|theme-option)=["']dark["']|\bdata-dark-theme=|\[data-theme=["']?dark["']?\]|<html[^>]*\bclass=["'][^"']*\bdark\b|(?:\bhtml|:root)\.dark\b|\bdark:[a-z][\w-]*|\bdark[\s-](?:mode|theme)\b|\btheme[\s-]toggle\b|\b(?:toggle|switch) (?:the )?(?:theme|colou?r[\s-]?scheme|dark mode)\b|\bswitch between (?:dark and light|light and dark)\b/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "dark_mode_supported", label: "Dark mode (prefers-color-scheme)", status: hasDarkMode ? "PASS" : "WARN", detail: hasDarkMode ? "Dark mode signals detected." : "No dark mode detected — dark mode is now a standard expectation; support prefers-color-scheme and a manual toggle." });

  // Bulk operations
  // `select.*all` matched CSS `user-select` followed by any later 'all' (install, small).
  const bulkBase = { category: CATEGORIES.SAAS, checkKey: "bulk_operations_ui", label: "Bulk select / bulk operations" };
  const bulkQuote = findClaim(runs, /\bbulk\s+(?:edit(?:s|ing)?|actions?|select(?:ion)?|delete|deletion|update(?:s)?|operations?|export(?:s)?|import(?:s)?|upload(?:s)?|changes?|archive)\b|\bmulti[- ]?select\b|\bin\s+bulk\b|\bbatch\s+(?:edit(?:ing)?|actions?|updates?|operations?)\b/i);
  checks.push(bulkQuote
    ? claimSeen(bulkBase, "The page mentions acting on many records at once.", bulkQuote)
    : claimUnseen(bulkBase, "The scanned page does not mention bulk or batch actions. They live inside the signed-in product, which this scan cannot reach, so this does not show they are missing."));

  // Data export
  const hasDataExport = /export.*csv|download.*csv|export.*excel|export.*pdf|download.*report|export.*data/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "data_export_csv_pdf", label: "Data export (CSV / PDF / Excel)", status: hasDataExport ? "PASS" : "WARN", detail: hasDataExport ? "Data export signals detected." : "No data export signals — users and compliance teams need to export their data. CSV, PDF, and Excel are the minimum expectation." });

  // Data import
  // `import.*from` matched every inline ES module (`import x from "…"`); scripts are not prose.
  const importBase = { category: CATEGORIES.SAAS, checkKey: "data_import_capability", label: "Data import / migration" };
  const importQuote = findClaim(runs, /\bimport\w*\s+(?:your\s+|existing\s+|all\s+)?(?:data|contacts|customers|users|issues|projects|records|files|history|content|spreadsheets?|csvs?)\b|\bimport\w*\s+(?:\w+\s+){0,2}from\s+(?:csv|excel|a\s+spreadsheet|spreadsheets|another\s+tool|other\s+tools|your\s+(?:old|current|existing|previous)\s+\w+|jira|trello|asana|notion|airtable|hubspot|salesforce|shopify|github|google\s+sheets)\b|\b(?:csv|spreadsheet|excel|bulk)\s+import(?:s|er)?\b|\bmigrat\w*\s+(?:your\s+\w+\s+)?from\b|\bmigrat\w*\s+your\s+(?:data|content|projects|workspace)\b/i);
  checks.push(importQuote
    ? claimSeen(importBase, "The page mentions bringing existing data in.", importQuote)
    : claimUnseen(importBase, "The scanned page does not mention importing data or migrating from another tool. Import tools often sit inside the product or in the help centre, so this does not show they are missing."));

  // Community
  const hasCommunity = /community.*forum|slack.*community|discord.*community|forum\.|\bjoin.*community|community.*slack/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "community_forum_slack", label: "Community forum or Slack workspace", status: hasCommunity ? "PASS" : "WARN", detail: hasCommunity ? "Community signals detected." : "No community forum or Slack workspace — a community reduces support load, increases retention, and creates user-to-user advocacy." });

  // Marketplace
  // Adjacent phrases, marketplace / app-directory links, and the major named directories.
  // Greedy .* matched "app … marketplace" across a whole page (stripe.com: "Payments for
  // marketplaces"). Plugin/extension paths must end there, so /wp-content/plugins/x.css does
  // not count; App Store / Google Play download badges are not a marketplace listing.
  const hasMarketplace = /\b(?:apps?|extensions?|plugins?|integrations?)\W{1,3}marketplace\b|href=["']https?:\/\/marketplace\.[a-z0-9-]+\.|href=["'][^"']*\/marketplace(?:[\/?#][^"']*)?["']|>\s*marketplace\s*<|\bapps\.shopify\.com\b|\bappexchange\b|\becosystem\.hubspot\.com\b|\bchromewebstore\.google\.com\b|\bchrome\.google\.com\/webstore\b|\bapp directory\b|\bzapier\.com\/apps\/|\bzapier\W{1,3}integrations?\b|href=["'][^"']*\/integrations(?:\/[^"']*)?["']|href=["'][^"']*\/(?:community\/plugins|plugins|extensions)\/?["']/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "app_marketplace_listed", label: "App marketplace listing", status: hasMarketplace ? "PASS" : "WARN", detail: hasMarketplace ? "App marketplace signals detected." : "No marketplace signals — listing on Zapier, Make, HubSpot, or platform-specific marketplaces drives distribution." });

  // Public roadmap
  // A link to a roadmap board (customer.canny.io, a /roadmap page) or the words in readable
  // text. "productboard" in a script or `product.*roadmap` across the whole page is not one.
  const roadmap = roadmapEvidence(ctx.contentHtml ?? html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "public_roadmap", label: "Public product roadmap", status: roadmap ? "PASS" : "WARN", evidence: roadmap ?? undefined, detail: roadmap ? `The page ${roadmap}.` : "No public roadmap — a public roadmap (Canny, Linear, Trello) reduces support queries about upcoming features and builds trust." });

  // Partner / reseller
  const hasPartner = /partner.*program|reseller.*program|affiliate.*program|channel.*partner|become.*partner|referral.*partner/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "partner_reseller_program", label: "Partner / reseller programme", status: hasPartner ? "PASS" : "WARN", detail: hasPartner ? "Partner / reseller programme signals detected." : "No partner programme signals — a channel partner programme multiplies distribution without proportional headcount." });

  // G2 / Capterra
  // A link to the G2 or Capterra-network listing (Capterra, GetApp, Software Advice), or the
  // platform's own badge. `g2.*review` across the page or a Trustpilot link is not one.
  const g2Capterra = reviewPlatformEvidence(ctx.contentHtml ?? html).filter((e) => ["G2", "Capterra", "GetApp", "Software Advice"].includes(e.platform));
  const hasReviewPlatform = g2Capterra.length > 0;
  checks.push({ category: CATEGORIES.SAAS, checkKey: "g2_capterra_listed", label: "G2 or Capterra listing", status: hasReviewPlatform ? "PASS" : "WARN", evidence: g2Capterra[0]?.where, detail: hasReviewPlatform ? `The page links its listing: ${g2Capterra.map((e) => `${e.platform} (${e.where})`).join(", ")}.` : "No G2/Capterra listing signals — B2B buyers increasingly use G2 and Capterra for shortlisting; build your presence early." });

  // Volume discounts
  const hasVolumeDiscount = /volume.*discount|volume.*pricing|seats.*discount|custom.*quote|discount.*team|bulk.*pricing/i.test(html);
  checks.push({ category: CATEGORIES.SAAS, checkKey: "volume_discount_signals", label: "Volume discount signals", status: hasVolumeDiscount ? "PASS" : "WARN", detail: hasVolumeDiscount ? "Volume discount signals detected." : "No volume discount signals — clearly signalling volume discounts reduces friction in procurement conversations." });

  return checks;
}
