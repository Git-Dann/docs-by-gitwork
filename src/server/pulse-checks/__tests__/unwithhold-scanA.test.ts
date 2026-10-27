import { isRetiredCheck } from "../catalogue-compat";
// Un-withholding the "scanA" slice (Oct 2026): 34 checks whose verdicts were keyword
// guesses over raw HTML, now resting on what a visitor can read, the page's own links,
// parsed tags or DNS answers. Each case is two-sided: the input that produced the false
// finding must not produce it any more, and a realistic correct input must still be found.
// Fixtures are verbatim slices of the live pages named, captured on 26 October 2026,
// unless marked as constructed.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext, ProjectContext } from "../_types";
import type { PulseScanCheckInput } from "@/types/pulse";
import { runAuthExtended } from "../auth-extended";
import { runRolesPermissionsChecks } from "../roles-permissions";
import { runSaasExtended } from "../saas-extended";
import { runTrustBrandExtended, ownTechnicalLeader } from "../trust-brand-extended";
import { runLegalExtended } from "../legal-extended";
import { runGlobalDistributionExtended } from "../global-distribution-extended";
import { runBusinessOperationsChecks } from "../business-operations";
import { runAiReadinessChecks, aiObservabilityHost } from "../ai-readiness";
import { linksApiDocs } from "../missing-pages-extended";
import { isDmaGatekeeperHost } from "../legal-claims";
import { dkimPublicKey, dkimVerdict } from "../dkim-record";
import { dnsTtlVerdict, observeDnsTtl } from "../dns-ttl";
import { appIconSizesVerdict, appleTouchIcons, companyRegistrationVerdict, cookieBannerSignals, cookieConsentGranularVerdict, cookieTrackersLoaded, corsWildcardVerdict } from "../page-signals";
import { findClaim, pageAnchors, proseRuns } from "../page-claims";
import { WITHHELD } from "../check-relevance-data";

const SAAS: ProjectContext = { isPaymentEnabled: true, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" };

function ctx(html: string, hostname = "example.com", project: Partial<ProjectContext> = {}): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}/` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "SAAS",
    ctx: { ...SAAS, ...project },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

type Runner = (c: ExtendedCheckContext) => Promise<PulseScanCheckInput[]>;
async function check(run: Runner, key: string, html: string, hostname?: string, project?: Partial<ProjectContext>): Promise<PulseScanCheckInput> {
  const found = (await run(ctx(html, hostname, project))).find((c) => c.checkKey === key);
  if (!found) throw new Error(`${key} not emitted`);
  return found;
}

const BASE = { category: "Legal" as never, checkKey: "k", label: "l" };

afterEach(() => vi.unstubAllGlobals());

// A stand-in for linear.app's homepage: SVG sprites, a nav, minified state JSON and an
// inline ES module, padded the way the real page is (1.2 MB). Constructed from the
// fragments the withheld reasons quote.
const LINEAR_NOISE = [
  `<svg style="display:none"><symbol id="lockOutline" viewBox="0 0 16 16"></symbol><symbol id="education" viewBox="0 0 16 16"></symbol><symbol id="Policy" viewBox="0 0 16 16"></symbol><symbol id="one" viewBox="0 0 16 16"></symbol></svg>`,
  `<nav role="navigation"><a href="/admin">Admin</a><a href="/customers">Customers</a></nav>`,
  `<div role="img" aria-label="Removed" class="MR81zG_log management-link"></div><span class="sc-KOGVz hHegEo">Loops are recurring agent workflows for teams. They now</span>`,
  `<span class="sc-KOGVz jqlWID">Coding sessions<!-- --> </span>`,
  `<script type="module">import x from "./a.js"; export const state = {"data":"none","Member":1,"scope":"x","translateY":2,"slack":1,"security":"question","summarize":true,"categorize":1};</script>`,
  `<div class="skeleton spinner">Try our email detail view</div>`,
  "<p>" + "x ".repeat(5000) + "</p>",
].join("");

describe("page-claims", () => {
  it("keeps a claim inside one block, so a pattern cannot run across the page", () => {
    const runs = proseRuns("<p>Remove</p><div>" + "a ".repeat(2000) + "</div><p>members</p>");
    expect(findClaim(runs, /remove[\s\S]*members/i)).toBeNull();
    expect(findClaim(proseRuns("<p>Remove <b>members</b> in one click</p>"), /remove\s+members/i)).toContain("Remove members");
  });

  it("drops scripts, styles, SVG and tag markup", () => {
    const runs = proseRuns(LINEAR_NOISE);
    expect(runs.join(" ")).not.toMatch(/lockOutline|translateY|import x from/);
  });

  it("reads anchors with their text", () => {
    expect(pageAnchors(`<a href="/customers"><span>Customer stories</span></a>`)).toEqual([{ href: "/customers", text: "Customer stories" }]);
  });
});

describe("auth-extended", () => {
  it("account_lockout_policy: linear.app sprite ids no longer pass; a stated lockout does", async () => {
    expect((await check(runAuthExtended, "account_lockout_policy", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runAuthExtended, "account_lockout_policy", `<p>After 5 failed sign-in attempts your account is temporarily locked.</p>`)).status).toBe("PASS");
  });

  it("account_recovery_options: a 'security' link and a later 'question' do not pass; monzo.com's trusted contacts do", async () => {
    expect((await check(runAuthExtended, "account_recovery_options", `<a href="/security">Security</a><p>Got a question?</p>${LINEAR_NOISE}`)).status).toBe("INCONCLUSIVE");
    const monzo = `<span>Use known locations, a secret QR code or trusted contacts to verify it’s you.</span>`;
    expect((await check(runAuthExtended, "account_recovery_options", monzo)).status).toBe("PASS");
  });

  it("api_key_creation_ui: not applicable is no longer a PASS", async () => {
    expect((await check(runAuthExtended, "api_key_creation_ui", `<p>Create an API key</p>`, "example.com", { isSaas: false })).status).toBe("NOT_APPLICABLE");
    expect((await check(runAuthExtended, "api_key_creation_ui", `<p>Read the access token docs</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runAuthExtended, "api_key_creation_ui", `<p>Generate personal API keys from your dashboard.</p>`)).status).toBe("PASS");
  });

  it("device_management: 'management' then 'Coding session' 546,004 characters apart does not pass", async () => {
    expect((await check(runAuthExtended, "device_management", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runAuthExtended, "device_management", `<li>See and revoke your active sessions from any device.</li>`)).status).toBe("PASS");
  });

  it("concurrent_session_policy: an SVG 'one' id and 'Coding session' do not pass", async () => {
    expect((await check(runAuthExtended, "concurrent_session_policy", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runAuthExtended, "concurrent_session_policy", `<p>Admins can set a limit on concurrent sessions per seat.</p>`)).status).toBe("PASS");
  });
});

