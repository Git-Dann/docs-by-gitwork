import { CATEGORIES } from "./categories";
import type { ExtendedCheckContext, PulseScanCheckInput } from "./_types";
import { pageTitle } from "./path-probe";
import { probeTopicPage, topicPageCheck } from "./missing-pages-extended";
import { claimSeen, claimUnseen, pageAnchors, proseRuns } from "./page-claims";

export async function runTrustBrandExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasLogoWall = /customer.*logo|logo.*customer|client.*logo|logo.*client|trusted.*by|used.*by.*(?:teams|companies|brands)/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "customer_logo_wall", label: "Customer logo wall", status: hasLogoWall ? "PASS" : "WARN", detail: hasLogoWall ? "Customer logo wall signals detected." : "No customer logo wall — displaying well-known customer logos is one of the highest-converting trust signals on a SaaS homepage." });

  // A link to the case studies, by its path or its words. 'show' plus any later 'use' on
  // the same line ("how.*use") passed almost every page.
  const caseBase = { category: CATEGORIES.TRUST_BRAND, checkKey: "case_studies_present", label: "Customer case studies" };
  const anchors = pageAnchors(ctx.contentHtml ?? html);
  const caseLink = anchors.find((a) =>
    // A whole path segment: monzo.com's /supporting-customers is not a case study.
    /(?:^|\/)(?:case[-_]?stud(?:y|ies)|customer[-_]?stor(?:y|ies)|success[-_]?stor(?:y|ies)|customers)(?:\/|$)/i.test(a.href.replace(/^(?:https?:)?\/\/[^/]+/i, "").split(/[?#]/)[0])
    || /^(?:(?:read\s+(?:the\s+|our\s+)?)?(?:case\s+stud(?:y|ies)|customer\s+stor(?:y|ies)|success\s+stor(?:y|ies))|customers|our\s+customers)$/i.test(a.text));
  if (caseLink) {
    checks.push({ ...caseBase, status: "PASS", detail: `The page links to customer case studies: "${caseLink.text || caseLink.href}" (${caseLink.href}).` });
  } else if (anchors.length >= 15) {
    checks.push({ ...caseBase, status: "WARN", detail: `None of the ${anchors.length} links on the scanned page goes to case studies or customer stories. Detailed customer stories with results ("cut onboarding time by 40%") are among the most persuasive B2B sales content.` });
  } else {
    checks.push(claimUnseen(caseBase, `The scanned page carries only ${anchors.length} links, too few to judge its navigation (often a page that draws its menu with JavaScript), so whether it links case studies could not be established.`));
  }

  const hasAwards = /award|winner.*award|award.*winner|recognized.*by|badge.*certified|badge.*award|forbes.*cloud|inc.*500|gartner/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "awards_recognition", label: "Industry awards / recognition badges", status: hasAwards ? "PASS" : "WARN", detail: hasAwards ? "Awards / recognition signals detected." : "No awards or recognition signals — industry awards (Gartner Cool Vendor, G2 Leader) are powerful third-party validation." });

  const hasSecurityWhitepaper = /security.*whitepaper|whitepaper.*security|security.*documentation|security.*overview.*pdf|download.*security/i.test(html);
  // The route only counts when it answers with a page that names itself as a
  // security/whitepaper page — a homepage served for any path is not one.
  const whitepaperState = await probeTopicPage(httpsUrl, "/security-whitepaper", /white ?paper|\bsecurity\b/, pageTitle(html) || null);
  checks.push(topicPageCheck({ category: CATEGORIES.TRUST_BRAND, checkKey: "security_whitepaper", label: "Security whitepaper / documentation" },
    hasSecurityWhitepaper, whitepaperState, "/security-whitepaper",
    "Security documentation signals detected.",
    "No security whitepaper — a downloadable security whitepaper is requested in almost every enterprise procurement process."));

  const hasGithubOrg = /github\.com\/[a-z0-9-]+\/|open.*source|github.*org|our.*github/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "github_org_public", label: "Public GitHub organisation", status: hasGithubOrg ? "PASS" : "WARN", detail: hasGithubOrg ? "Public GitHub organisation signals detected." : "No public GitHub presence — a public GitHub org with active repos demonstrates engineering quality and commitment to open source." });

  // Whole titles in readable text: 'cto' is inside 'vector', 'factory' and 'director'.
  const ctoBase = { category: CATEGORIES.TRUST_BRAND, checkKey: "cto_technical_bio", label: "CTO / technical lead bio" };
  const ctoQuote = ownTechnicalLeader(proseRuns(ctx.contentHtml ?? html), ctx.hostname);
  checks.push(ctoQuote
    ? claimSeen(ctoBase, "The page names a technical leader.", ctoQuote)
    : claimUnseen(ctoBase, "The scanned page does not name a CTO or head of engineering. Leadership bios usually sit on an About or Team page, which this check does not read, so this does not show there is none."));

  const hasInvestorBacking = /backed.*by|investor|seed.*round|series.*[a-c]|y combinator|techstars|sequoia|andreessen|accel/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "investor_backing_listed", label: "VC / accelerator backing mentioned", status: hasInvestorBacking ? "PASS" : "WARN", detail: hasInvestorBacking ? "Investor backing signals detected." : "No investor backing signals — listing notable investors or accelerators (YC, Techstars) signals product viability to risk-averse enterprise buyers." });

  const hasConferences = /speaking.*at|talk.*at|keynote|conference|summit.*presentation|featured.*at|appeared.*at/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "conference_speaking", label: "Conference / speaking appearances", status: hasConferences ? "PASS" : "WARN", detail: hasConferences ? "Conference speaking signals detected." : "No conference speaking signals — speaking at industry events builds authority and generates organic PR." });

  // A linked hosted status page (status.<domain>, <brand>status.com, <brand>-status.com,
  // Instatus/BetterUptime/Statuspal) publishes uptime history even when the page
  // never names the provider — github.com links www.githubstatus.com, linear.app
  // links linearstatus.com, cal.com links status.cal.com.
  const linksStatusPage = /href=["']https?:\/\/(?:www\.)?(?:status\.[a-z0-9-]+\.[a-z.]+|[a-z0-9-]+status\.(?:com|io|app|dev|net)|[a-z0-9-]+\.(?:instatus\.com|betteruptime\.com|statuspal\.io))[\/"'?#]/i.test(html);
  const hasUptimeHistory = /uptime.*histor|historical.*uptime|99\.9.*uptime|99\.99.*uptime|statuspage|status\.io/i.test(html) || linksStatusPage;
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "uptime_history_public", label: "Public uptime / reliability history", status: hasUptimeHistory ? "PASS" : "WARN", detail: hasUptimeHistory ? "Public uptime history signals detected." : "No public uptime history — a public status page with historical uptime data (Statuspage, BetterUptime) builds infrastructure trust." });

  // Most testimonial cards attribute as "<Name> <Title>, <Company>" (linear.app: "Gabriel
  // Peal Staff Software Engineer, OpenAI"; cal.com: "Guillermo Rauch CEO, Vercel"). Matched
  // case-sensitively on visible text and anchored on a two- or three-word personal name, so
  // news prose ("Flock's CEO, Nvidia"), role lists ("for CEO, CTO and founders"), job lists
  // ("Senior Software Engineer, Product Designer") and "Our CEO, Jane" bios do not count.
  const visibleText = html
    .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const nameWord = "(?!(?:Our|The|Your|Their|His|Her|Meet|About|Former|New|Open|Careers)\\b)[A-Z][a-z]+(?:-[A-Z][a-z]+)?";
  const title = "(?:\\b(?:CEO|CTO|COO|CFO|CPO|CMO)|\\b(?:Co-?[Ff]ounder|Founder)|\\bHead of [A-Z][A-Za-z]+|\\b(?:VP|Vice President)(?: of)? [A-Z][A-Za-z]+|\\b(?:Senior|Sr\\.|Staff|Principal|Lead|Software|Product|Engineering|Design|Marketing|Managing|Technical)\\s+(?:[A-Z][a-z]+\\s+)?(?:Engineer|Manager|Director|Designer|Lead))";
  const titleWord = "(?:CEO|CTO|COO|CFO|CPO|CMO|Senior|Sr|Staff|Principal|Lead|Software|Product|Engineering|Design|Marketing|Managing|Technical|Head|VP|Vice|Director|Manager|Engineer|Designer|Co-?[Ff]ounder|Founder)\\b";
  const titleCommaCompany = new RegExp(
    `\\b${nameWord}(?: ${nameWord}){1,2},? (?:Co-?[Ff]ounder ?(?:&|and) ?)?${title},\\s+(?!${titleWord})[A-Z][A-Za-z0-9]`,
  ).test(visibleText);
  const hasNamedQuotes = /(?:head of|director|cto|ceo|vp|founder|engineer|manager)\s+at\s+[A-Z]/i.test(html) || /,\s*(?:head of|director|cto|ceo|vp|founder)\s+/i.test(html) || titleCommaCompany;
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "named_customer_quotes", label: "Named customer quotes (not anonymous)", status: hasNamedQuotes ? "PASS" : "WARN", detail: hasNamedQuotes ? "Named customer testimonials detected." : "No named testimonials — testimonials with full name, title, and company convert significantly better than anonymous quotes." });

  return checks;
}

