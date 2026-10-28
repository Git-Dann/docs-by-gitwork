/**
 * Crawl evidence: answering homepage-only checks from the other pages the crawl read.
 *
 * Several checks ask what a business publishes (a sub-processor list, a whistleblowing
 * channel, the rights a privacy notice explains, a company number) and read only the
 * homepage, or one fetched privacy policy. A site that publishes the thing on its trust or
 * legal page therefore came back INCONCLUSIVE. The internal scan's crawl
 * (pulse-agents/site-crawl-agent.ts) reads up to 15 pages plus a handful of legal and trust
 * pages; this module is the PURE half that lets those checks use them.
 *
 * Rules, each one a test in crawl-evidence.test.ts:
 *  - Only an upgrade. An INCONCLUSIVE (or, for the few checks whose WARN says another page
 *    would satisfy it, a WARN) becomes PASS when a page the crawl read says the thing.
 *    Nothing here ever produces a FAIL or WARN, and a PASS is never replaced: a site that
 *    does not publish a whistleblowing page is still INCONCLUSIVE.
 *  - Only pages that are really pages. Soft 404s, catch-all answers, unrendered app shells,
 *    bot walls and error responses are not evidence (site-crawl.ts classifyPage).
 *  - Each check reads only the kind of page that can answer it. A retention period in a
 *    blog post about backups is not a retention schedule, and a "CEO" in a customer quote
 *    is not the company's responsible person.
 *  - Every PASS names the URL it came from and quotes what that page says, using the same
 *    matcher as the homepage check, so the two cannot disagree about what counts.
 */
import type { PulseScanCheckInput } from "@/types/pulse";
import {
  BUSINESS_HOURS_CLAIM,
  COMPANY_POLICY_CLAIMS,
  DATA_RETENTION_CLAIMS,
  DIRECTOR_ROLE_CLAIM,
  INVOICE_CLAIM,
  MODERN_SLAVERY_CLAIM,
  SUPPORT_SLA_CLAIM,
  UK_COMPANY_NUMBER_CLAIM,
  linkClaim,
  vatNumberOnPage,
} from "./business-operations";
import { TRANSFER_MECHANISM_CLAIMS } from "./global-distribution-extended";
import { EU_REPRESENTATIVE_CLAIM, LAWFUL_BASIS_CLAIM } from "./legal-extended";
import { findClaim, proseRuns } from "./page-claims";
import { COMPANY_REGISTRATION } from "./page-signals";
import { ACCESS_RIGHT_CLAIM, PORTABILITY_RIGHT_CLAIM } from "./privacy-notice-rights";
import {
  analysePage,
  classifyPage,
  pageIdentity,
  type CrawlObservation,
  type PageKind,
  type TrustTopic,
} from "./site-crawl";
import { isEmptyShell } from "@/server/pulse-lite/spa-detect";

/** A page the crawl read that can stand as evidence. */
export interface EvidencePage {
  url: string;
  html: string;
  title: string | null;
  lang: string | null;
  kind: PageKind | null;
  topic: TrustTopic | null;
}

/** Every readable page the crawl fetched beyond the homepage, de-duplicated. */
export function crawlEvidencePages(obs: CrawlObservation): EvidencePage[] {
  const ctx = { home: obs.home, catchAllBody: obs.catchAll && obs.catchAll.status === 200 ? obs.catchAll.body : null };
  const homeId = pageIdentity(obs.home.finalUrl || obs.home.url);
  const seen = new Set<string>([homeId]);
  const out: EvidencePage[] = [];
  const candidates = [
    ...obs.pages.map((p) => ({ fetch: p.fetch, kind: p.kind, topic: null as TrustTopic | null })),
    ...(obs.trustPages ?? []).map((p) => ({ fetch: p.fetch, kind: null as PageKind | null, topic: p.topic })),
  ];
  for (const c of candidates) {
    if (classifyPage(c.fetch, ctx) !== "page" || isEmptyShell(c.fetch.body)) continue;
    const url = c.fetch.finalUrl || c.fetch.url;
    const id = pageIdentity(url);
    if (seen.has(id)) continue;
    seen.add(id);
    const a = analysePage(c.fetch.body, c.fetch.headers);
    out.push({ url, html: c.fetch.body, title: a.title, lang: a.lang, kind: c.kind, topic: c.topic });
  }
  return out;
}

// ── Which pages can answer which question ───────────────────────────────────

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

/** Editorial and customer-story pages talk about other people and other companies. */
const EDITORIAL = /(?:^|\/)(?:blog|news|newsroom|press|articles?|insights|stories|posts|journal|customers?|case-stud(?:y|ies)|testimonials|podcasts?|events?|webinars?|changelog|releases?)(?:\/|$)/i;

function isEditorial(page: EvidencePage): boolean {
  return page.kind === "article" || page.kind === "blog" || EDITORIAL.test(pathOf(page.url));
}

