import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";
import { documentLanguage, stripNonMarketContext } from "./jurisdictions";
import { claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";

const CATEGORY = CATEGORIES.BUSINESS_OPS;

const ALL_CHECKS: Array<[string, string]> = [
  ["physical_address_footer", "Physical address in footer"],
  ["business_hours_displayed", "Business hours displayed"],
  ["vat_number_displayed", "VAT number in footer (EU B2B)"],
  ["uk_companies_house_number", "UK Companies House registration number"],
  ["eu_director_info", "Director / responsible person named"],
  ["support_sla_documented", "Support SLA / response times documented"],
  ["invoice_generation_b2b", "Invoice / tax invoice generation"],
  ["data_retention_schedule", "Data retention schedule published"],
  ["modern_slavery_statement", "Modern Slavery Act statement"],
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

  // An actual time range or round-the-clock statement in readable text. `9.*5` matched
  // any 9 followed later by a 5, which is effectively every page.
  const hoursBase = { category: CATEGORY, checkKey: "business_hours_displayed", label: "Business hours displayed" };
  const day = String.raw`(?:Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)`;
  const ampm = String.raw`\d{1,2}(?:[:.][0-5]\d)?\s*(?:am|pm|a\.m\.|p\.m\.)`;
  const h24 = String.raw`(?:[01]?\d|2[0-3])[:.][0-5]\d`;
  const range = String.raw`\s*(?:-|–|—|to|until|till)\s*`;
  // A bare time range is not opening hours (cal.com shows "12 PM - 1 PM" as a booking slot),
  // so it counts only in a run that also names a day or says what the hours are for.
  const hoursContext = String.raw`(?=.*\b(?:${day}|weekdays?|weekends?|daily|every\s+day|open(?:ing)?|hours|office|support|available|lines|call\s+us|closed)\b)`;
  const hoursQuote = findClaim(proseRuns(ctx.contentHtml ?? html), new RegExp(
    String.raw`^${hoursContext}.*?(?:${ampm}${range}${ampm}|${h24}${range}${h24})|\b${day}${range}${day}\b[^.!?]{0,40}\d|\b(?:open|available|support(?:ed)?|staffed|here)\s+24\s*(?:\/|x)\s*7\b|\b24\s*(?:\/|x)\s*7\s+(?:support|help|service|customer)|\b24\s+hours\s+a\s+day\b`,
    "i",
  ));
  checks.push(hoursQuote
    ? claimSeen(hoursBase, "The page shows when the business or support team is available.", hoursQuote)
    : claimUnseen(hoursBase, "The scanned page does not show opening or support hours. They are often on a contact page, which this check does not read, so this does not show they are missing. Showing when people can expect a reply reduces frustration."));

  // Visible prose: scripts, styles, JSON payloads and locale switchers removed, tags
  // stripped, whitespace collapsed. Checks that read phrases read THIS, so a bounded
  // window cannot be bridged by minified markup.
  const visibleText = stripNonMarketContext(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#163;|&pound;/gi, "£")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");

  // A UK business is established by what only a UK business shows: a .uk domain, an
  // en-GB page, "Registered in England/Wales/Scotland/Northern Ireland", Companies
  // House, a UK postcode, a £ price or a +44 number. "Ltd"/"Limited" alone is not UK —
  // it is a company form in Ireland, India, Hong Kong, Singapore ("Pte. Ltd."), Australia
  // and South Africa ("(Pty) Ltd") too.
  const docRegion = (documentLanguage(html) ?? "").split("-")[1] ?? "";
  const ukReasons: string[] = [];
  if (/\.uk$/.test(ctx.hostname)) ukReasons.push(".uk domain");
  if (docRegion === "gb") ukReasons.push("page language en-GB");
  if (/\bregistered in (?:england|wales|scotland|northern ireland)\b/i.test(visibleText)) ukReasons.push("\"registered in England/Wales/Scotland\"");
  if (/\bcompanies house\b/i.test(visibleText)) ukReasons.push("Companies House mentioned");
  if (/\b[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? \d[ABD-HJLNP-UW-Z]{2}\b/.test(visibleText)) ukReasons.push("UK postcode");
  if (/£\s?\d/.test(visibleText)) ukReasons.push("£ price");
  if (/\+44[\s.-]?\(?0?\)?\s?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/.test(visibleText)) ukReasons.push("+44 phone number");
  const isUkProduct = ukReasons.length > 0;

  // The e-Commerce Directive (art. 5) and the UK e-Commerce Regulations 2002 (reg. 6) ask a
  // VAT-registered business to give its VAT number. Applies to EU and UK businesses only;
  // non-EU sites used to get a free PASS, and "vat" anywhere made a site "EU".
  const euReasons = euMarketReasons(ctx.hostname, visibleText, docRegion);
  const vatId = vatNumberOnPage(visibleText);
  checks.push({
    category: CATEGORY, checkKey: "vat_number_displayed", label: "VAT number shown (EU / UK)",
    ...(!isUkProduct && euReasons.length === 0
      ? { status: "NOT_APPLICABLE" as const, detail: "Not applicable: no EU or UK signals on the scanned page (domain, page language, euro or sterling price, UK postcode or phone number)." }
      : vatId
        ? { status: "PASS" as const, detail: `The page shows a VAT number ("${vatId}").`, evidence: vatId }
        : { status: "INCONCLUSIVE" as const, detail: `EU or UK signals found (${[...ukReasons, ...euReasons].join(", ")}), but the scanned page shows no VAT number. Only a VAT-registered business must give one, and it is normally on a legal, contact or Impressum page, so this is not evidence either way.` }),
  });
  // A registered company: the page says it is one, or names its company form.
  const isUkCompany = isUkProduct && (/\b(?:ltd|limited|plc|llp)\b/i.test(visibleText) || /\bregistered in (?:england|wales|scotland|northern ireland)\b|\bcompanies house\b/i.test(visibleText));
  // A company number is 8 characters: 8 digits, or a 2-letter prefix (SC, NI, OC…) + 6
  // digits; older numbers are often written without the leading zero (7 digits).
  const companyNumber = String.raw`(?:[A-Z]{2}\d{6}|\d{7,8})\b`;
  const hasCompaniesHouse = new RegExp(String.raw`\bcompany (?:registration )?(?:number|no\.?|reg(?:istration)?\.? no\.?)\s*:?\s*${companyNumber}|\b(?:registered|registration) (?:number|no\.?)\s*:?\s*${companyNumber}|\bregistered in (?:england|wales|scotland|northern ireland)(?: (?:and|&) wales)?(?:[^.]|\bno\.){0,60}?\b${companyNumber}|\bco\.? (?:reg\.? )?no\.?\s*:?\s*${companyNumber}|\bcrn\s*:?\s*${companyNumber}|\bcompanies house[^.]{0,40}?\b${companyNumber}`, "i").test(visibleText);
  const ukWhy = ukReasons.join(", ");
  checks.push({
    category: CATEGORY, checkKey: "uk_companies_house_number", label: "UK Companies House registration number",
    ...(!isUkProduct
      ? { status: "SKIPPED" as const, detail: "No UK signals on the scanned page (.uk domain, en-GB, \"registered in England\", Companies House, UK postcode, £ price or +44 number) — the UK company-number disclosure rule does not apply." }
      : hasCompaniesHouse
        ? { status: "PASS" as const, detail: `UK signals found (${ukWhy}) and a company registration number is shown.` }
        : isUkCompany
          ? { status: "WARN" as const, detail: `UK company signals found (${ukWhy}) but no company registration number on the scanned page — the Company, LLP and Business Names Regulations 2015 require a UK company's website to show its registered number (a legal or contact page also satisfies this).` }
          : { status: "INCONCLUSIVE" as const, confidence: "LOW" as const, confidenceReason: "Only a registered company must show a number, and the page does not say whether this business is one.", detail: `UK signals found (${ukWhy}), but the page does not show that this is a registered company (no Ltd, PLC or LLP), so whether a company number is required cannot be established. Sole traders and partnerships have none.` }),
  });

  // Word-bounded role names: "dpo" is inside "endpoint", and "art director" is a job
  // title in a portfolio, not the company's responsible person.
  const directorRole = /\b(?:managing director|company director|chief executive(?: officer)?|ceo|geschäftsführer(?:in)?|gérant|amministratore delegato|data protection officer|responsible person|vertretungsberechtigt)\b/i.exec(visibleText)?.[0];
  checks.push({
    category: CATEGORY, checkKey: "eu_director_info", label: "Director / responsible person named",
    ...(directorRole
      ? { status: "PASS" as const, detail: `The scanned page names a responsible role ("${directorRole}").` }
      : { status: "INCONCLUSIVE" as const, confidence: "LOW" as const, confidenceReason: "Where it is required, the responsible person is named on an Impressum or legal page this check does not read.", detail: "The scanned page does not name a director or responsible person. Most sites have no duty to; where one exists (e.g. a German Impressum under DDG §5) it is met on a legal page rather than the homepage, so this is not a finding." }),
  });

  // Bounded to a short window of visible text: the old /response.*time/ joined a
  // "response" in one script to a "time" thousands of characters later.
  const hasSupportSla = /\b(?:support|response|first[- ]response|resolution)\s+(?:times?|SLAs?)\b|\b(?:reply|respond|response|get back to you)\b[^.]{0,30}?\bwithin\s+(?:\d+|one|two|three|four|24|48|72)\s*(?:business |working )?(?:hours?|hrs?|days?|minutes?|mins?)\b|\bSLA\b[^.]{0,40}?\b(?:support|response|uptime)\b|\b(?:support|uptime)\b[^.]{0,40}?\bSLA\b|\b\d+\s*(?:hour|hr|business[- ]day|working[- ]day)s?\s+response\b/i.test(visibleText);
  checks.push({ category: CATEGORY, checkKey: "support_sla_documented", label: "Support SLA / response times documented", status: hasSupportSla ? "PASS" : "WARN", detail: hasSupportSla ? "Support response-time commitment found on the scanned page." : "No support response time found on the scanned page — enterprise buyers ask for documented response times in vendor assessments. If a support or SLA page states them, this does not apply." });


  // Only a site that takes payments issues invoices; sites with no payments used to be told
  // to generate VAT invoices. Read from visible copy, one sentence at a time.
  const invoicePhrase = /\b(?:download|generate|get|receive|view)\w*\s+(?:your\s+)?(?:VAT\s+|tax\s+|PDF\s+)?invoices?\b|\b(?:VAT|tax) invoices?\b|\binvoices? (?:are |is )?(?:sent|emailed|generated|available)\b|\binvoice (?:history|PDFs?)\b|\bpay by invoice\b/i.exec(visibleText)?.[0];
  checks.push({
    category: CATEGORY, checkKey: "invoice_generation_b2b", label: "Invoice / tax invoice generation",
    ...(!ctx.ctx.isPaymentEnabled
      ? { status: "NOT_APPLICABLE" as const, detail: "Not applicable: no payment processing was detected, so there is nothing to invoice." }
      : invoicePhrase
        ? { status: "PASS" as const, detail: `The page says customers get invoices ("${invoicePhrase}"). Pulse did not see an invoice itself.`, evidence: invoicePhrase }
        : { status: "INCONCLUSIVE" as const, detail: "The page takes payments but does not mention invoices. Invoices normally live in the billing area behind sign-in or on the pricing FAQ, so their absence here is not evidence either way." }),
  });



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


  // The duty (Modern Slavery Act 2015 s.54) falls on UK commercial organisations with
  // turnover of £36m or more, which a web page cannot show. So: not UK is not applicable,
  // a statement or a link to one passes, and anything else is unestablished.
  const slaveryStatement = /\bmodern slavery(?: act)?(?: (?:and human trafficking )?statement)?\b/i.exec(visibleText)?.[0]
    ?? (/\shref\s*=\s*["'][^"']*modern[-_]?slavery[^"']*["']/i.test(html) ? "a link to a modern slavery page" : null);
  checks.push({
    category: CATEGORY, checkKey: "modern_slavery_statement", label: "Modern Slavery Act statement (UK)",
    ...(!isUkProduct
      ? { status: "NOT_APPLICABLE" as const, detail: "Not applicable: no UK signals on the scanned page, and the Modern Slavery Act duty applies to organisations doing business in the UK." }
      : slaveryStatement
        ? { status: "PASS" as const, detail: `The page links to or names a modern slavery statement ("${slaveryStatement}").`, evidence: slaveryStatement }
        : { status: "INCONCLUSIVE" as const, detail: `UK signals found (${ukWhy}), but the homepage has no modern slavery statement link. The duty applies only to organisations with turnover of £36m or more, which Pulse cannot see; those must link to the statement from a prominent place on their homepage.` }),
  });



  return checks;
}

const EU_CCTLD = /\.(?:at|be|bg|cy|cz|de|dk|ee|es|eu|fi|fr|gr|hr|hu|ie|it|lt|lu|lv|mt|nl|pl|pt|ro|se|si|sk)$/;
const EU_REGIONS = new Set(["at", "be", "bg", "cy", "cz", "de", "dk", "ee", "es", "fi", "fr", "gr", "hr", "hu", "ie", "it", "lt", "lu", "lv", "mt", "nl", "pl", "pt", "ro", "se", "si", "sk"]);

/** Why the page reads as an EU business: an EU ccTLD, an EU page-language region, or a euro price. */
export function euMarketReasons(hostname: string, visibleText: string, docRegion: string): string[] {
  const reasons: string[] = [];
  if (EU_CCTLD.test(hostname)) reasons.push("EU domain");
  if (EU_REGIONS.has(docRegion)) reasons.push(`page language region ${docRegion.toUpperCase()}`);
  if (/€\s?\d|\d\s?€|\bEUR\s?\d/.test(visibleText)) reasons.push("euro price");
  return reasons;
}

/**
 * A VAT identification number in the visible text: a label (VAT, USt-IdNr, TVA, P.IVA,
 * BTW…) followed by an identifier with at least seven digits, or a country-prefixed
 * number in a published national format.
 */
export function vatNumberOnPage(visibleText: string): string | null {
  const labelled = /\b(?:VAT(?:\s+(?:reg(?:istration)?|registered|no\.?|number|ID|nr\.?))*|USt-?IdNr\.?|Umsatzsteuer-?(?:ID|Identifikationsnummer)|TVA(?: intracommunautaire)?|N° TVA|P\.?\s?IVA|Partita IVA|BTW(?:-?(?:nummer|nr\.?))?|NIF-IVA)\s*[:.#]?\s*((?:[A-Z]{2,3}\s?)?[0-9][0-9A-Z .-]{5,16}[0-9A-Z])/i.exec(visibleText);
  if (labelled && (labelled[1].match(/\d/g) ?? []).length >= 7) return labelled[0].replace(/\s+/g, " ").trim().slice(0, 60);
  const prefixed = /\b(?:GB\s?\d{3}\s?\d{4}\s?\d{2}(?:\s?\d{3})?|DE\s?\d{9}|ATU\s?\d{8}|FR\s?[0-9A-HJ-NP-Z]{2}\s?\d{9}|NL\s?\d{9}\s?B\s?\d{2}|IE\s?\d{7}[A-W][A-I]?|IT\s?\d{11}|ES\s?[A-Z0-9]\d{7}[A-Z0-9]|BE\s?[01]\d{9})\b/.exec(visibleText);
  return prefixed ? prefixed[0] : null;
}