const TECH_LEADER = /\b(?:CTO|Chief\s+Technology\s+Officer|Chief\s+Technical\s+Officer|VP,?\s+(?:of\s+)?Engineering|Vice\s+President,?\s+(?:of\s+)?Engineering|Head\s+of\s+(?:Engineering|Technology)|Technical\s+Co-?[Ff]ounder|Engineering\s+Director|Director\s+of\s+Engineering)\b/g;

/**
 * A technical leader of THIS company named in readable text, quoted, or null. Whole titles
 * only ('cto' is inside 'vector' and 'director'), and a title attributed to another company
 * is a customer quote, not a bio: linear.app's "Head of Engineering, Ramp", stripe.com's
 * "CTO, Xero" and cal.com's "Co-Founder & CTO, Supabase".
 */
export function ownTechnicalLeader(runs: readonly string[], hostname: string): string | null {
  const brand = hostname.toLowerCase().replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  for (const run of runs) {
    for (const m of run.matchAll(TECH_LEADER)) {
      const after = run.slice((m.index ?? 0) + m[0].length);
      const company = /^\s*(?:,|\bat\b|@|\||[-–—])\s*([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,2})/.exec(after)?.[1];
      if (company && company.toLowerCase().replace(/[^a-z0-9]/g, "") !== brand) continue;
      const start = Math.max(0, (m.index ?? 0) - 40);
      return run.slice(start, (m.index ?? 0) + m[0].length + 40).trim();
    }
  }
  return null;
}