const PRIVACY_WORDS = /\b(?:privacy|data[ -]protection|datenschutz|gdpr|your[ -]rights|data[ -]subject|personal[ -](?:data|information))\b/i;
const LEGAL_WORDS = /\b(?:privacy|legal|terms|policy|policies|gdpr|data[ -]protection|datenschutz|rights|trust|security|compliance|imprint|impressum|sub-?processors?|cookies?|dpa|modern[ -]slavery|ethics|conduct|whistle-?blow\w*|speak[ -]up|bribery|sla|service[ -]level)\b/i;
const SUPPORT_WORDS = /\b(?:support|help|contact|sla|service[ -]level|pricing|plans|customer[ -]service|hours)\b/i;
const BILLING_WORDS = /\b(?:pricing|plans|billing|invoic\w*|payments?|help|faq|support|docs)\b/i;
const COMPANY_WORDS = /\b(?:about|company|team|leadership|contact|imprint|impressum|legal|who[ -]we[ -]are|our[ -]story)\b/i;

function described(page: EvidencePage, words: RegExp): boolean {
  return words.test(pathOf(page.url).replace(/[/_-]+/g, " ")) || words.test(page.title ?? "");
}

const anyContent = (p: EvidencePage) => !isEditorial(p);
const privacyPage = (p: EvidencePage) => !isEditorial(p) && (p.topic === "privacy" || p.topic === "rights" || described(p, PRIVACY_WORDS));
const legalPage = (p: EvidencePage) => !isEditorial(p) && (p.topic !== null || described(p, LEGAL_WORDS));
const companyPage = (p: EvidencePage) => !isEditorial(p) && (p.kind === "about" || p.kind === "contact" || p.topic === "imprint" || p.topic === "legal" || described(p, COMPANY_WORDS));
// A product page that sells "24/7 support" to the customer's own customers, or an invoicing
// feature, says nothing about the business's own support or billing (atlassian.com/enterprise,
// stripe.com/products). Hours, response times and invoices are read from the pages that state them.
const supportPage = (p: EvidencePage) => !isEditorial(p) && (p.kind === "contact" || p.kind === "docs" || p.kind === "pricing" || p.topic === "sla" || described(p, SUPPORT_WORDS));
const billingPage = (p: EvidencePage) => !isEditorial(p) && (p.kind === "pricing" || p.kind === "docs" || described(p, BILLING_WORDS));
const english = (p: EvidencePage) => !p.lang || p.lang.toLowerCase().startsWith("en");

// ── The checks ──────────────────────────────────────────────────────────────

type Status = PulseScanCheckInput["status"];

interface Rule {
  /** Statuses this rule may replace. INCONCLUSIVE unless the check's own WARN says another page satisfies it. */
  from: readonly Status[];
  pages: (p: EvidencePage) => boolean;
  /** A quote from the page that answers the check, or null. */
  find: (p: EvidencePage) => string | null;
  /** The sentence the PASS opens with. */
  found: string;
}

const runsOf = (p: EvidencePage) => proseRuns(p.html);
const claim = (re: RegExp) => (p: EvidencePage) => findClaim(runsOf(p), re);
const anyClaim = (res: readonly RegExp[]) => (p: EvidencePage) => {
  const runs = runsOf(p);
  for (const re of res) {
    const q = findClaim(runs, re);
    if (q) return q;
  }
  return null;
};
const visibleText = (p: EvidencePage) => runsOf(p).join(" ");

const INCONCLUSIVE: readonly Status[] = ["INCONCLUSIVE"];
const INCONCLUSIVE_OR_WARN: readonly Status[] = ["INCONCLUSIVE", "WARN"];

const policyRule = (key: keyof typeof COMPANY_POLICY_CLAIMS, pages: Rule["pages"]): Rule => {
  const spec = COMPANY_POLICY_CLAIMS[key];
  return {
    from: INCONCLUSIVE,
    pages,
    find: (p) => findClaim(runsOf(p), spec.re) ?? linkClaim(p.html, spec.re),
    found: spec.found,
  };
};

