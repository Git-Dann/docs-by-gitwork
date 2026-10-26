import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";
import { claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";

export async function runGlobalDistributionExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { hostname } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  // UK PECR
  const hasUkPecr = /pecr|uk.*cookie|ico.*cookie|cookie.*ico|information commissioner.*cookie/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "uk_pecr_cookie_law", label: "UK PECR cookie law compliance", status: hasUkPecr ? "PASS" : "WARN", detail: hasUkPecr ? "UK PECR cookie compliance signals detected." : "No UK PECR reference — UK organisations must comply with the Privacy and Electronic Communications Regulations (PECR) for cookie consent, separate from UK GDPR." });

  // CNIL France
  const isFrenchSite = /\.fr\b/.test(hostname) || /<html\b[^>]*[\s:]lang=["']?fr\b/i.test(html) || html.includes("français") || html.includes("en France");
  const hasCnil = /cnil|commission nationale de l'informatique/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "cnil_france_compliant", label: "CNIL compliance signals (France)", status: isFrenchSite ? (hasCnil ? "PASS" : "WARN") : "PASS", detail: isFrenchSite ? (hasCnil ? "CNIL compliance signals detected." : "French market signals detected but no CNIL reference — France's CNIL has strict cookie consent guidance; specific banner wording is regulated.") : "Not applicable — no French market signals detected." });

  // EU Art. 27 representative
  // Every non-.eu/.de/.fr host used to be presumed a non-EU organisation targeting the EU.
  // Neither fact is on a web page, so only a named representative is a finding.
  const art27Base = { category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "eu_art27_representative", label: "EU Art. 27 representative named" };
  const art27Quote = findClaim(proseRuns(ctx.contentHtml ?? html), /\b(?:EU|EEA|European(?:\s+Union)?)\s+(?:GDPR\s+|data\s+protection\s+)?representatives?\b|\bArt(?:icle|\.)\s*27\b/i);
  checks.push(art27Quote
    ? claimSeen(art27Base, "The page names an EU representative under GDPR Art. 27.", art27Quote)
    : claimUnseen(art27Base, "The scanned page does not name an EU representative. Art. 27 applies only to an organisation with no establishment in the EU that offers goods or services to, or monitors, people there; Pulse cannot tell either from a web page. The representative is normally named in the privacy policy, which this check does not read."));

  // Australian Consumer Law
  const hasAuCl = /australian consumer law|acl|consumer guarantee|statutory guarantee|competition.*consumer.*act/i.test(html);
  const isAuSite = /\.au\b/.test(hostname) || html.toLowerCase().includes("australia");
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "consumer_law_aus", label: "Australian Consumer Law signals", status: isAuSite ? (hasAuCl ? "PASS" : "WARN") : "PASS", detail: isAuSite ? (hasAuCl ? "Australian Consumer Law reference detected." : "Australian market signals detected — Australian Consumer Law (ACL) provides mandatory consumer guarantees; your terms cannot override statutory rights.") : "Not applicable." });

  // Local phone numbers
  const hasLocalPhones = /\+44|\+1|\+61|\+49|\+33|\+81|\+86|\(0\)\s*\d{4}|\(800\)|freephone|freecall/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "local_phone_numbers", label: "Local phone numbers for target markets", status: hasLocalPhones ? "PASS" : "WARN", detail: hasLocalPhones ? "Local or international phone numbers detected." : "No local phone numbers detected — providing local numbers in your key markets significantly increases enterprise conversion rates." });

  // EU VAT OSS
  const hasVatOss = /vat.*oss|one.*stop.*shop|oss.*vat|moss|mini.*one.*stop|eu.*vat.*compliance/i.test(html);
  const hasEuSelling = html.toLowerCase().includes("€") || /\.eu\b/.test(hostname) || html.toLowerCase().includes("european");
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "vat_moss_oss_signals", label: "EU VAT OSS (One Stop Shop) compliance", status: hasEuSelling && ctx.ctx.isPaymentEnabled ? (hasVatOss ? "PASS" : "WARN") : "PASS", detail: hasEuSelling && ctx.ctx.isPaymentEnabled ? (hasVatOss ? "EU VAT OSS signals detected." : "EU e-commerce signals detected — document your EU VAT One Stop Shop (OSS) compliance for digital services sold to EU consumers.") : "Not applicable." });

  // Sub-processor list
  const hasSubProcessors = /sub.processor|data.*processor.*list|vendor.*list|third.*party.*processor|processor.*list/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "gdpr_dpa_list_public", label: "Sub-processors list publicly available", status: hasSubProcessors ? "PASS" : "WARN", detail: hasSubProcessors ? "Sub-processors list signals detected." : "No sub-processors list — GDPR Article 28 requires notifying customers of sub-processors; publishing the list proactively reduces procurement friction." });

  // ISO 27701
  const hasIso27701 = /iso.*27701|27701|privacy.*information.*management|pims.*iso/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "iso_27701_signals", label: "ISO 27701 (privacy management) signals", status: hasIso27701 ? "PASS" : "WARN", detail: hasIso27701 ? "ISO 27701 signals detected." : "No ISO 27701 signals — ISO 27701 (Privacy Information Management) is increasingly requested by enterprise DPOs during vendor assessment." });

  // Transfer impact assessment
  const hasTia = /standard contractual clause|scc|transfer impact assessment|tia|schrems|data transfer.*mechanism/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "transfer_impact_assessment", label: "SCCs / Data Transfer Impact Assessment", status: hasTia ? "PASS" : "WARN", detail: hasTia ? "Data transfer mechanism signals detected (SCCs / TIA)." : "No data transfer mechanism referenced — post-Schrems II, international data transfers must be covered by SCCs or another valid transfer mechanism." });

  // Mentions Légales (France/Belgium)
  const hasMentionsLegales = /mentions.légales|mentions legales|mentions légal/i.test(html) || /href=["'][^"']*legal[^"']*["']/i.test(html);
  checks.push({ category: CATEGORIES.GLOBAL_DISTRIBUTION, checkKey: "local_legal_notice", label: "Mentions Légales (France / Belgium)", status: isFrenchSite ? (hasMentionsLegales ? "PASS" : "WARN") : "PASS", detail: isFrenchSite ? (hasMentionsLegales ? "Mentions Légales page signals detected." : "French market signals detected — French and Belgian law requires a 'Mentions Légales' page with company registration, VAT number, and hosting details.") : "Not applicable." });

  return checks;
}
