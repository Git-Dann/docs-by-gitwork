// @vitest-environment node
/**
 * Website checks that used to PASS on a vendor's NAME anywhere in the HTML (§84.19).
 * Each rule is tested both ways: the real evidence passes, and the old false-pass input
 * (the name in prose, a comment, a script string, a competitor comparison) does not.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  amazonAppstoreVerdict, apmVerdict, bnplVerdict, classifyStatusProbe, complianceClaim,
  cryptoPaymentsVerdict, emailProviderVerdict, githubOrgLink, INVESTOR_CLAIM, AWARD_CLAIM,
  CONFERENCE_CLAIM, linkedSocialProfiles, productHuntVerdict, proseClaimVerdict,
  resetStatusPageCache, reviewPlatformEvidence, roadmapEvidence, rumVerdict, scriptSrcs, spfSenders,
  statusEvidence, statusPageLinks, uptimeMonitoringVerdict, walletVerdict,
} from "../vendor-evidence";
import type { PathProbe } from "../path-probe";

const page = (body: string, head = "") => `<!doctype html><html><head><title>Acme</title>${head}</head><body>${body}</body></html>`;
const STATUS_BODY = "<html><head><title>Acme Status</title></head><body><h1>All Systems Operational</h1></body></html>";
const probe = (status: number, body = ""): PathProbe => ({ status, contentType: "text/html", body });

beforeEach(() => resetStatusPageCache());

describe("scriptSrcs", () => {
  it("reads quoted and unquoted src, skips data-src and commented-out tags", () => {
    const html = `<script src="https://a.com/x.js"></script><script src=//b.com/y.js></script><script data-src="https://c.com/z.js"></script><!-- <script src="https://d.com/w.js"></script> -->`;
    expect(scriptSrcs(html)).toEqual(["https://a.com/x.js", "//b.com/y.js"]);
  });
});

describe("apm_signals", () => {
  it("PASSes when the New Relic browser agent is loaded or initialised", () => {
    expect(apmVerdict(page("", `<script src="https://js-agent.newrelic.com/nr-spa-1.2.js"></script>`)).status).toBe("PASS");
    expect(apmVerdict(page("", `<script>;window.NREUM||(NREUM={});NREUM.init={privacy:{}}</script>`)).status).toBe("PASS");
    expect(apmVerdict(page("", `<script src="https://js-cdn.dynatrace.com/jstag/abc/ruxitagentjs_ICA.js"></script>`)).status).toBe("PASS");
  });
  it("does not PASS on the vendor name in prose, a comparison table or a comment", () => {
    expect(apmVerdict(page(`<p>We moved from New Relic and Dynatrace to Honeycomb.</p><table><tr><td>newrelic</td><td>appdynamics</td></tr></table><!-- newrelic -->`)).status).toBe("WARN");
    expect(apmVerdict(page(`<p>Sentry Performance and Elastic APM compared</p>`)).status).toBe("WARN");
  });
});

describe("real_user_monitoring", () => {
  it("PASSes on a RUM script the page loads, including self-hosted SpeedCurve LUX", () => {
    expect(rumVerdict(page("", `<script src="/assets/static/vendor/lux/lux-measurer-a1b2.js"></script>`)).status).toBe("PASS");
    expect(rumVerdict(page("", `<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>`)).status).toBe("PASS");
    expect(rumVerdict(page("", `<script src="/_vercel/speed-insights/script.js"></script>`)).status).toBe("PASS");
  });
  it("does not PASS on 'web-vitals' or 'speedcurve' in an article", () => {
    expect(rumVerdict(page(`<article><h2>Measuring web-vitals with SpeedCurve</h2><p>Cloudflare Web Analytics is free.</p></article>`)).status).toBe("WARN");
  });
});

describe("status pages", () => {
  it("finds the site's own status hosts and hosted status pages, never someone else's", () => {
    expect(statusPageLinks(`<a href="https://status.cal.com/">Status</a>`, "cal.com").map((l) => l.own)).toEqual([true]);
    expect(statusPageLinks(`<a href="https://www.vercel-status.com">Status</a>`, "vercel.com")).toHaveLength(1);
    expect(statusPageLinks(`<a href="https://www.githubstatus.com">Status</a>`, "github.com")).toHaveLength(1);
    expect(statusPageLinks(`<a href="https://acme.betteruptime.com">Status</a>`, "acme.com")[0]).toMatchObject({ monitor: true, provider: "Better Stack" });
    expect(statusPageLinks(`<a href="https://status.calendly.com">Calendly status</a>`, "cal.com")).toHaveLength(0);
    expect(statusPageLinks(`<a href="https://www.statuspage.io/pricing">Statuspage</a>`, "acme.com")).toHaveLength(0);
    expect(statusPageLinks(`<a href="https://twitter.com/acme/status/123">Tweet</a>`, "acme.com")).toHaveLength(0);
    expect(statusPageLinks(`<script>var u="https://status.acme.com"</script>`, "acme.com")).toHaveLength(0);
  });

  it("reads an incident.io page whose <title> sits ~100KB in (linearstatus.com)", () => {
    const body = `<html><head>${"<link rel=\"preload\" as=\"image\" href=\"/x.png\"/>".repeat(2500)}<title>Linear Status</title></head><body></body></html>`;
    expect(classifyStatusProbe(probe(200, body))).toBe("confirmed");
  });

  it("classifies a fetched page", () => {
    expect(classifyStatusProbe(probe(200, STATUS_BODY))).toBe("confirmed");
    expect(classifyStatusProbe(probe(200, "<html><head><title>Acme - home</title></head><body>Welcome</body></html>"))).toBe("not_status");
    expect(classifyStatusProbe(probe(404))).toBe("not_status");
    expect(classifyStatusProbe(probe(403))).toBe("unreadable");
    expect(classifyStatusProbe(probe(0))).toBe("unreadable");
  });

  it("uptime_monitoring PASSes on a monitor's status page that opens, not on the monitor's name", async () => {
    const html = page(`<footer><a href="https://acme.betteruptime.com">Status</a></footer>`);
    const ev = await statusEvidence(html, "acme.com", async () => probe(200, STATUS_BODY));
    expect(uptimeMonitoringVerdict(ev, html).status).toBe("PASS");

    const mention = page(`<p>We monitor with Pingdom and UptimeRobot, and publish on statuspage.io.</p>`);
    const none = await statusEvidence(mention, "acme.com", async () => probe(200, STATUS_BODY));
    expect(uptimeMonitoringVerdict(none, mention).status).toBe("WARN");
  });

  it("uptime_monitoring is INCONCLUSIVE for a hand-updatable status page or one that cannot be opened", async () => {
    const own = page(`<a href="https://status.acme.com">Status</a>`);
    const confirmed = await statusEvidence(own, "acme.com", async () => probe(200, STATUS_BODY));
    expect(uptimeMonitoringVerdict(confirmed, own).status).toBe("INCONCLUSIVE");
    resetStatusPageCache();
    const statuspage = page(`<a href="https://acme.statuspage.io">Status</a>`);
    const hosted = await statusEvidence(statuspage, "acme.com", async () => probe(200, STATUS_BODY));
    expect(uptimeMonitoringVerdict(hosted, statuspage).status).toBe("INCONCLUSIVE");
    resetStatusPageCache();
    const blocked = await statusEvidence(own, "acme.com", async () => probe(403));
    expect(uptimeMonitoringVerdict(blocked, own).status).toBe("INCONCLUSIVE");
  });

  it("a status link that is not a status page does not count", async () => {
    const own = page(`<a href="https://status.acme.com">Status</a>`);
    const ev = await statusEvidence(own, "acme.com", async () => probe(200, "<html><head><title>Acme home</title></head><body>hi</body></html>"));
    expect(ev.confirmed).toBeNull();
    expect(ev.unreadable).toBeNull();
  });

  it("a status widget loaded from the provider counts without a fetch", async () => {
    const html = page("", `<script src="https://acme.statuspage.io/embed/script.js"></script>`);
    const ev = await statusEvidence(html, "acme.com", async () => { throw new Error("no fetch expected"); });
    expect(ev.confirmed?.how).toBe("widget");
  });
});

describe("email_provider", () => {
  it("PASSes when SPF authorises a transactional provider", () => {
    expect(spfSenders(["\"v=spf1 include:_spf.google.com include:sendgrid.net ~all\""])).toEqual(["SendGrid"]);
    expect(spfSenders(["v=spf1 include:spf.mtasv.net include:amazonses.com -all"])).toEqual(["Postmark", "Amazon SES"]);
    const v = emailProviderVerdict([{ name: "acme.com", lookup: { ok: true, records: ["v=spf1 include:mailgun.org ~all"] } }]);
    expect(v.status).toBe("PASS");
  });
  it("is INCONCLUSIVE, never PASS, for a mailbox-only SPF or a non-SPF TXT naming a provider", () => {
    expect(spfSenders(["v=spf1 include:_spf.google.com ~all", "sendgrid-verification=abc"])).toEqual([]);
    expect(spfSenders(["MS=ms123 include:mailgun.org"])).toEqual([]);
    const v = emailProviderVerdict([{ name: "acme.com", lookup: { ok: true, records: ["v=spf1 include:_spf.google.com ~all"] } }]);
    expect(v.status).toBe("INCONCLUSIVE");
    expect(emailProviderVerdict([{ name: "acme.com", lookup: { ok: false, records: [] } }]).status).toBe("INCONCLUSIVE");
  });
});

describe("bnpl_options", () => {
  it("PASSes on a BNPL script, element or pay-later wording", () => {
    expect(bnplVerdict(page("", `<script src="https://js.klarna.com/web-sdk/v1/klarna.js"></script>`)).status).toBe("PASS");
    expect(bnplVerdict(page(`<afterpay-placement data-amount="49.00"></afterpay-placement>`)).status).toBe("PASS");
    expect(bnplVerdict(page(`<p>Pay in 3 interest-free instalments with Klarna.</p>`)).status).toBe("PASS");
  });
  it("does not PASS on 'affirm' as a word, or Klarna in a news story or a script string", () => {
    expect(bnplVerdict(page(`<p>We affirm our commitment to customers.</p><p>Klarna reported results today.</p><script>var p="afterpay"</script>`)).status).toBe("WARN");
  });
});

describe("crypto_payments", () => {
  it("PASSes on a crypto checkout or 'we accept bitcoin'", () => {
    expect(cryptoPaymentsVerdict(page(`<a href="https://commerce.coinbase.com/checkout/abc">Pay with crypto</a>`)).status).toBe("PASS");
    expect(cryptoPaymentsVerdict(page(`<p>We accept Bitcoin and USDC.</p>`)).status).toBe("PASS");
  });
  it("does not PASS on bitcoin in an article", () => {
    expect(cryptoPaymentsVerdict(page(`<article><h1>Bitcoin hits a new high</h1><p>Ethereum also rose.</p></article>`)).status).toBe("WARN");
  });
});

describe("wallet_payments", () => {
  it("PASSes on a wallet SDK, button or a listed wallet", () => {
    expect(walletVerdict(page("", `<script src="https://pay.google.com/gp/p/js/pay.js"></script>`)).status).toBe("PASS");
    expect(walletVerdict(page(`<apple-pay-button buttonstyle="black"></apple-pay-button>`)).status).toBe("PASS");
    expect(walletVerdict(page(`<img src="/pay.svg" alt="Apple Pay">`)).status).toBe("PASS");
  });
  it("does not PASS on a CSS class or a config key", () => {
    expect(walletVerdict(page(`<i class="icon-googlepay"></i><script>window.cfg={apple_pay:false}</script>`)).status).toBe("WARN");
  });
});

describe("amazon_app_store", () => {
  it("PASSes on a link to an Appstore listing", () => {
    expect(amazonAppstoreVerdict(page(`<a href="https://www.amazon.com/gp/mas/dl/android?p=com.acme.app">Get it</a>`)).status).toBe("PASS");
    expect(amazonAppstoreVerdict(page(`<a href="https://www.amazon.co.uk/Acme-App/dp/B0ABCDEFGH">Download on the Amazon Appstore</a>`)).status).toBe("PASS");
  });
  it("is not PASS on the phrase without a link, or on a link to a book", () => {
    expect(amazonAppstoreVerdict(page(`<p>Coming soon to the Amazon Appstore.</p>`)).status).toBe("INCONCLUSIVE");
    expect(amazonAppstoreVerdict(page(`<a href="https://www.amazon.com/Book/dp/B0ABCDEFGH">Buy our book</a>`)).status).toBe("WARN");
  });
});

describe("compliance_certifications", () => {
  it("finds a claim in readable text or a badge's alt text", () => {
    expect(complianceClaim(page(`<p>Acme is SOC 2 Type II certified.</p>`))).toContain("SOC 2");
    expect(complianceClaim(page(`<img src="/b.png" alt="ISO 27001 certified">`))).toContain("ISO 27001");
  });
  it("ignores a CSS class, a script and a comment", () => {
    expect(complianceClaim(page(`<div class="soc2-badge"></div><script>var x="iso27001"</script><!-- SOC 2 -->`))).toBeNull();
  });
});

describe("social links", () => {
  it("counts profile links", () => {
    expect(linkedSocialProfiles(page(`<a href="https://x.com/acme">X</a><a href="https://www.linkedin.com/company/acme/">LinkedIn</a><a href="https://github.com/acme">GitHub</a>`))).toEqual(["X / Twitter", "LinkedIn", "GitHub"]);
  });
  it("counts profiles the site declares in JSON-LD sameAs (atlassian.com)", () => {
    expect(linkedSocialProfiles(page("", `<script type="application/ld+json">{"@type":"Organization","sameAs":["https://x.com/Atlassian","https://www.linkedin.com/company/atlassian/"]}</script>`))).toEqual(["X / Twitter", "LinkedIn"]);
  });
  it("does not count embeds, share intents, scripts or GitHub's own pages", () => {
    const html = page(`<iframe src="https://www.youtube.com/embed/abc"></iframe><a href="https://twitter.com/intent/tweet?text=hi">Share</a><a href="https://github.com/login">Sign in</a><script src="https://www.youtube.com/iframe_api"></script>`);
    expect(linkedSocialProfiles(html)).toEqual([]);
  });
});

describe("review platforms and Product Hunt", () => {
  it("counts a listing link or the platform's widget", () => {
    expect(reviewPlatformEvidence(page(`<a href="https://www.trustpilot.com/review/acme.com">Reviews</a>`)).map((e) => e.platform)).toEqual(["Trustpilot"]);
    expect(reviewPlatformEvidence(page("", `<script src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"></script>`)).map((e) => e.platform)).toEqual(["Trustpilot"]);
    expect(reviewPlatformEvidence(page(`<a href="https://www.g2.com/products/acme/reviews">G2</a>`)).map((e) => e.platform)).toEqual(["G2"]);
  });
  it("does not count the name in prose, a platform's homepage or a script string", () => {
    expect(reviewPlatformEvidence(page(`<p>Unlike tools rated on Trustpilot and Capterra, we...</p><a href="https://www.g2.com/">G2</a><script>var u="https://www.trustpilot.com/review/x"</script>`))).toEqual([]);
  });
  it("Product Hunt: a listing link or a launch statement, not the name alone", () => {
    expect(productHuntVerdict(page(`<a href="https://www.producthunt.com/posts/acme">PH</a>`)).status).toBe("PASS");
    expect(productHuntVerdict(page(`<p>#1 Product of the Day on Product Hunt</p>`)).status).toBe("PASS");
    expect(productHuntVerdict(page(`<p>We read Product Hunt every morning.</p>`)).status).toBe("WARN");
  });
});

describe("trust-brand prose claims", () => {
  it("investor backing: named backers, not 'accelerate' or an investor-relations link", () => {
    expect(proseClaimVerdict(page(`<p>Backed by Y Combinator and Index Ventures.</p>`), INVESTOR_CLAIM, "x", "w").status).toBe("PASS");
    expect(proseClaimVerdict(page(`<p>Basecamp is designed, built, and backed by 37signals.</p>`), INVESTOR_CLAIM, "x", "w").status).toBe("WARN");
    expect(proseClaimVerdict(page(`<p>Accelerate your workflow.</p><a href="/investors">Investor relations</a><script>var s="series-a"</script>`), INVESTOR_CLAIM, "x", "w").status).toBe("WARN");
  });
  it("awards: a statement, not 'rewards' or a class name", () => {
    expect(proseClaimVerdict(page(`<p>Winner of the 2025 UK Tech Award.</p>`), AWARD_CLAIM, "x", "w").status).toBe("PASS");
    expect(proseClaimVerdict(page(`<p>Earn rewards on every order.</p><div class="award-icon"></div>`), AWARD_CLAIM, "x", "w").status).toBe("WARN");
  });
  it("conference speaking: a talk at an event, not 'talk to sales'", () => {
    expect(proseClaimVerdict(page(`<p>Our CTO is speaking at KubeCon Europe.</p>`), CONFERENCE_CLAIM, "x", "w").status).toBe("PASS");
    expect(proseClaimVerdict(page(`<p>Talk to our team at any time.</p>`), CONFERENCE_CLAIM, "x", "w").status).toBe("WARN");
  });
  it("GitHub organisation: a link to an account, not 'open source' in a sentence", () => {
    expect(githubOrgLink(page(`<a href="https://github.com/acme">GitHub</a>`))).toContain("github.com/acme");
    expect(githubOrgLink(page(`<p>We love open source.</p><a href="https://github.com/features">Features</a>`))).toBeNull();
  });
  it("public roadmap: a board link or the words, not 'productboard' in a script", () => {
    expect(roadmapEvidence(page(`<a href="https://acme.canny.io/">Feedback</a>`))).toContain("canny.io");
    expect(roadmapEvidence(page(`<p>See our public roadmap.</p>`))).toContain("public roadmap");
    expect(roadmapEvidence(page(`<script>var x="productboard"</script><p>Product teams love roadmaps of all kinds; we compared them.</p>`))).toBeNull();
  });
});
