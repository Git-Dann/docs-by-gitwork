import { type ExtendedCheckContext, type PulseScanCheckInput, headRequest } from "./_types";

export async function runTrustBrandExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl, catchAll200 } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasLogoWall = /customer.*logo|logo.*customer|client.*logo|logo.*client|trusted.*by|used.*by.*(?:teams|companies|brands)/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "customer_logo_wall", label: "Customer logo wall", status: hasLogoWall ? "PASS" : "WARN", detail: hasLogoWall ? "Customer logo wall signals detected." : "No customer logo wall — displaying well-known customer logos is one of the highest-converting trust signals on a SaaS homepage." });

  const hasCaseStudies = /case.*stud|success.*stor|customer.*story|how.*use|real.*world.*use/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "case_studies_present", label: "Customer case studies", status: hasCaseStudies ? "PASS" : "WARN", detail: hasCaseStudies ? "Case study / success story signals detected." : "No case studies — detailed customer success stories with metrics (\"reduced X by 40%\") are the most persuasive B2B sales content." });

  const hasAwards = /award|winner.*award|award.*winner|recognized.*by|badge.*certified|badge.*award|forbes.*cloud|inc.*500|gartner/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "awards_recognition", label: "Industry awards / recognition badges", status: hasAwards ? "PASS" : "WARN", detail: hasAwards ? "Awards / recognition signals detected." : "No awards or recognition signals — industry awards (Gartner Cool Vendor, G2 Leader) are powerful third-party validation." });

  const hasSecurityWhitepaper = /security.*whitepaper|whitepaper.*security|security.*documentation|security.*overview.*pdf|download.*security/i.test(html);
  // Catch-all hosts 200 every path, so the route probe only counts off catch-all;
  // the in-page signal carries it otherwise.
  const securityDocServed = !catchAll200 && (await headRequest(`${httpsUrl}/security-whitepaper`)) === 200;
  const hasSecurityDoc = hasSecurityWhitepaper || securityDocServed;
  checks.push({ category: "Trust & Brand", checkKey: "security_whitepaper", label: "Security whitepaper / documentation", status: hasSecurityDoc ? "PASS" : "WARN", detail: hasSecurityDoc ? "Security documentation signals detected." : "No security whitepaper — a downloadable security whitepaper is requested in almost every enterprise procurement process." });

  const hasGithubOrg = /github\.com\/[a-z0-9-]+\/|open.*source|github.*org|our.*github/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "github_org_public", label: "Public GitHub organisation", status: hasGithubOrg ? "PASS" : "WARN", detail: hasGithubOrg ? "Public GitHub organisation signals detected." : "No public GitHub presence — a public GitHub org with active repos demonstrates engineering quality and commitment to open source." });

  const hasCtoBio = /cto|chief.*technical|vp.*engineering|head.*engineering|technical.*founder|engineering.*team/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "cto_technical_bio", label: "CTO / technical lead bio", status: hasCtoBio ? "PASS" : "WARN", detail: hasCtoBio ? "CTO / technical leadership bio signals detected." : "No CTO or technical lead bio — technical buyers want to know who's responsible for the architecture and security of the product." });

  const hasInvestorBacking = /backed.*by|investor|seed.*round|series.*[a-c]|y combinator|techstars|sequoia|andreessen|accel/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "investor_backing_listed", label: "VC / accelerator backing mentioned", status: hasInvestorBacking ? "PASS" : "WARN", detail: hasInvestorBacking ? "Investor backing signals detected." : "No investor backing signals — listing notable investors or accelerators (YC, Techstars) signals product viability to risk-averse enterprise buyers." });

  const hasConferences = /speaking.*at|talk.*at|keynote|conference|summit.*presentation|featured.*at|appeared.*at/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "conference_speaking", label: "Conference / speaking appearances", status: hasConferences ? "PASS" : "WARN", detail: hasConferences ? "Conference speaking signals detected." : "No conference speaking signals — speaking at industry events builds authority and generates organic PR." });

  const hasUptimeHistory = /uptime.*histor|historical.*uptime|99\.9.*uptime|99\.99.*uptime|statuspage|status\.io/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "uptime_history_public", label: "Public uptime / reliability history", status: hasUptimeHistory ? "PASS" : "WARN", detail: hasUptimeHistory ? "Public uptime history signals detected." : "No public uptime history — a public status page with historical uptime data (Statuspage, BetterUptime) builds infrastructure trust." });

  const hasNamedQuotes = /(?:head of|director|cto|ceo|vp|founder|engineer|manager)\s+at\s+[A-Z]/i.test(html) || /,\s*(?:head of|director|cto|ceo|vp|founder)\s+/i.test(html);
  checks.push({ category: "Trust & Brand", checkKey: "named_customer_quotes", label: "Named customer quotes (not anonymous)", status: hasNamedQuotes ? "PASS" : "WARN", detail: hasNamedQuotes ? "Named customer testimonials detected." : "No named testimonials — testimonials with full name, title, and company convert significantly better than anonymous quotes." });

  return checks;
}
