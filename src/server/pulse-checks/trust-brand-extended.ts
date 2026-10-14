import { CATEGORIES } from "./categories";
import type { ExtendedCheckContext, PulseScanCheckInput } from "./_types";
import { pageTitle } from "./path-probe";
import { probeTopicPage, topicPageCheck } from "./missing-pages-extended";

export async function runTrustBrandExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasLogoWall = /customer.*logo|logo.*customer|client.*logo|logo.*client|trusted.*by|used.*by.*(?:teams|companies|brands)/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "customer_logo_wall", label: "Customer logo wall", status: hasLogoWall ? "PASS" : "WARN", detail: hasLogoWall ? "Customer logo wall signals detected." : "No customer logo wall — displaying well-known customer logos is one of the highest-converting trust signals on a SaaS homepage." });

  const hasCaseStudies = /case.*stud|success.*stor|customer.*story|how.*use|real.*world.*use/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "case_studies_present", label: "Customer case studies", status: hasCaseStudies ? "PASS" : "WARN", detail: hasCaseStudies ? "Case study / success story signals detected." : "No case studies — detailed customer success stories with metrics (\"reduced X by 40%\") are the most persuasive B2B sales content." });

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

  const hasCtoBio = /cto|chief.*technical|vp.*engineering|head.*engineering|technical.*founder|engineering.*team/i.test(html);
  checks.push({ category: CATEGORIES.TRUST_BRAND, checkKey: "cto_technical_bio", label: "CTO / technical lead bio", status: hasCtoBio ? "PASS" : "WARN", detail: hasCtoBio ? "CTO / technical leadership bio signals detected." : "No CTO or technical lead bio — technical buyers want to know who's responsible for the architecture and security of the product." });

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
