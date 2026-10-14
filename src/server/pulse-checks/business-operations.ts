import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";

const CATEGORY = CATEGORIES.BUSINESS_OPS;

const ALL_CHECKS: Array<[string, string]> = [
  ["physical_address_footer", "Physical address in footer"],
  ["business_hours_displayed", "Business hours displayed"],
  ["vat_number_displayed", "VAT number in footer (EU B2B)"],
  ["uk_companies_house_number", "UK Companies House registration number"],
  ["eu_director_info", "Director / responsible person named"],
  ["support_sla_documented", "Support SLA / response times documented"],
  ["esignature_support", "eSignature / contract workflow"],
  ["invoice_generation_b2b", "Invoice / tax invoice generation"],
  ["insurance_mention", "Professional indemnity insurance"],
  ["gdpr_ropa_maintained", "ROPA (Records of Processing Activities)"],
  ["data_retention_schedule", "Data retention schedule published"],
  ["supplier_due_diligence", "Vendor / sub-processor due diligence"],
  ["modern_slavery_statement", "Modern Slavery Act statement"],
  ["bribery_act_policy", "Anti-bribery policy"],
  ["whistleblower_policy", "Whistleblower / speak-up policy"],
];

export async function runBusinessOperationsChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for API backends and CLI tools.");
  }

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — business operations compliance is managed through web presence, not the app store listing.");
  }

  const checks: PulseScanCheckInput[] = [];

  // Street line = house number + 1-4 street words + a street suffix. Deliberately case-sensitive:
  // the old /i form matched prose such as "3 Finding your Best" or "12 times your maximum contact".
  // Words may start with a digit ("350 5th Ave") and the suffix may be capitalised or upper case
  // ("548 MARKET STREET"); &nbsp; / &#160; count as spaces. Also accept an explicit
  // registered-office / postal-address statement (covers EU "Rue du Trône 100") and a UK postcode.
  const sp = String.raw`(?:\s|&nbsp;|&#160;)`;
  const suffixes = "Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Square|Sq|Parkway|Pkwy|Terrace|Highway|Hwy";
  const suffixAlt = `${suffixes}|${suffixes.toUpperCase()}`;
  const streetLine = new RegExp(String.raw`\b\d{1,5}[A-Za-z]?,?${sp}+(?:[A-Z0-9][A-Za-z0-9.'-]*${sp}+){1,4}(?:${suffixAlt})\b`);
  const hasPhysicalAddress =
    streetLine.test(html) ||
    /\bP\.?\s?O\.?\s*Box\s+\d+/i.test(html) ||
    /\b(?:registered (?:office|address)|head office|our address is|mailing address|postal address)\b[^<"]{0,80}?\d/i.test(html) ||
    /\b(?:[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?)\s\d[ABD-HJLNP-UW-Z]{2}\b/.test(html);
  checks.push({ category: CATEGORY, checkKey: "physical_address_footer", label: "Physical address in footer", status: hasPhysicalAddress ? "PASS" : "WARN", detail: hasPhysicalAddress ? "Physical address detected." : "No postal address found on the scanned page — UK companies must show their registered office address on their website and the EU e-Commerce Directive requires a geographic address to be easily accessible (a contact or legal page also satisfies this); CAN-SPAM separately requires one in commercial emails." });

  const hasBusinessHours = /business hours|office hours|monday.*friday|mon.*fri|9.*5|support.*hours|available.*\d+.*\d+/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "business_hours_displayed", label: "Business hours displayed", status: hasBusinessHours ? "PASS" : "WARN", detail: hasBusinessHours ? "Business hours signals detected." : "No business hours detected — displaying support availability hours reduces frustration and manages customer expectations." });

  const hasVatNumber = /vat.*number|vat reg|gb\d{9}|eu\d{9}|\bvat\b.*\d{7,12}/i.test(html);
  const isEuProduct = /\.eu\b/.test(ctx.hostname) || html.toLowerCase().includes("€") || html.toLowerCase().includes("vat");
  checks.push({ category: CATEGORY, checkKey: "vat_number_displayed", label: "VAT number in footer (EU B2B)", status: isEuProduct ? (hasVatNumber ? "PASS" : "WARN") : "PASS", detail: isEuProduct ? (hasVatNumber ? "VAT registration number signals detected." : "EU signals detected but no VAT number — EU B2B customers need your VAT number for reverse-charge invoicing and expense claims.") : "Not applicable." });

  const hasCompaniesHouse = /company.*number|companies.*house|registered.*england|registered.*wales|registered.*scotland|co\. no\.|no\.\s+\d{7,8}/i.test(html);
  const isUkProduct = /\.uk\b/.test(ctx.hostname) || html.toLowerCase().includes("united kingdom") || html.toLowerCase().includes("ltd") || html.toLowerCase().includes("limited");
  checks.push({ category: CATEGORY, checkKey: "uk_companies_house_number", label: "UK Companies House registration number", status: isUkProduct ? (hasCompaniesHouse ? "PASS" : "WARN") : "PASS", detail: isUkProduct ? (hasCompaniesHouse ? "UK company registration number detected." : "UK signals detected but no Companies House number — UK law requires displaying your registered company number on your website.") : "Not applicable." });

  const hasDirectorInfo = /director|ceo|chief executive|managing director|responsible person|dpo|data protection officer/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "eu_director_info", label: "Director / responsible person named", status: hasDirectorInfo ? "PASS" : "WARN", detail: hasDirectorInfo ? "Director / responsible person information detected." : "No director or DPO named — some EU jurisdictions require naming a responsible person on the company website." });

  const hasSupportSla = /support.*sla|response.*time|reply.*within|sla.*support|24.*hour.*response|business.*day.*response/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "support_sla_documented", label: "Support SLA / response times documented", status: hasSupportSla ? "PASS" : "WARN", detail: hasSupportSla ? "Support SLA / response time signals detected." : "No support SLA documented — enterprise buyers require documented response times in their vendor assessment questionnaires." });

  const hasEsignature = /esignature|e-signature|docusign|hellosign|sign now|adobe.*sign|pandadoc|electronic.*signature/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "esignature_support", label: "eSignature / contract workflow", status: hasEsignature ? "PASS" : "WARN", detail: hasEsignature ? "eSignature / contract workflow signals detected." : "No eSignature signals — B2B contracts require legal electronic signatures; integrations with DocuSign, HelloSign, or PandaDoc streamline procurement." });

  const hasInvoicing = /invoice.*generation|tax.*invoice|generate.*invoice|download.*invoice|billing.*invoice|vat.*invoice/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invoice_generation_b2b", label: "Invoice / tax invoice generation", status: hasInvoicing ? "PASS" : "WARN", detail: hasInvoicing ? "Invoice generation signals detected." : "No invoice generation signals — B2B customers in all markets require VAT/tax invoices for expense reporting and bookkeeping." });

  const hasInsurance = /professional.*indemnity|liability.*insurance|insurance.*certificate|indemnity.*insurance/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "insurance_mention", label: "Professional indemnity insurance", status: hasInsurance ? "PASS" : "WARN", detail: hasInsurance ? "Professional indemnity insurance signals detected." : "No insurance mention — enterprise and government procurement often require proof of professional indemnity insurance as a condition of contracting." });

  const hasRopa = /records of processing|processing activities|ropa|article.*30|data.*processing.*register/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "gdpr_ropa_maintained", label: "ROPA (Records of Processing Activities)", status: hasRopa ? "PASS" : "WARN", detail: hasRopa ? "ROPA reference detected." : "No ROPA reference — GDPR Article 30 requires maintaining a record of all data processing activities. Enterprise DPOs will ask to see it." });

  // Bounded phrases only: the old unbounded `.*` joined e.g. a `data-testid` attribute to a word
  // "retention" 770KB later in minified HTML. A verb/object statement must name a duration
  // ("for 7 years", "for as long as…"), so product copy such as "Store files for free" is not read
  // as a retention schedule.
  // A count must be a count of time units: "for 3rd parties" or "for one low price" is not a period.
  const retentionUnit = String.raw`(?:hours?|days?|weeks?|months?|years?)\b`;
  const retentionDuration = String.raw`\b(?:for|until)\s+(?:up to\s+|at least\s+|a maximum of\s+|no longer than\s+)?(?:\d+(?:\s*(?:-|–|to)\s*\d+)?\s*${retentionUnit}|(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:\(\d+\)\s+)?${retentionUnit}|as long as|(?:a |the )?(?:period|duration|length|life)\b)`;
  const retentionObject = String.raw`(?:(?:your|the|any|all|such|our)\s+)?(?:(?:personal|customer|user|account|usage)\s+)*(?:data|information|records|logs)\b`;
  const hasDataRetention =
    /\bdata retention\b|\bretention (?:policy|policies|period|periods|schedule)\b|\b(?:security|storage) and retention\b|\bretention of (?:your )?(?:personal )?(?:data|information)\b|\bhow long (?:do |will |)we (?:keep|retain|store|hold)\b|\bdeleted?\b[^.<]{0,80}?\bafter\s+\d+\s*(?:day|week|month|year)s?\b|\bkept for (?:up to )?\d+\s*(?:day|week|month|year)s?\b/i.test(html) ||
    new RegExp(String.raw`\b(?:retain|keep|store|hold)(?:s|ed|ing)?\s+${retentionObject}[^.<]{0,60}?${retentionDuration}`, "i").test(html) ||
    new RegExp(String.raw`\b(?:data|information|records|logs)\s+(?:is|are|will be|may be|is only|are only)\s+(?:retained|kept|stored|held)\b[^.<]{0,40}?${retentionDuration}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "data_retention_schedule", label: "Data retention schedule published", status: hasDataRetention ? "PASS" : "WARN", detail: hasDataRetention ? "Data retention schedule signals detected." : "No data retention schedule found on the scanned page — UK/EU GDPR (Art. 13(2)(a)) requires your privacy notice to state how long personal data is kept. If your privacy policy already states retention periods, this does not apply." });

  const hasVendorDueDiligence = /vendor.*assessment|supplier.*due.*diligence|third.*party.*risk|sub.processor.*review|vendor.*security/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "supplier_due_diligence", label: "Vendor / sub-processor due diligence", status: hasVendorDueDiligence ? "PASS" : "WARN", detail: hasVendorDueDiligence ? "Vendor due diligence signals detected." : "No vendor due diligence signals — document your process for assessing sub-processors; enterprise DPOs require evidence of third-party risk management." });

  const hasModernSlavery = /modern slavery|human trafficking|slavery.*act|forced.*labour.*statement/i.test(html);
  const isLargeOrg = /enterprise|£|million|billion|employee.*\d{3}/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "modern_slavery_statement", label: "Modern Slavery Act statement (UK)", status: isLargeOrg && isUkProduct ? (hasModernSlavery ? "PASS" : "WARN") : "PASS", detail: isLargeOrg && isUkProduct ? (hasModernSlavery ? "Modern Slavery Act statement detected." : "UK organisation signals detected — UK companies with >£36M turnover must publish a Modern Slavery Act transparency statement.") : "Not applicable at this stage." });

  const hasAntiBribery = /anti.bribery|bribery.*act|anti.*corruption|gifts.*hospitality.*policy/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "bribery_act_policy", label: "Anti-bribery policy (UK Bribery Act)", status: isUkProduct ? (hasAntiBribery ? "PASS" : "WARN") : "PASS", detail: isUkProduct ? (hasAntiBribery ? "Anti-bribery policy signals detected." : "UK signals detected — the UK Bribery Act 2010 requires organisations to have 'adequate procedures' to prevent bribery; an anti-bribery policy is the key evidence.") : "Not applicable." });

  const hasWhistleblower = /whistleblow|speak.*up|raise.*concern|report.*misconduct|ethics.*hotline|confidential.*report/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "whistleblower_policy", label: "Whistleblower / speak-up policy", status: hasWhistleblower ? "PASS" : "WARN", detail: hasWhistleblower ? "Whistleblower / speak-up policy signals detected." : "No whistleblower policy detected — EU Whistleblower Protection Directive requires organisations with >50 employees to have a formal reporting channel." });

  return checks;
}