describe("roles-permissions", () => {
  it("admin_role_separation: <nav role=navigation><a href=/admin>Admin does not pass; cal.com's admin controls do", async () => {
    expect((await check(runRolesPermissionsChecks, "admin_role_separation", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    const cal = `<p>Organizations ($37/user/month) include org-wide admin controls and centralized management for larger companies.</p>`;
    expect((await check(runRolesPermissionsChecks, "admin_role_separation", cal)).status).toBe("PASS");
  });

  it("data_scope_isolation: 'your workspace' copy does not pass; vercel.com's 'Tenant Isolation' does", async () => {
    expect((await check(runRolesPermissionsChecks, "data_scope_isolation", `<h2>Your dashboard, your workspace</h2>${LINEAR_NOISE}`)).status).toBe("INCONCLUSIVE");
    expect((await check(runRolesPermissionsChecks, "data_scope_isolation", `<li class="text-gray-1000">Tenant Isolation</li>`)).status).toBe("PASS");
  });

  it("audit_trail_present: 'Activity' then a CSS class `_log` does not pass; 'audit logs' does", async () => {
    expect((await check(runRolesPermissionsChecks, "audit_trail_present", `<h4>Activity</h4><a href="/login">Log in</a>${LINEAR_NOISE}`)).status).toBe("INCONCLUSIVE");
    expect((await check(runRolesPermissionsChecks, "audit_trail_present", `<p>Enterprise includes SAML SSO and audit logs.</p>`)).status).toBe("PASS");
  });

  it("access_revocation_ui: 'Removed' to JSON 'Member' does not pass; offboarding copy does", async () => {
    expect((await check(runRolesPermissionsChecks, "access_revocation_ui", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runRolesPermissionsChecks, "access_revocation_ui", `<p>Deactivate users instantly when someone leaves.</p>`)).status).toBe("PASS");
  });

  it("data_export_permission: role=img then a JS export does not pass; a role-gated export does", async () => {
    expect((await check(runRolesPermissionsChecks, "data_export_permission", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runRolesPermissionsChecks, "data_export_permission", `<p>Only admins can export workspace data.</p>`)).status).toBe("PASS");
  });
});

describe("saas-extended", () => {
  it("custom_branding_available: 'your' then the site's own logo class does not pass", async () => {
    expect((await check(runSaasExtended, "custom_branding_available", `<p>Build your product</p><img class="logo" alt="Acme logo">`)).status).toBe("INCONCLUSIVE");
    expect((await check(runSaasExtended, "custom_branding_available", `<li>White-label portals with your own logo and custom domain</li>`)).status).toBe("PASS");
  });

  it("bulk_operations_ui: CSS user-select then 'All rights reserved' does not pass", async () => {
    expect((await check(runSaasExtended, "bulk_operations_ui", `<style>.x{user-select:none}</style><select><option>EN</option></select><footer>All rights reserved</footer>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runSaasExtended, "bulk_operations_ui", `<p>Bulk edit hundreds of issues at once.</p>`)).status).toBe("PASS");
  });

  it("data_import_capability: an inline ES module does not pass; cal.com's migration quote does", async () => {
    expect((await check(runSaasExtended, "data_import_capability", LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runSaasExtended, "data_import_capability", `<p>"I just migrated from Calendly to Cal.com."</p>`)).status).toBe("PASS");
  });
});

describe("trust-brand-extended", () => {
  it("case_studies_present: monzo.com's /supporting-customers is not a case study; linear.app's /customers is", async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join("");
    const monzo = `${links}<a href="/supporting-customers">Additional support</a>`;
    expect((await check(runTrustBrandExtended, "case_studies_present", monzo)).status).toBe("WARN");
    expect((await check(runTrustBrandExtended, "case_studies_present", `${links}<a href="/customers">Customers</a>`)).status).toBe("PASS");
  });

  it("case_studies_present: too few links to judge is inconclusive, not a missing page", async () => {
    expect((await check(runTrustBrandExtended, "case_studies_present", `<div id="root"></div>`)).status).toBe("INCONCLUSIVE");
  });

  it("cto_technical_bio: a customer quote's title is not this company's CTO (stripe.com, linear.app)", () => {
    const stripe = proseRuns(`<div class="testimonial-card__author">Mark Rees, <span class="testimonial-card__author-role">CTO, Xero</span></div>`);
    expect(ownTechnicalLeader(stripe, "stripe.com")).toBeNull();
    expect(ownTechnicalLeader(proseRuns(`<p>Nik Koblov Head of Engineering, Ramp</p>`), "linear.app")).toBeNull();
    expect(ownTechnicalLeader(proseRuns(`<p>Jane Doe, CTO at Acme</p>`), "acme.com")).toContain("CTO");
    expect(ownTechnicalLeader(proseRuns(`<h3>Our CTO</h3>`), "acme.com")).toContain("CTO");
    expect(ownTechnicalLeader(proseRuns(`<p>A vector factory director</p>`), "acme.com")).toBeNull();
  });
});

describe("legal-extended", () => {
  it("gdpr_lawful_basis_stated: a cookie banner's 'consent' or 'contractor' does not pass", async () => {
    expect((await check(runLegalExtended, "gdpr_lawful_basis_stated", `<p>Cookie consent</p><p>Hire a contractor</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "gdpr_lawful_basis_stated", `<p>We rely on legitimate interests to send service emails.</p>`)).status).toBe("PASS");
  });

  it("eu_representative_contact: not presumed to apply; a named representative passes", async () => {
    expect((await check(runLegalExtended, "eu_representative_contact", `<p>Hello</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "eu_representative_contact", `<p>Our EU representative under Article 27 is DataRep.</p>`)).status).toBe("PASS");
  });

  it("digital_markets_act: binds only designated gatekeepers", async () => {
    expect((await check(runLegalExtended, "digital_markets_act", `<p>Hello</p>`, "linear.app")).status).toBe("NOT_APPLICABLE");
    expect((await check(runLegalExtended, "digital_markets_act", `<p>Hello</p>`, "www.apple.com")).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "digital_markets_act", `<p>Our Digital Markets Act compliance report</p>`, "www.google.de")).status).toBe("PASS");
    expect(isDmaGatekeeperHost("notapple.com")).toBe(false);
    expect(isDmaGatekeeperHost("apple.com.evil.net")).toBe(false);
  });

  it("ferpa_signals: an SVG <symbol id=education> does not make an education product", async () => {
    expect((await check(runLegalExtended, "ferpa_signals", `<title>Linear</title>${LINEAR_NOISE}<p>student plan</p>`)).status).toBe("NOT_APPLICABLE");
    const school = `<title>Classroom app for schools</title><p>We protect student records under FERPA.</p>`;
    expect((await check(runLegalExtended, "ferpa_signals", school)).status).toBe("PASS");
  });

  it("cooling_off_period_eu: a 14-day free trial is not the withdrawal right", async () => {
    expect((await check(runLegalExtended, "cooling_off_period_eu", `<p>Start your 14-day free trial</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "cooling_off_period_eu", `<p>You may cancel within 14 days of delivery.</p>`)).status).toBe("PASS");
    expect((await check(runLegalExtended, "cooling_off_period_eu", `<p>Hi</p>`, "example.com", { isPaymentEnabled: false })).status).toBe("NOT_APPLICABLE");
  });

  it("auto_renewal_disclosure: linear.app's 'recurring agent workflows' is not a subscription offer", async () => {
    expect((await check(runLegalExtended, "auto_renewal_disclosure", LINEAR_NOISE)).status).toBe("NOT_APPLICABLE");
    expect((await check(runLegalExtended, "auto_renewal_disclosure", `<p>Upgrade your personal account from £3 a month</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "auto_renewal_disclosure", `<p>£3 a month. Your plan renews automatically until you cancel.</p>`)).status).toBe("PASS");
  });

  it("dmca_policy: gov.uk's Crown copyright licensing link is not a takedown procedure", async () => {
    const govuk = `<a class="govuk-footer__link govuk-footer__copyright-logo" href="https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/">© Crown copyright</a>`;
    expect((await check(runLegalExtended, "dmca_policy", govuk, "www.gov.uk")).status).toBe("INCONCLUSIVE");
    expect((await check(runLegalExtended, "dmca_policy", `<a href="/legal/dmca">Copyright</a>`)).status).toBe("PASS");
  });

  it("contract_terms_b2b: translateY, slack and island are not an SLA", async () => {
    expect((await check(runLegalExtended, "contract_terms_b2b", `<p>Enterprise plan</p>${LINEAR_NOISE}<p>Join our Slack</p>`)).status).toBe("INCONCLUSIVE");
    const cal = `<p>Enterprise: priority support, dedicated database, and higher SLAs. This is crucial for industries that require it.</p>`;
    expect((await check(runLegalExtended, "contract_terms_b2b", cal)).status).toBe("PASS");
    expect((await check(runLegalExtended, "contract_terms_b2b", `<p>Hello</p>`)).status).toBe("NOT_APPLICABLE");
  });
});

describe("global-distribution-extended", () => {
  it("eu_art27_representative: a .com host is not presumed a non-EU organisation", async () => {
    expect((await check(runGlobalDistributionExtended, "eu_art27_representative", `<p>Hello</p>`, "linear.app")).status).toBe("INCONCLUSIVE");
    expect((await check(runGlobalDistributionExtended, "eu_art27_representative", `<p>EU Representative: VeraSafe Ireland Ltd</p>`)).status).toBe("PASS");
  });
});

describe("business-operations", () => {
  it("business_hours_displayed: '9.*5' and cal.com's booking slot are not opening hours", async () => {
    expect((await check(runBusinessOperationsChecks, "business_hours_displayed", `<p>Version 9.2.5</p><p class="framer-text">12 PM - 1 PM</p>`)).status).toBe("INCONCLUSIVE");
    expect((await check(runBusinessOperationsChecks, "business_hours_displayed", `<h2>A regulated bank with 24/7 support</h2>`)).status).toBe("PASS");
    expect((await check(runBusinessOperationsChecks, "business_hours_displayed", `<p>Lines are open Monday to Friday, 9am to 5pm</p>`)).status).toBe("PASS");
  });
});

describe("ai-readiness", () => {
  const AI = `<p>Powered by AI</p><script src="https://cdn.openai.com/x.js"></script>`;
  it("ai_error_fallback_ui: 'skeleton' classes and 'email detail' are not an AI fallback", async () => {
    expect((await check(runAiReadinessChecks, "ai_error_fallback_ui", AI + LINEAR_NOISE)).status).toBe("INCONCLUSIVE");
    expect((await check(runAiReadinessChecks, "ai_error_fallback_ui", AI + `<p>The assistant is currently unavailable. Please try again.</p>`)).status).toBe("PASS");
  });

  it("ai_cost_monitoring_script: 'summarize' is not Arize; a Langfuse script is", async () => {
    expect((await check(runAiReadinessChecks, "ai_cost_monitoring_script", AI + `<p>We summarize and categorize. Read about langfuse.</p>`)).status).toBe("INCONCLUSIVE");
    expect(aiObservabilityHost(`<script src="https://cloud.langfuse.com/sdk.js"></script>`)).toBe("cloud.langfuse.com");
    expect((await check(runAiReadinessChecks, "ai_cost_monitoring_script", AI + `<script>fetch("https://oai.helicone.ai/v1")</script>`)).status).toBe("PASS");
  });
});

describe("missing-pages-extended: api_docs_page", () => {
  it("JavaScript mentioning api and doc is not a docs link; a real docs link is", () => {
    expect(linksApiDocs(`<script>const api = 1; document.title = "x";</script><link href="/api/og">`)).toBe(false);
    expect(linksApiDocs(`<a href="/developers/docs">Read more</a>`)).toBe(true);
    expect(linksApiDocs(`<a href="https://docs.stripe.com">Docs</a>`)).toBe(true);
    expect(linksApiDocs(`<a href="/apiary">Apiary</a>`)).toBe(false);
  });
});

describe("dkim_record_present", () => {
  const dkimBase = { category: "Email Deliverability" as never, checkKey: "dkim_record_present", label: "DKIM record configured" };
  it("example.com's revoked keys and -all SPF are a domain that sends no mail, not a signed one", () => {
    const v = dkimVerdict(dkimBase, { ok: true, records: ['"v=DKIM1; p="', '"v=DKIM1; p="'] }, { ok: true, records: ['"v=spf1 -all"'] });
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(dkimPublicKey('"v=DKIM1; p="')).toBe("");
  });
  it("a revoked key on a sending domain is inconclusive; a real key passes; nothing found is not absence", () => {
    expect(dkimVerdict(dkimBase, { ok: true, records: ['"v=DKIM1; p="'] }, { ok: true, records: ['"v=spf1 include:_spf.google.com ~all"'] }).status).toBe("INCONCLUSIVE");
    const key = ["MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA", "obcA5ftva7AqRZubq"].join("");
    expect(dkimVerdict(dkimBase, { ok: true, records: [`"v=DKIM1; k=rsa; p=${key}"`] }, { ok: true, records: [] }).status).toBe("PASS");
    expect(dkimVerdict(dkimBase, { ok: true, records: [] }, { ok: true, records: [] }).status).toBe("INCONCLUSIVE");
  });
});

describe("dns_ttl_optimized", () => {
  const ttlBase = { category: "Performance" as never, checkKey: "dns_ttl_optimized", label: "DNS TTL not near-zero" };
  it("is no longer a hard-coded PASS: a low remaining TTL is inconclusive, a high one passes", () => {
    expect(dnsTtlVerdict(ttlBase, "linear.app", { ok: true, ttl: 232, resolvers: 2 }).status).toBe("PASS");
    expect(dnsTtlVerdict(ttlBase, "x.test", { ok: true, ttl: 6, resolvers: 2 }).status).toBe("INCONCLUSIVE");
    expect(dnsTtlVerdict(ttlBase, "x.test", { ok: false, reason: "timeout" }).status).toBe("INCONCLUSIVE");
  });
  it("takes the larger of two resolver readings, and reads the host's own record first", async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify({
      Status: 0,
      Answer: url.includes("dns.google")
        ? [{ name: "www.gov.uk.", type: 5, TTL: 846 }, { type: 1, TTL: 6 }]
        : [{ name: "www.gov.uk", type: 5, TTL: 120 }],
    }), { status: 200 }));
    expect(await observeDnsTtl("www.gov.uk")).toEqual({ ok: true, ttl: 846, resolvers: 2 });
  });
});

describe("pulse-scan page signals", () => {
  it("app_icon_sizes: one linear.app icon at 180x180 passes; the string counted twice no longer does", () => {
    const linear = `<link rel="apple-touch-icon" href="/static/apple-touch-icon.png?v=2" sizes="180x180"/>`;
    expect(appleTouchIcons(linear)).toHaveLength(1);
    expect(appIconSizesVerdict(BASE, linear).status).toBe("PASS");
    expect(appIconSizesVerdict(BASE, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`).status).toBe("INCONCLUSIVE");
    expect(appIconSizesVerdict(BASE, `<link rel="apple-touch-icon" sizes="57x57" href="/i.png">`).status).toBe("WARN");
    expect(appIconSizesVerdict(BASE, `<p>no icons</p>`).status).toBe("INCONCLUSIVE");
  });

  it("company_registration_info: a bare suffix is not registration; monzo.com's footer is", () => {
    expect(companyRegistrationVerdict(BASE, `<footer>© 2026 Some Customer Inc. <img alt="Spotify AB"></footer><p>registered in minutes</p>`).status).toBe("INCONCLUSIVE");
    const monzo = `<p><br/><small>Monzo Bank Limited is a company registered in England and Wales (No.09446231). Monzo Bank Limited is authorised by the Prudential Regulation Authority</small></p>`;
    expect(companyRegistrationVerdict(BASE, monzo).status).toBe("PASS");
  });

  it("cookie_consent_granular: example.com and a JSON API are no longer a FAIL", () => {
    for (const html of ["<h1>Example Domain</h1>", `{"current_user_url":"https://api.github.com/user"}`]) {
      const signals = cookieBannerSignals(html);
      const v = cookieConsentGranularVerdict(BASE, { hasGranular: signals.granular, hasBanner: signals.notice, trackers: cookieTrackersLoaded(html) });
      expect(v.status).toBe("INCONCLUSIVE");
    }
  });

  it("cookie_consent_granular: a GA tag with no banner warns; a conditional inline loader does not count", () => {
    const ga = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script>`;
    expect(cookieConsentGranularVerdict(BASE, { hasGranular: false, hasBanner: false, trackers: cookieTrackersLoaded(ga) }).status).toBe("WARN");
    const cal = `<script>function appendGTMIfUS(){ var s=document.createElement("script"); s.src = "https://www.googletagmanager.com/gtm.js?id=GTM-PV22BDLZ"; }</script>`;
    expect(cookieTrackersLoaded(cal)).toEqual([]);
  });

  it("cookie_consent_granular: a script identifier is not a banner; a visible reject button is granular", () => {
    expect(cookieBannerSignals(`<script>var cookieBanner = 1; cookieSettings();</script>`)).toEqual({ granular: false, notice: false });
    const govuk = `<div class="govuk-cookie-banner"><p>We use some essential cookies to make this service work.</p><button>Reject additional cookies</button></div>`;
    expect(cookieBannerSignals(govuk).granular).toBe(true);
    expect(cookieConsentGranularVerdict(BASE, { hasGranular: false, hasBanner: true, trackers: [] }).status).toBe("WARN");
    expect(cookieConsentGranularVerdict(BASE, { hasGranular: false, hasBanner: false, hasMechanism: true, trackers: ["Google Analytics / Tag Manager"] }).status).toBe("INCONCLUSIVE");
  });

  it("cors_not_wildcard: a wildcard is a warning about where else it is sent, not a failure", () => {
    expect(corsWildcardVerdict(BASE, { "access-control-allow-origin": "*" }).status).toBe("WARN");
    expect(corsWildcardVerdict(BASE, {}).status).toBe("PASS");
    expect(corsWildcardVerdict(BASE, { "access-control-allow-origin": "https://app.example.com" }).status).toBe("PASS");
  });
});

describe("WITHHELD", () => {
  it("no longer holds the fixed keys, and still holds the unobservable ones with a reason", () => {
    // github_codeowners was a website-HTML guess; since Oct 2026 it is read from the repository.
    for (const key of ["account_lockout_policy", "cookie_consent_granular", "dkim_record_present", "digital_markets_act", "app_icon_sizes", "github_codeowners"]) {
      expect(WITHHELD[key], key).toBeUndefined();
    }
    // October 2026: the unobservable ones were retired (catalogue-compat.ts) or rebuilt on
    // real evidence, so nothing is held back any more.
    for (const key of ["gdpr_right_to_erasure_ui", "github_branch_protection"]) {
      expect(isRetiredCheck(key), key).toBe(true);
    }
    // Rebuilt on repository evidence rather than withdrawn (repo-practices.ts).
    expect(isRetiredCheck("fraud_detection_tool")).toBe(false);
    for (const key of ["dns_ttl_healthy", "early_hints_support"]) expect(WITHHELD[key], key).toBeUndefined();
  });
});