export const CRAWL_EVIDENCE_RULES: Readonly<Record<string, Rule>> = {
  // Not from a privacy notice: those quote the regulator's own phone hours (gov.uk's lists the
  // ICO's "Monday to Friday, 9am to 4:30pm"), which are not the business's.
  business_hours_displayed: { from: INCONCLUSIVE, pages: (p) => supportPage(p) && !privacyPage(p) && p.topic === null, find: claim(BUSINESS_HOURS_CLAIM), found: "The site shows when the business or support team is available." },
  vat_number_displayed: { from: INCONCLUSIVE, pages: anyContent, find: (p) => vatNumberOnPage(visibleText(p)), found: "The site shows a VAT number." },
  // Its WARN says "a legal or contact page also satisfies this".
  uk_companies_house_number: { from: INCONCLUSIVE_OR_WARN, pages: anyContent, find: claim(UK_COMPANY_NUMBER_CLAIM), found: "The site shows a company registration number." },
  company_registration_info: { from: INCONCLUSIVE, pages: anyContent, find: claim(COMPANY_REGISTRATION), found: "The site states the company's registration details." },
  eu_director_info: { from: INCONCLUSIVE, pages: companyPage, find: claim(DIRECTOR_ROLE_CLAIM), found: "The site names a responsible role." },
  // Its WARN says "if a support or SLA page states them, this does not apply".
  support_sla_documented: { from: INCONCLUSIVE_OR_WARN, pages: supportPage, find: claim(SUPPORT_SLA_CLAIM), found: "The site states a support response time." },
  invoice_generation_b2b: { from: INCONCLUSIVE, pages: billingPage, find: claim(INVOICE_CLAIM), found: "The site says customers get invoices. Pulse did not see an invoice itself." },
  // Its WARN says "if your privacy policy already states retention periods, this does not apply".
  data_retention_schedule: { from: INCONCLUSIVE_OR_WARN, pages: legalPage, find: anyClaim(DATA_RETENTION_CLAIMS), found: "The site states how long data is kept." },
  bribery_act_policy: policyRule("bribery_act_policy", anyContent),
  whistleblower_policy: policyRule("whistleblower_policy", anyContent),
  supplier_due_diligence: policyRule("supplier_due_diligence", legalPage),
  // Terms often oblige the CUSTOMER to hold insurance, and an insurer's product pages sell it,
  // so only the business's own trust, legal and about pages count.
  insurance_mention: policyRule("insurance_mention", (p) => legalPage(p) || companyPage(p)),
  gdpr_lawful_basis_stated: { from: INCONCLUSIVE, pages: privacyPage, find: claim(LAWFUL_BASIS_CLAIM), found: "The privacy notice names the lawful basis for processing personal data." },
  eu_representative_contact: { from: INCONCLUSIVE, pages: legalPage, find: claim(EU_REPRESENTATIVE_CLAIM), found: "The site names an EU representative under GDPR Art. 27." },
  eu_art27_representative: { from: INCONCLUSIVE, pages: legalPage, find: claim(EU_REPRESENTATIVE_CLAIM), found: "The site names an EU representative under GDPR Art. 27." },
  transfer_impact_assessment: { from: INCONCLUSIVE, pages: legalPage, find: anyClaim(TRANSFER_MECHANISM_CLAIMS), found: "The site names a mechanism for international data transfers. Pulse did not review the agreements themselves." },
  gdpr_right_to_access: { from: INCONCLUSIVE, pages: (p) => privacyPage(p) && english(p), find: claim(ACCESS_RIGHT_CLAIM), found: "The privacy notice tells people about the right of access (asking for a copy of their personal data)." },
  gdpr_right_to_portability: { from: INCONCLUSIVE, pages: (p) => privacyPage(p) && english(p), find: claim(PORTABILITY_RIGHT_CLAIM), found: "The privacy notice tells people about the right to data portability." },
};

/** Keys whose homepage answer the crawl may improve. */
export const CRAWL_EVIDENCE_KEYS: ReadonlySet<string> = new Set([...Object.keys(CRAWL_EVIDENCE_RULES), "modern_slavery_statement"]);

const MAX_QUOTE = 240;

/**
 * Apply the crawl's pages to the checks that read only the homepage. Returns every input
 * check, each either unchanged or upgraded. Pure.
 */
export function upgradeFromCrawl(checks: PulseScanCheckInput[], pages: EvidencePage[]): PulseScanCheckInput[] {
  return checks.map((check) => {
    if (check.checkKey === "modern_slavery_statement") return slaveryFromCrawl(check, pages);
    const rule = CRAWL_EVIDENCE_RULES[check.checkKey];
    if (!rule || !rule.from.includes(check.status)) return check;
    for (const page of pages) {
      if (!rule.pages(page)) continue;
      const quote = rule.find(page)?.slice(0, MAX_QUOTE);
      if (!quote) continue;
      return {
        category: check.category,
        checkKey: check.checkKey,
        label: check.label,
        status: "PASS" as const,
        confidence: "HIGH" as const,
        confidenceReason: "Quoted from a page the crawl read on this site.",
        evidenceStrength: "VERIFIED" as const,
        detail: `${rule.found} Found on ${page.url}, which says: "${quote}"`,
        evidence: `${page.url}: ${quote}`,
      };
    }
    return check;
  });
}

/**
 * The Modern Slavery Act asks for the statement to be linked from a prominent place on the
 * homepage, so a statement found only on another page does not answer the check. It stays
 * INCONCLUSIVE (Pulse still cannot see whether the £36m threshold applies) and says where
 * the statement is.
 */
function slaveryFromCrawl(check: PulseScanCheckInput, pages: EvidencePage[]): PulseScanCheckInput {
  if (check.status !== "INCONCLUSIVE") return check;
  for (const page of pages) {
    if (isEditorial(page)) continue;
    const quote = findClaim(runsOf(page), MODERN_SLAVERY_CLAIM) ?? linkClaim(page.html, MODERN_SLAVERY_CLAIM);
    if (!quote) continue;
    return {
      ...check,
      detail: `${check.detail} The site does publish one: ${page.url} says "${quote.slice(0, MAX_QUOTE)}". If the duty applies, link it from the homepage too.`,
      evidence: `${page.url}: ${quote.slice(0, MAX_QUOTE)}`,
    };
  }
  return check;
}
